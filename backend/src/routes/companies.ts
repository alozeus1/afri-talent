// ─────────────────────────────────────────────────────────────────────────────
// Company Profiles & Reviews API Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import { employerBadgeLabel } from "../lib/trust/risk.js";
import { helpfulVoteLimiter } from "../middleware/security.js";
import { moderationData, updateCompanyRatings } from "../lib/reviews/ratings.js";

const router = Router();

// Validation schemas
const ModerateReviewSchema = z.object({
  approved: z.boolean(),
});

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

// Fields a public review card needs. Never exposes the reviewer identity.
const publicReviewSelect = {
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
} satisfies Prisma.CompanyReviewSelect;

// Employer profiles (self-serve hiring accounts) have no Company row of their
// own. Reviews for them are stored against a "shadow" Company that shares the
// employer's id, created lazily on the first review. The list and detail
// endpoints below merge that shadow row back into the employer profile.
async function resolveReviewableCompanyId(id: string): Promise<string | null> {
  const company = await prisma.company.findUnique({ where: { id }, select: { id: true } });
  if (company) return company.id;

  const employer = await prisma.employer.findUnique({
    where: { id },
    select: { id: true, companyName: true, website: true, location: true },
  });
  if (!employer) return null;

  const shadow = await prisma.company.upsert({
    where: { id: employer.id },
    create: {
      id: employer.id,
      name: employer.companyName,
      website: employer.website,
      headquarters: employer.location,
    },
    update: {},
    select: { id: true },
  });
  return shadow.id;
}

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

    const [companies, employers] = await Promise.all([
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
      }),
      prisma.employer.findMany({
        where: {
          ...(search
            ? {
                OR: [
                  { companyName: { contains: search, mode: "insensitive" } },
                  { location: { contains: search, mode: "insensitive" } },
                  { website: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          trustProfile: true,
          user: { select: { deletedAt: true } },
          _count: { select: { jobs: { where: { status: "PUBLISHED" } } } },
        },
        orderBy: { companyName: "asc" },
      }),
    ]);

    // Truth-first: only claim an employer hires from Africa when at least one
    // of its published jobs actually does.
    const africaGroups = employers.length
      ? await prisma.job.groupBy({
          by: ["employerId"],
          where: {
            employerId: { in: employers.map((e) => e.id) },
            status: "PUBLISHED",
            hiresFromAfrica: true,
          },
          _count: { _all: true },
        })
      : [];
    const africaEmployerIds = new Set(africaGroups.map((g) => g.employerId));

    // Shadow companies (same id as an employer) only carry reviews; surface
    // their ratings on the employer card instead of listing them twice.
    const employerIds = new Set(employers.map((e) => e.id));
    const shadowById = new Map(
      companies.filter((c) => employerIds.has(c.id)).map((c) => [c.id, c]),
    );

    const normalizedCompanies = companies.filter((c) => !employerIds.has(c.id)).map((company) => ({
      ...company,
      companyName: company.name,
      headquarters: company.headquarters,
      verified: Boolean(company.verifiedAt),
      trustBadge: null,
      profileType: "COMPANY" as const,
      jobCount: 0,
    }));

    // Erased (soft-deleted) accounts are no longer live employers. They stay in
    // employerIds above so their review-only shadow company is hidden too.
    const normalizedEmployers = employers.filter((employer) => !employer.user?.deletedAt).map((employer) => ({
      id: employer.id,
      companyName: employer.companyName,
      industry: null,
      headquarters: employer.location,
      website: employer.website,
      size: null,
      hiresFromAfrica: africaEmployerIds.has(employer.id),
      verified: Boolean(employer.trustProfile?.postingEligibility),
      trustBadge: employer.trustProfile
        ? employerBadgeLabel(employer.trustProfile.verificationLevel)
        : "Unverified employer",
      ratingAggregate: shadowById.get(employer.id)?.ratingAggregate ?? null,
      _count: { reviews: shadowById.get(employer.id)?._count.reviews ?? 0 },
      profileType: "EMPLOYER" as const,
      jobCount: employer._count.jobs,
      logoUrl: employer.logoUrl,
      brandColor: employer.brandColor,
      accentColor: employer.accentColor,
    }));

    const allCompanies = [...normalizedEmployers, ...normalizedCompanies].sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if ((a.jobCount ?? 0) !== (b.jobCount ?? 0)) return (b.jobCount ?? 0) - (a.jobCount ?? 0);
      return a.companyName.localeCompare(b.companyName);
    });
    const total = allCompanies.length;
    const pagedCompanies = allCompanies.slice((page - 1) * limit, page * limit);

    res.json({
      companies: pagedCompanies,
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
    const [company, employer] = await Promise.all([
      prisma.company.findUnique({
        where: { id },
        include: {
          ratingAggregate: true,
          reviews: {
            where: { isApproved: true },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: publicReviewSelect,
          },
        },
      }),
      prisma.employer.findUnique({
        where: { id },
        include: {
          trustProfile: true,
          _count: { select: { jobs: { where: { status: "PUBLISHED" } } } },
        },
      }),
    ]);

    if (employer) {
      const africaJobCount = await prisma.job.count({
        where: { employerId: employer.id, status: "PUBLISHED", hiresFromAfrica: true },
      });

      return res.json({
        company: {
          id: employer.id,
          companyName: employer.companyName,
          name: employer.companyName,
          industry: null,
          headquarters: employer.location,
          website: employer.website,
          bio: employer.bio,
          size: null,
          hiresFromAfrica: africaJobCount > 0,
          verified: Boolean(employer.trustProfile?.postingEligibility),
          trustBadge: employer.trustProfile
            ? employerBadgeLabel(employer.trustProfile.verificationLevel)
            : "Unverified employer",
          // Reviews live on the employer's shadow Company row, if any.
          ratingAggregate: company?.ratingAggregate ?? null,
          reviews: company?.reviews ?? [],
          jobCount: employer._count.jobs,
          profileType: "EMPLOYER",
          logoUrl: employer.logoUrl,
          brandColor: employer.brandColor,
          accentColor: employer.accentColor,
        },
      });
    }

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

    res.json({
      company: {
        ...company,
        companyName: company.name,
        bio: company.description,
        logoUrl: company.logo,
        trustBadge: null,
        profileType: "COMPANY",
        jobCount,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

// GET /api/companies/:id/reviews - Get paginated reviews for a company
router.get("/:id/reviews", optionalAuth, async (req, res) => {
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
        select: publicReviewSelect,
      }),
      prisma.companyReview.count({ where: { companyId: id, isApproved: true } }),
    ]);

    // Let a signed-in reader see which reviews they already marked helpful.
    let votedIds = new Set<string>();
    if (req.user && reviews.length > 0) {
      const votes = await prisma.companyReviewHelpfulVote.findMany({
        where: { userId: req.user.userId, reviewId: { in: reviews.map((r) => r.id) } },
        select: { reviewId: true },
      });
      votedIds = new Set(votes.map((v) => v.reviewId));
    }

    res.json({
      reviews: reviews.map((r) => ({ ...r, votedByViewer: votedIds.has(r.id) })),
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
    // Directory company, or an employer profile (reviewed via its shadow row).
    const reviewableId = await resolveReviewableCompanyId(companyId);
    if (!reviewableId) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Check if user already reviewed this company
    const existingReview = await prisma.companyReview.findFirst({
      where: { companyId: reviewableId, userId },
    });
    if (existingReview) {
      return res.status(409).json({ error: "You have already reviewed this company" });
    }

    // Create review (requires approval)
    const review = await prisma.companyReview.create({
      data: {
        companyId: reviewableId,
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
// One vote per user per review (CompanyReviewHelpfulVote unique userId+reviewId).
// Re-voting is idempotent: it returns the current count with alreadyVoted.
router.post("/:id/reviews/:reviewId/helpful", authenticate, helpfulVoteLimiter, async (req, res) => {
  const { id: companyId, reviewId } = req.params;
  const userId = req.user!.userId;

  try {
    // Scope to the company in the URL and to approved reviews only.
    const review = await prisma.companyReview.findFirst({
      where: { id: reviewId, companyId, isApproved: true },
      select: { id: true, userId: true, helpfulCount: true },
    });
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }
    if (review.userId === userId) {
      res.status(400).json({ error: "You can't mark your own review as helpful" });
      return;
    }

    try {
      const [, updated] = await prisma.$transaction([
        prisma.companyReviewHelpfulVote.create({ data: { userId, reviewId } }),
        prisma.companyReview.update({
          where: { id: reviewId },
          data: { helpfulCount: { increment: 1 } },
          select: { helpfulCount: true },
        }),
      ]);
      res.json({ success: true, voted: true, alreadyVoted: false, helpfulCount: updated.helpfulCount });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.json({ success: true, voted: true, alreadyVoted: true, helpfulCount: review.helpfulCount });
        return;
      }
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to mark review as helpful" });
  }
});

// DELETE /api/companies/:id/reviews/:reviewId/helpful - Withdraw a helpful vote
router.delete("/:id/reviews/:reviewId/helpful", authenticate, helpfulVoteLimiter, async (req, res) => {
  const { id: companyId, reviewId } = req.params;
  const userId = req.user!.userId;

  try {
    const review = await prisma.companyReview.findFirst({
      where: { id: reviewId, companyId },
      select: { id: true },
    });
    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const helpfulCount = await prisma.$transaction(async (tx) => {
      const removed = await tx.companyReviewHelpfulVote.deleteMany({ where: { userId, reviewId } });
      if (removed.count > 0) {
        await tx.companyReview.updateMany({
          where: { id: reviewId, helpfulCount: { gt: 0 } },
          data: { helpfulCount: { decrement: 1 } },
        });
      }
      const current = await tx.companyReview.findUnique({ where: { id: reviewId }, select: { helpfulCount: true } });
      return current?.helpfulCount ?? 0;
    });

    res.json({ success: true, voted: false, helpfulCount });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove helpful vote" });
  }
});

// Admin: Approve/reject review
router.patch("/:id/reviews/:reviewId/moderate", authenticate, authorize("ADMIN"), async (req, res) => {
  const { reviewId } = req.params;
  const parsed = ModerateReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  try {
    const review = await prisma.companyReview.update({
      where: { id: reviewId },
      data: moderationData(parsed.data.approved),
    });

    // Recompute on both approve and reject so un-approving a review removes
    // it from the aggregate.
    await updateCompanyRatings(review.companyId);

    res.json({ review });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      res.status(404).json({ error: "Review not found" });
      return;
    }
    res.status(500).json({ error: "Failed to moderate review" });
  }
});

export default router;
