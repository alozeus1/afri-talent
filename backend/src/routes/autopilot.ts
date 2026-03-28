// ─────────────────────────────────────────────────────────────────────────────
// Autopilot API — User-facing endpoints for the proactive AI agent
//
// GET  /api/autopilot/status    — Agent status, pending apply packs, stats
// GET  /api/autopilot/matches   — AI-scored job matches for the user
// POST /api/autopilot/settings  — Enable/disable auto-apply, set thresholds
// POST /api/autopilot/apply     — Trigger on-demand apply pack for a specific job
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";

const router = Router();

// GET /api/autopilot/status — Overview of the proactive agent for this user
router.get(
  "/status",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    try {
      const [
        subscription,
        savedSearchCount,
        totalAlerts,
        pendingAlerts,
        recentApplications,
        profile,
      ] = await Promise.all([
        prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } }),
        prisma.savedSearch.count({ where: { userId, alertEnabled: true } }),
        prisma.jobAlert.count({ where: { userId } }),
        prisma.jobAlert.count({ where: { userId, sentAt: null } }),
        prisma.application.count({
          where: { candidateId: userId, createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
        prisma.candidateProfile.findUnique({
          where: { userId },
          select: { profileCompleteness: true, skills: true, openToWork: true },
        }),
      ]);

      const isPro = subscription?.plan === "PROFESSIONAL" && subscription?.status === "ACTIVE";

      res.json({
        agent: {
          active: savedSearchCount > 0 || (profile?.openToWork ?? false),
          autoApplyEnabled: isPro,
          tier: subscription?.plan ?? "FREE",
        },
        stats: {
          activeSavedSearches: savedSearchCount,
          totalMatches: totalAlerts,
          pendingMatches: pendingAlerts,
          applicationsThisWeek: recentApplications,
        },
        profile: {
          completeness: profile?.profileCompleteness ?? 0,
          skillCount: profile?.skills.length ?? 0,
          openToWork: profile?.openToWork ?? false,
        },
        recommendations: buildRecommendations(profile, savedSearchCount, isPro),
      });
    } catch (err) {
      logger.error({ err }, "[autopilot] status fetch failed");
      res.status(500).json({ error: "Failed to fetch autopilot status" });
    }
  }
);

// GET /api/autopilot/matches — Paginated list of AI-scored job matches
router.get(
  "/matches",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const minScore = parseInt(req.query.minScore as string) || 0;

    try {
      const where = {
        userId,
        ...(minScore > 0 ? { matchScore: { gte: minScore } } : {}),
      };

      const [matches, total] = await Promise.all([
        prisma.jobAlert.findMany({
          where,
          include: {
            job: {
              select: {
                id: true,
                title: true,
                slug: true,
                location: true,
                type: true,
                seniority: true,
                salaryMin: true,
                salaryMax: true,
                currency: true,
                visaSponsorship: true,
                relocationAssistance: true,
                sourceName: true,
                publishedAt: true,
                employer: { select: { companyName: true } },
              },
            },
          },
          orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.jobAlert.count({ where }),
      ]);

      // Check which jobs the user already applied to
      const appliedJobIds = new Set(
        (
          await prisma.application.findMany({
            where: { candidateId: userId, jobId: { in: matches.map((m) => m.jobId) } },
            select: { jobId: true },
          })
        ).map((a) => a.jobId)
      );

      const enriched = matches.map((m) => ({
        ...m,
        alreadyApplied: appliedJobIds.has(m.jobId),
        companyName: m.job.employer?.companyName ?? m.job.sourceName ?? null,
      }));

      res.json({
        matches: enriched,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      logger.error({ err }, "[autopilot] matches fetch failed");
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  }
);

// POST /api/autopilot/apply — On-demand apply pack for a specific job
const applySchema = z.object({
  jobId: z.string().uuid(),
});

router.post(
  "/apply",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const parsed = applySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      return;
    }

    const { jobId } = parsed.data;

    try {
      // Check job exists and is published
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job || job.status !== "PUBLISHED") {
        res.status(404).json({ error: "Job not found or not available" });
        return;
      }

      // Check not already applied
      const existingApp = await prisma.application.findFirst({
        where: { jobId, candidateId: userId },
      });
      if (existingApp) {
        res.status(400).json({ error: "Already applied to this job" });
        return;
      }

      // Get profile
      const profile = await prisma.candidateProfile.findUnique({
        where: { userId },
        include: { resumes: { where: { isActive: true }, take: 1 } },
      });
      if (!profile) {
        res.status(400).json({ error: "Complete your profile first" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const companyName =
        job.employerId
          ? (await prisma.employer.findUnique({ where: { id: job.employerId }, select: { companyName: true } }))?.companyName ?? job.sourceName ?? "the company"
          : job.sourceName ?? "the company";

      // Generate AI cover letter
      const clResult = await generateQuickCoverLetter({
        candidateName: user?.name ?? "Candidate",
        headline: profile.headline,
        skills: profile.skills,
        bio: profile.bio,
        yearsExperience: profile.yearsExperience,
        jobTitle: job.title,
        companyName,
        jobDescription: job.description,
      });

      // Create application
      const application = await prisma.application.create({
        data: {
          jobId,
          candidateId: userId,
          cvUrl: profile.resumes[0]?.s3Key ?? null,
          coverLetter: clResult.coverLetter,
          notes: `[AI-Assisted Application] Cover letter source: ${clResult.source}`,
          status: "PENDING",
        },
        include: {
          job: { select: { title: true, slug: true } },
        },
      });

      res.status(201).json({
        application,
        coverLetterSource: clResult.source,
        message: "Application submitted with AI-generated cover letter",
      });
    } catch (err) {
      logger.error({ jobId, err }, "[autopilot] on-demand apply failed");
      res.status(500).json({ error: "Failed to generate application" });
    }
  }
);

// Helper: generate personalized recommendations
function buildRecommendations(
  profile: { profileCompleteness: number; skills: string[]; openToWork: boolean } | null,
  savedSearchCount: number,
  isPro: boolean
): string[] {
  const recs: string[] = [];

  if (!profile) {
    recs.push("Complete your candidate profile to enable AI job matching");
    return recs;
  }

  if (profile.profileCompleteness < 50) {
    recs.push("Improve your profile completeness to get better matches (currently " + profile.profileCompleteness + "%)");
  }

  if (profile.skills.length < 3) {
    recs.push("Add more skills to your profile for more accurate matching");
  }

  if (!profile.openToWork) {
    recs.push("Enable 'Open to Work' to receive proactive job matches");
  }

  if (savedSearchCount === 0) {
    recs.push("Create a saved search with alerts to get notified about new matching jobs");
  }

  if (!isPro) {
    recs.push("Upgrade to Professional for AI auto-apply — the agent applies to high-match jobs while you sleep");
  }

  if (recs.length === 0) {
    recs.push("Your AI agent is actively monitoring jobs and will notify you of matches");
  }

  return recs;
}

export default router;
