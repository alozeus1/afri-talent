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

// GET /api/employer/onboarding - onboarding checklist and activation progress
router.get("/onboarding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        companyName: true,
        website: true,
        bio: true,
        location: true,
      },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const [jobCount, publishedJobs, hasBilling] = await Promise.all([
      prisma.job.count({ where: { employerId: employer.id } }),
      prisma.job.count({ where: { employerId: employer.id, status: JobStatus.PUBLISHED } }),
      prisma.subscription.findUnique({
        where: { userId: req.user!.userId },
        select: { plan: true, status: true },
      }),
    ]);

    const checklist = [
      {
        key: "company_profile",
        label: "Complete company profile",
        done: Boolean(employer.companyName && employer.location && employer.bio),
      },
      {
        key: "website",
        label: "Add verified company website",
        done: Boolean(employer.website),
      },
      {
        key: "first_job",
        label: "Publish first job",
        done: publishedJobs > 0,
      },
      {
        key: "billing",
        label: "Activate billing plan",
        done: Boolean(hasBilling && hasBilling.plan !== "FREE" && hasBilling.status === "ACTIVE"),
      },
    ];

    const completedCount = checklist.filter((item) => item.done).length;
    const completionPct = Math.round((completedCount / checklist.length) * 100);

    res.json({
      checklist,
      completionPct,
      stats: {
        jobCount,
        publishedJobs,
      },
      recommendation:
        publishedJobs === 0
          ? "Create and publish your first role to start receiving candidates."
          : "Review analytics and improve conversion with a stronger employer brand.",
    });
  } catch (error) {
    logger.error({ error }, "Employer onboarding status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employer/analytics/advanced - conversion funnel + posting performance + pipeline metrics
router.get("/analytics/advanced", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const [jobs, applications] = await Promise.all([
      prisma.job.findMany({
        where: { employerId: employer.id },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          publishedAt: true,
        },
      }),
      prisma.application.findMany({
        where: { job: { employerId: employer.id } },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          jobId: true,
        },
      }),
    ]);

    const publishedJobs = jobs.filter((job) => job.status === JobStatus.PUBLISHED);
    const inReview = applications.filter((item) => item.status === "REVIEWING").length;
    const shortlisted = applications.filter((item) => item.status === "SHORTLISTED").length;
    const accepted = applications.filter((item) => item.status === "ACCEPTED").length;
    const rejected = applications.filter((item) => item.status === "REJECTED").length;

    const funnel = [
      { step: "jobs_posted", count: jobs.length },
      { step: "jobs_published", count: publishedJobs.length },
      { step: "applications_received", count: applications.length },
      { step: "candidates_reviewing", count: inReview },
      { step: "candidates_shortlisted", count: shortlisted },
      { step: "candidates_hired", count: accepted },
    ].map((row, index, arr) => ({
      ...row,
      conversionFromPrevious:
        index === 0 || arr[index - 1].count === 0
          ? null
          : Number(((row.count / arr[index - 1].count) * 100).toFixed(2)),
    }));

    const applicationsByJob = new Map<string, typeof applications>();
    for (const app of applications) {
      const list = applicationsByJob.get(app.jobId) || [];
      list.push(app);
      applicationsByJob.set(app.jobId, list);
    }

    const postingPerformance = jobs.map((job) => {
      const jobApplications = applicationsByJob.get(job.id) || [];
      const sortedByCreated = [...jobApplications].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const firstApplicationAt = sortedByCreated[0]?.createdAt || null;
      const timeToFirstApplicationHours =
        firstApplicationAt && job.publishedAt
          ? Number(
              ((firstApplicationAt.getTime() - job.publishedAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
            )
          : null;

      const shortlistCount = jobApplications.filter((item) => item.status === "SHORTLISTED").length;
      const acceptanceCount = jobApplications.filter((item) => item.status === "ACCEPTED").length;

      return {
        jobId: job.id,
        title: job.title,
        status: job.status,
        applicationCount: jobApplications.length,
        shortlistRate:
          jobApplications.length > 0
            ? Number(((shortlistCount / jobApplications.length) * 100).toFixed(2))
            : 0,
        acceptanceRate:
          jobApplications.length > 0
            ? Number(((acceptanceCount / jobApplications.length) * 100).toFixed(2))
            : 0,
        timeToFirstApplicationHours,
      };
    });

    const reviewedDurationsHours = applications
      .filter((item) => item.status !== "PENDING")
      .map((item) => (item.updatedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60))
      .filter((hours) => Number.isFinite(hours) && hours >= 0);

    const avgReviewTimeHours =
      reviewedDurationsHours.length > 0
        ? Number(
            (reviewedDurationsHours.reduce((sum, value) => sum + value, 0) / reviewedDurationsHours.length).toFixed(2),
          )
        : null;

    res.json({
      funnel,
      postingPerformance,
      candidatePipeline: {
        total: applications.length,
        pending: applications.filter((item) => item.status === "PENDING").length,
        reviewing: inReview,
        shortlisted,
        accepted,
        rejected,
        avgReviewTimeHours,
      },
    });
  } catch (error) {
    logger.error({ error }, "Employer advanced analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
