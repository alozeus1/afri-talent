// POST /api/skills/career-advisor/analyze — run career analysis, save advice
// GET  /api/skills/career-advisor/history  — fetch past advice sessions
//
// All routes require PROFESSIONAL subscription.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma, Role, SubscriptionPlan } from "@prisma/client";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { analyseCareer } from "../../lib/ai/skills/career-advisor.js";

const router = Router();

const skillsEnabled = process.env.SKILLS_ENABLED !== "false";

function checkSkillsEnabled(res: Response): boolean {
  if (!skillsEnabled) {
    res.status(503).json({ error: "AI Skills are not enabled on this instance" });
    return false;
  }
  return true;
}

const analyzeSchema = z.object({
  targetRole: z.string().min(1).max(200).trim(),
  resumeText: z.string().max(10000).optional(),
});

// ── POST /api/skills/career-advisor/analyze ───────────────────────────────────
router.post(
  "/analyze",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const { targetRole, resumeText: providedResumeText } = analyzeSchema.parse(req.body);
      const userId = req.user!.userId;

      // Resolve resume text
      let resumeText = providedResumeText || "";

      if (!resumeText) {
        const savedResume = await prisma.userResume.findUnique({
          where: { userId },
          select: { rawText: true },
        });
        resumeText = savedResume?.rawText || "";
      }

      // Fetch candidate profile
      const profile = await prisma.candidateProfile.findUnique({
        where: { userId },
        select: {
          skills: true,
          yearsExperience: true,
          headline: true,
          bio: true,
        },
      });

      if (!resumeText && profile) {
        resumeText = [profile.headline, profile.bio, profile.skills.join(", ")]
          .filter(Boolean)
          .join("\n");
      }

      if (!resumeText) {
        res.status(400).json({
          error: "No resume data found. Please save a resume or complete your profile.",
          code: "NO_RESUME",
        });
        return;
      }

      // Pull recent application job titles for context
      const recentApplications = await prisma.application.findMany({
        where: { candidateId: userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { job: { select: { title: true } } },
      });

      const recentJobTitles = recentApplications.map((a) => a.job.title);

      const advice = await analyseCareer({
        resumeText,
        targetRole,
        yearsExperience: profile?.yearsExperience || 0,
        currentSkills: profile?.skills || [],
        recentJobTitles,
      });

      // Persist advice session
      const saved = await prisma.careerAdvice.create({
        data: {
          userId,
          adviceContent: advice as unknown as Prisma.InputJsonValue,
          targetRole,
        },
        select: { id: true, createdAt: true },
      });

      res.json({ advice, sessionId: saved.id, createdAt: saved.createdAt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[career-advisor] analyze failed");
      res.status(500).json({ error: "Failed to run career analysis" });
    }
  }
);

// ── GET /api/skills/career-advisor/history ────────────────────────────────────
router.get(
  "/history",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const userId = req.user!.userId;
      const limit = Math.min(Number(req.query.limit) || 10, 20);

      const sessions = await prisma.careerAdvice.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          targetRole: true,
          adviceContent: true,
          createdAt: true,
        },
      });

      res.json({ sessions, total: sessions.length });
    } catch (error) {
      logger.error({ error, userId: req.user?.userId }, "[career-advisor] history fetch failed");
      res.status(500).json({ error: "Failed to fetch career advice history" });
    }
  }
);

export default router;
