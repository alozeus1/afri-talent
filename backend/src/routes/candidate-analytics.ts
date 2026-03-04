import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role } from "@prisma/client";

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

    // Build OR conditions for matching
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
      // No profile data to match against — return recent published jobs
      const jobs = await prisma.job.findMany({
        where: { status: JobStatus.PUBLISHED },
        include: {
          employer: { select: { companyName: true, location: true } },
        },
        orderBy: { publishedAt: "desc" },
        take: 20,
      });
      res.json(jobs);
      return;
    }

    const jobs = await prisma.job.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        OR: orConditions,
      },
      include: {
        employer: { select: { companyName: true, location: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100, // fetch more so we can sort by match score
    });

    // Compute match score: count of overlapping fields
    const scoredJobs = jobs.map((job) => {
      let score = 0;

      // Skill overlap (tags vs candidate skills)
      if (skills.length > 0) {
        const skillsLower = skills.map((s) => s.toLowerCase());
        const tagsLower = job.tags.map((t) => t.toLowerCase());
        score += tagsLower.filter((t) => skillsLower.includes(t)).length;
      }

      // Target role overlap (title contains target role)
      if (targetRoles.length > 0) {
        const titleLower = job.title.toLowerCase();
        score += targetRoles.filter((r) => titleLower.includes(r.toLowerCase())).length;
      }

      // Target country overlap (eligibleCountries or location)
      if (targetCountries.length > 0) {
        const countriesLower = targetCountries.map((c) => c.toLowerCase());
        const eligibleLower = job.eligibleCountries.map((c) => c.toLowerCase());
        score += eligibleLower.filter((c) => countriesLower.includes(c)).length;
        if (countriesLower.some((c) => job.location.toLowerCase().includes(c))) {
          score += 1;
        }
      }

      return { ...job, matchScore: score };
    });

    // Sort by match score descending, then by publishedAt descending
    scoredJobs.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const aDate = a.publishedAt?.getTime() ?? 0;
      const bDate = b.publishedAt?.getTime() ?? 0;
      return bDate - aDate;
    });

    res.json(scoredJobs.slice(0, 20));
  } catch (error) {
    console.error("Job recommendations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
