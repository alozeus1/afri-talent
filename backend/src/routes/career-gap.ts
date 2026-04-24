// POST /api/career-gap/explain — explain and reframe a career gap using AI

import { Router, Request, Response } from "express";
import { z } from "zod";
import { AiRunType, Role } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";
import { explainCareerGap } from "../lib/ai/skills/career-gap-explainer.js";
import { makeMonthlySkillQuota, recordSkillRun } from "../middleware/quotas.js";

const router = Router();

const skillsEnabled = process.env.SKILLS_ENABLED !== "false";

function checkSkillsEnabled(res: Response): boolean {
  if (!skillsEnabled) {
    res.status(503).json({ error: "AI Skills are not enabled on this instance" });
    return false;
  }
  return true;
}

const explainSchema = z.object({
  gapStartDate: z.string().min(1).max(50),
  gapEndDate: z.string().min(1).max(50),
  activities: z.string().max(2000).optional(),
  targetRole: z.string().max(200).optional(),
  resumeText: z.string().max(10000).optional(),
});

// ── POST /api/career-gap/explain ─────────────────────────────────────────────
router.post(
  "/explain",
  authenticate,
  authorize(Role.CANDIDATE),
  makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const { gapStartDate, gapEndDate, activities, targetRole, resumeText } = explainSchema.parse(req.body);

      const result = await explainCareerGap({
        resumeText: resumeText ?? "",
        gapStartDate,
        gapEndDate,
        context: activities,
        targetRole,
      });

      void recordSkillRun(req.user!.userId, AiRunType.CAREER_GAP_EXPLAIN);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[career-gap] explain failed");
      res.status(500).json({ error: "Failed to explain career gap" });
    }
  }
);

export default router;
