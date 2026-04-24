import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ApplicationStatus, Role } from "@prisma/client";
import { getCandidateRecommendationFeed, getCandidateRetentionSummary } from "../lib/candidate-retention.js";

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
    const recommendations = await getCandidateRecommendationFeed(req.user!.userId, 20);
    res.json(recommendations);
  } catch (error) {
    console.error("Job recommendations error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/retention-summary", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const summary = await getCandidateRetentionSummary(req.user!.userId);
    if (!summary) {
      res.status(404).json({ error: "Candidate retention summary unavailable" });
      return;
    }

    res.json(summary);
  } catch (error) {
    console.error("Candidate retention summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
