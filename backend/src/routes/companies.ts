// ─────────────────────────────────────────────────────────────────────────────
// Company Profiles & Reviews API Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";

const router = Router();

// Validation schemas
const CompanyReviewSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  cultureRating: z.number().int().min(1).max(5).optional(),
  salaryRating: z.number().int().min(1).max(5).optional(),
  workLifeRating: z.number().int().min(1).max(5).optional(),
  managementRating: z.number().int().min(1).max(5).optional(),
  growthRating: z.number().int().min(1).max(5).optional(),
  title: z.string().min(10).max(200),
  pros: z.string().min(20).max(2000),
  cons: z.string().min(20).max(2000),
  advice: z.string().max(1000).optional(),
  isCurrentEmployee: z.boolean().default(false),
  employmentStatus: z.enum(["full-time", "part-time", "contract", "intern", "freelance"]).optional(),
  jobTitle: z.string().max(100).optional(),
  yearsAtCompany: z.number().int().min(0).max(50).optional(),
});

// GET /api/companies - List companies with ratings
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const search = req.query.search as string;
  const hiresFromAfrica = req.query.hiresFromAfrica === "true";

  try {
    const where: Record<string, unknown> = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { industry: { contains: search, mode: "insensitive" } },
      ];
    }

    if (hiresFromAfrica) {
      where.hiresFromAfrica = true;
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          ratingAggregate: true,
          _count: { select: { reviews: true } },
        },
        orderBy: [
          { ratingAggregate: { averageOverall: "desc" } },
          { name: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.company.count({ where }),
    ]);

    res.json({
      companies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

// GET /api/companies/:id - Get company details with reviews
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        ratingAggregate: true,
        reviews: {
          where: { isApproved: true },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            overallRating: true,
            cultureRating: true,
            salaryRating: true,
            workLifeRating: true,
            title: true,
            pros: true,
            cons: true,
            isCurrentEmployee: true,
            jobTitle: true,
            helpfulCount: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Get job count from this company
    const jobCount = await prisma.job.count({
      where: {
        OR: [
          { sourceName: { contains: company.name, mode: "insensitive" } },
          { employer: { companyName: { contains: company.name, mode: "insensitive" } } },
        ],
        status: "PUBLISHED",
      },
    });

    res.json({ company: { ...company, jobCount } });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

// GET /api/companies/:id/reviews - Get paginated reviews for a company
router.get("/:id/reviews", async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
  const sort = (req.query.sort as string) || "recent";

  try {
    const orderBy = sort === "helpful" 
      ? { helpfulCount: "desc" as const }
      : { createdAt: "desc" as const };

    const [reviews, total] = await Promise.all([
      prisma.companyReview.findMany({
        where: { companyId: id, isApproved: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          overallRating: true,
          cultureRating: true,
          salaryRating: true,
          workLifeRating: true,
          managementRating: true,
          growthRating: true,
          title: true,
          pros: true,
          cons: true,
          advice: true,
          isCurrentEmployee: true,
          employmentStatus: true,
          jobTitle: true,
          yearsAtCompany: true,
          helpfulCount: true,
          createdAt: true,
        },
      }),
      prisma.companyReview.count({ where: { companyId: id, isApproved: true } }),
    ]);

    res.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// POST /api/companies/:id/reviews - Submit a review
router.post("/:id/reviews", authenticate, authorize("CANDIDATE"), async (req, res) => {
  const userId = req.user!.userId;
  const { id: companyId } = req.params;
  const parsed = CompanyReviewSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  try {
    // Check if company exists
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Check if user already reviewed this company
    const existingReview = await prisma.companyReview.findFirst({
      where: { companyId, userId },
    });
    if (existingReview) {
      return res.status(400).json({ error: "You have already reviewed this company" });
    }

    // Create review (requires approval)
    const review = await prisma.companyReview.create({
      data: {
        companyId,
        userId,
        ...parsed.data,
        isApproved: false, // Requires moderation
      },
    });

    res.status(201).json({ 
      review,
      message: "Review submitted for moderation" 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// POST /api/companies/:id/reviews/:reviewId/helpful - Mark review as helpful
router.post("/:id/reviews/:reviewId/helpful", authenticate, async (req, res) => {
  const { reviewId } = req.params;

  try {
    await prisma.companyReview.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark review as helpful" });
  }
});

// Admin: Approve/reject review
router.patch("/:id/reviews/:reviewId/moderate", authenticate, authorize("ADMIN"), async (req, res) => {
  const { reviewId } = req.params;
  const { approved } = req.body;

  try {
    const review = await prisma.companyReview.update({
      where: { id: reviewId },
      data: { isApproved: approved === true },
    });

    // Update company rating aggregate if approved
    if (approved) {
      await updateCompanyRatings(review.companyId);
    }

    res.json({ review });
  } catch (error) {
    res.status(500).json({ error: "Failed to moderate review" });
  }
});

// Helper: Update company rating aggregates
async function updateCompanyRatings(companyId: string) {
  const reviews = await prisma.companyReview.findMany({
    where: { companyId, isApproved: true },
  });

  if (reviews.length === 0) return;

  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const aggregates = {
    totalReviews: reviews.length,
    averageOverall: avg(reviews.map((r) => r.overallRating)),
    averageCulture: avg(reviews.map((r) => r.cultureRating)),
    averageSalary: avg(reviews.map((r) => r.salaryRating)),
    averageWorkLife: avg(reviews.map((r) => r.workLifeRating)),
    averageManagement: avg(reviews.map((r) => r.managementRating)),
    averageGrowth: avg(reviews.map((r) => r.growthRating)),
    recommendationPct: (reviews.filter((r) => r.overallRating >= 4).length / reviews.length) * 100,
  };

  await prisma.companyRatingAggregate.upsert({
    where: { companyId },
    create: { companyId, ...aggregates },
    update: aggregates,
  });
}

export default router;
