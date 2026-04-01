import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role } from "@prisma/client";
import { buildJobSearchWhere, fetchRankedJobs } from "../lib/jobs/search.js";

const router = Router();

// GET /api/candidate-analytics/profile-views — authenticated candidates only.
// Return profile view data: total views (last 30 days), views by week (last 4 weeks), viewer role breakdown.
router.get("/profile-views", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!profile) {
      res.json({ totalViews: 0, viewsByWeek: [], viewerRoleBreakdown: {} });
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const views = await prisma.profileView.findMany({
      where: {
        profileId: profile.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        createdAt: true,
        viewerRole: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const totalViews = views.length;

    // Views by week (last 4 weeks)
    const viewsByWeek: { week: string; count: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);

      const count = views.filter(
        (v) => v.createdAt >= weekStart && v.createdAt < weekEnd
      ).length;

      viewsByWeek.push({
        week: `Week ${i + 1}`,
        count,
      });
    }

    // Viewer role breakdown
    const viewerRoleBreakdown: Record<string, number> = {};
    for (const view of views) {
      const role = view.viewerRole || "unknown";
      viewerRoleBreakdown[role] = (viewerRoleBreakdown[role] || 0) + 1;
    }

    res.json({ totalViews, viewsByWeek, viewerRoleBreakdown });
  } catch (error) {
    console.error("Profile views error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/candidate-analytics/application-funnel — authenticated candidates only.
// Return application funnel: totalApplied, reviewing, shortlisted, accepted, rejected.
router.get("/application-funnel", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [totalApplied, reviewing, shortlisted, accepted, rejected] = await Promise.all([
      prisma.application.count({ where: { candidateId: userId } }),
      prisma.application.count({ where: { candidateId: userId, status: ApplicationStatus.REVIEWING } }),
      prisma.application.count({ where: { candidateId: userId, status: ApplicationStatus.SHORTLISTED } }),
      prisma.application.count({ where: { candidateId: userId, status: ApplicationStatus.ACCEPTED } }),
      prisma.application.count({ where: { candidateId: userId, status: ApplicationStatus.REJECTED } }),
    ]);

    res.json({ totalApplied, reviewing, shortlisted, accepted, rejected });
  } catch (error) {
    console.error("Application funnel error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/candidate-analytics/recommendations — authenticated candidates only.
// Return personalized job recommendations based on skills, targetRoles, and targetCountries.
router.get("/recommendations", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { skills: true, targetRoles: true, targetCountries: true },
    });

    if (!profile) {
      res.json([]);
      return;
    }

    const { skills, targetRoles, targetCountries } = profile;

    const baseWhere = buildJobSearchWhere({});
    const orConditions: any[] = [];

    if (skills.length > 0) {
      orConditions.push({ tags: { hasSome: skills } });
    }

    if (targetRoles.length > 0) {
      for (const role of targetRoles) {
        orConditions.push({ title: { contains: role, mode: "insensitive" } });
      }
    }

    if (targetCountries.length > 0) {
      orConditions.push({ eligibleCountries: { hasSome: targetCountries } });
      for (const country of targetCountries) {
        orConditions.push({ location: { contains: country, mode: "insensitive" } });
      }
    }

    if (orConditions.length === 0) {
      const { jobs } = await fetchRankedJobs({
        where: baseWhere,
        page: 1,
        limit: 20,
        preferenceContext: {
          skills,
          targetRoles,
          targetCountries,
        },
      });
      res.json(jobs);
      return;
    }

    const { jobs } = await fetchRankedJobs({
      where: {
        AND: [
          baseWhere,
          { OR: orConditions },
        ],
      },
      page: 1,
      limit: 20,
      take: 200,
      preferenceContext: {
        skills,
        targetRoles,
        targetCountries,
      },
    });
    res.json(jobs);
  } catch (error) {
    console.error("Job recommendations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
