// POST /api/salary-benchmarks/negotiate — AI-powered salary negotiation guidance

import { Router, Request, Response } from "express";
import { z } from "zod";
import { AiRunType, Role } from "@prisma/client";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";
import { generateNegotiationGuidance } from "../lib/ai/skills/salary-negotiator.js";
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

const negotiateSchema = z.object({
  role: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  currentSalary: z.number().positive().optional(),
  targetSalary: z.number().positive().optional(),
  currency: z.string().max(10).optional(),
  yearsExperience: z.coerce.number().min(0).max(50).optional(),
});

// ── POST /api/salary-benchmarks/negotiate ────────────────────────────────────
router.post(
  "/negotiate",
  authenticate,
  authorize(Role.CANDIDATE),
  makeMonthlySkillQuota(AiRunType.SALARY_NEGOTIATE, 3),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const { role, location, currentSalary, targetSalary, currency, yearsExperience } =
        negotiateSchema.parse(req.body);

      const result = await generateNegotiationGuidance({
        role,
        location,
        yearsExperience: yearsExperience ?? 0,
        offeredSalary: currentSalary,
        offeredCurrency: currency,
        targetSalary,
      });

      void recordSkillRun(req.user!.userId, AiRunType.SALARY_NEGOTIATE);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[salary-benchmarks] negotiate failed");
      res.status(500).json({ error: "Failed to generate negotiation guidance" });
    }
  }
);

export default router;
