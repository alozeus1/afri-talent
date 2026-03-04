import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { JobStatus, Role } from "@prisma/client";
import logger from "../lib/logger.js";

const router = Router();

const updateBrandingSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  website: z.string().url().max(500).optional().or(z.literal("")),
  location: z.string().max(200).optional(),
  bio: z.string().max(5000).optional().or(z.literal("")),
});

// GET /api/employer/analytics - Dashboard analytics
router.get("/analytics", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    const [totalJobs, publishedJobs, totalApplications, applicationsByStatus, recentApplications] = await Promise.all([
      prisma.job.count({ where: { employerId: employer.id } }),
      prisma.job.count({ where: { employerId: employer.id, status: JobStatus.PUBLISHED } }),
      prisma.application.count({
        where: { job: { employerId: employer.id } },
      }),
      prisma.application.groupBy({
        by: ["status"],
        where: { job: { employerId: employer.id } },
        _count: { id: true },
      }),
      prisma.application.findMany({
        where: { job: { employerId: employer.id } },
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          job: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    res.json({
      totalJobs,
      publishedJobs,
      totalApplications,
      applicationsByStatus: applicationsByStatus.map((g) => ({
        status: g.status,
        count: g._count.id,
      })),
      recentApplications,
      viewsByDay: [],
    });
  } catch (error) {
    logger.error({ error }, "Employer analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employer/branding - Get employer branding profile
router.get("/branding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    res.json(employer);
  } catch (error) {
    logger.error({ error }, "Get branding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/employer/branding - Update employer branding
router.put("/branding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const data = updateBrandingSchema.parse(req.body);

    const website = data.website || null;
    const bio = data.bio || null;

    const employer = await prisma.employer.update({
      where: { userId: req.user!.userId },
      data: {
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.location !== undefined && { location: data.location }),
        website,
        bio,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    res.json(employer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Update branding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
