// GET  /api/skills/job-matcher/matches       — top job matches for current user
// POST /api/skills/job-matcher/embed-resume  — re-embed resume on demand
//
// All routes require PROFESSIONAL subscription.

import { Router, Request, Response } from "express";
import { Role, SubscriptionPlan } from "@prisma/client";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { findJobMatches, embedUserResume } from "../../lib/ai/skills/job-matcher.js";

const router = Router();

const skillsEnabled = process.env.SKILLS_ENABLED !== "false";

function checkSkillsEnabled(res: Response): boolean {
  if (!skillsEnabled) {
    res.status(503).json({ error: "AI Skills are not enabled on this instance" });
    return false;
  }
  return true;
}

// ── GET /api/skills/job-matcher/matches ───────────────────────────────────────
router.get(
  "/matches",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const userId = req.user!.userId;
      const limit = Math.min(Number(req.query.limit) || 10, 20);

      // Check if user has a saved resume
      const resume = await prisma.userResume.findUnique({
        where: { userId },
        select: { id: true, rawText: true },
      });

      if (!resume) {
        res.status(400).json({
          error: "Please save a resume first to enable job matching.",
          code: "NO_RESUME",
        });
        return;
      }

      const matches = await findJobMatches(userId, limit);

      res.json({
        matches,
        total: matches.length,
        matchMethod: matches[0]?.matchMethod || "none",
      });
    } catch (error) {
      logger.error({ error, userId: req.user?.userId }, "[job-matcher] matches fetch failed");
      res.status(500).json({ error: "Failed to fetch job matches" });
    }
  }
);

// ── POST /api/skills/job-matcher/embed-resume ─────────────────────────────────
router.post(
  "/embed-resume",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const userId = req.user!.userId;

      const resume = await prisma.userResume.findUnique({
        where: { userId },
        select: { rawText: true },
      });

      if (!resume) {
        res.status(400).json({ error: "No resume found to embed.", code: "NO_RESUME" });
        return;
      }

      await embedUserResume(userId, resume.rawText);

      res.json({ message: "Resume embedded. Job matches will now use semantic similarity." });
    } catch (error) {
      logger.error({ error, userId: req.user?.userId }, "[job-matcher] embed-resume failed");
      res.status(500).json({ error: "Failed to embed resume" });
    }
  }
);

export default router;
