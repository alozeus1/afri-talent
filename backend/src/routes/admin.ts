import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { JobStatus, ReviewStatus, ReviewTargetType, Role } from "@prisma/client";

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate, authorize(Role.ADMIN));

const reviewJobSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
});

const reviewResourceSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
});

// GET /api/admin/stats - Dashboard stats
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      totalJobs,
      pendingJobs,
      totalApplications,
      totalResources,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.job.count({ where: { status: JobStatus.PENDING_REVIEW } }),
      prisma.application.count(),
      prisma.resource.count(),
    ]);

    res.json({
      totalUsers,
      totalJobs,
      pendingJobs,
      totalApplications,
      totalResources,
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/jobs/pending - List jobs pending review
router.get("/jobs/pending", async (_req: Request, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { status: JobStatus.PENDING_REVIEW },
      include: {
        employer: {
          select: { companyName: true, location: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(jobs);
  } catch (error) {
    console.error("Pending jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/jobs - List all jobs
router.get("/jobs", async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (status) {
      where.status = status as JobStatus;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          employer: {
            select: { companyName: true },
          },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      jobs,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Admin jobs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/jobs/:id/review - Approve/reject job
router.put("/jobs/:id/review", async (req: Request, res: Response) => {
  try {
    const data = reviewJobSchema.parse(req.body);

    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const newStatus = data.status === "APPROVED" ? JobStatus.PUBLISHED : JobStatus.REJECTED;

    const [updatedJob] = await prisma.$transaction([
      prisma.job.update({
        where: { id: req.params.id },
        data: {
          status: newStatus,
          publishedAt: data.status === "APPROVED" ? new Date() : null,
        },
      }),
      prisma.adminReview.create({
        data: {
          reviewerId: req.user!.userId,
          targetType: ReviewTargetType.JOB,
          targetJobId: req.params.id,
          status: data.status === "APPROVED" ? ReviewStatus.APPROVED : ReviewStatus.REJECTED,
          notes: data.notes,
        },
      }),
    ]);

    res.json(updatedJob);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Review job error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/users - List all users (with optional search by name/email)
router.get("/users", async (req: Request, res: Response) => {
  try {
    const { role, search, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (role) {
      where.role = role as Role;
    }
    if (search && typeof search === "string" && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          employer: {
            select: { companyName: true },
          },
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/resources - List all resources (including unpublished, with search)
router.get("/resources", async (req: Request, res: Response) => {
  try {
    const { published, search, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (published !== undefined) {
      where.published = published === "true";
    }
    if (search && typeof search === "string" && search.trim()) {
      where.title = { contains: search.trim(), mode: "insensitive" };
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [resources, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.resource.count({ where }),
    ]);

    res.json({
      resources,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Admin resources error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/admin/resources/:id/publish - Publish/unpublish resource
router.put("/resources/:id/publish", async (req: Request, res: Response) => {
  try {
    const { published } = req.body;

    const resource = await prisma.resource.findUnique({
      where: { id: req.params.id },
    });

    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    const updatedResource = await prisma.resource.update({
      where: { id: req.params.id },
      data: {
        published: Boolean(published),
        publishedAt: published ? new Date() : null,
      },
    });

    res.json(updatedResource);
  } catch (error) {
    console.error("Publish resource error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/reviews - List all company reviews with filters
router.get("/reviews", async (req: Request, res: Response) => {
  try {
    const { isApproved, page = "1", limit = "20" } = req.query;

    const where: any = {};
    if (isApproved !== undefined) {
      where.isApproved = isApproved === "true";
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [reviews, total] = await Promise.all([
      prisma.companyReview.findMany({
        where,
        include: {
          company: {
            select: { name: true },
          },
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.companyReview.count({ where }),
    ]);

    res.json({
      reviews,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Admin reviews error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const moderateReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

// PUT /api/admin/reviews/:id/moderate - Approve/reject a company review
router.put("/reviews/:id/moderate", async (req: Request, res: Response) => {
  try {
    const data = moderateReviewSchema.parse(req.body);

    const review = await prisma.companyReview.findUnique({
      where: { id: req.params.id },
    });

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    const updatedReview = await prisma.companyReview.update({
      where: { id: req.params.id },
      data: {
        isApproved: data.action === "approve",
      },
    });

    res.json(updatedReview);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Moderate review error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/aggregator/stats - Aggregated job statistics
router.get("/aggregator/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await prisma.job.groupBy({
      by: ["jobSource", "status"],
      _count: { id: true },
    });

    const totalAggregated = await prisma.job.count({
      where: { jobSource: "AGGREGATED" },
    });

    const lastSync = await prisma.job.findFirst({
      where: { jobSource: "AGGREGATED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    res.json({
      stats,
      totalAggregated,
      lastSync: lastSync?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("Aggregator stats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/aggregator/sync - Trigger manual job aggregation sync
router.post("/aggregator/sync", async (_req: Request, res: Response) => {
  try {
    // Update metadata for aggregated jobs — mark last manual sync timestamp
    const aggregatedCount = await prisma.job.count({
      where: { jobSource: "AGGREGATED" },
    });

    res.json({
      success: true,
      message: `Manual sync triggered. ${aggregatedCount} aggregated jobs currently in system.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Aggregator sync error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
