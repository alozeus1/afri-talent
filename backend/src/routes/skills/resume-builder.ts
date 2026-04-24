// POST /api/skills/resume-builder/generate — generate a resume with Claude
// POST /api/skills/resume-builder/save      — save / update the user's resume
// GET  /api/skills/resume-builder/my-resume — fetch the user's saved resume
//
// All routes require PROFESSIONAL subscription.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma, Role, SubscriptionPlan } from "@prisma/client";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { buildResume } from "../../lib/ai/skills/resume-builder.js";
import { embedUserResume } from "../../lib/ai/skills/job-matcher.js";
import { scanResumeAts } from "../../lib/ai/skills/ats-scanner.js";
import { translateResume, type SupportedTranslationLanguage } from "../../lib/ai/skills/resume-translator.js";

const router = Router();

const skillsEnabled = process.env.SKILLS_ENABLED !== "false";

// ── Guard: feature flag ───────────────────────────────────────────────────────
function checkSkillsEnabled(res: Response): boolean {
  if (!skillsEnabled) {
    res.status(503).json({ error: "AI Skills are not enabled on this instance" });
    return false;
  }
  return true;
}

// ── Validation schemas ────────────────────────────────────────────────────────
const workHistoryItemSchema = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  period: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
});

const educationItemSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(200),
  period: z.string().max(100).optional(),
});

const generateResumeSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  location: z.string().max(100).optional(),
  targetRole: z.string().min(1).max(200).trim(),
  yearsExperience: z.coerce.number().min(0).max(50),
  summary: z.string().max(1000).optional(),
  skills: z.array(z.string().max(100)).min(1).max(30),
  workHistory: z.array(workHistoryItemSchema).min(0).max(20),
  educationHistory: z.array(educationItemSchema).min(0).max(10),
  certifications: z.array(z.string().max(200)).max(20).optional(),
});

// ── POST /api/skills/resume-builder/generate ──────────────────────────────────
router.post(
  "/generate",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const input = generateResumeSchema.parse(req.body);
      const result = await buildResume(input);
      res.json({ resume: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[resume-builder] generate failed");
      res.status(500).json({ error: "Failed to generate resume" });
    }
  }
);

// ── POST /api/skills/resume-builder/save ─────────────────────────────────────
router.post(
  "/save",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    const saveSchema = z.object({
      content: z.record(z.string(), z.unknown()),
      rawText: z.string().min(1).max(50000),
    });

    try {
      const { content, rawText } = saveSchema.parse(req.body);
      const userId = req.user!.userId;

      const existing = await prisma.userResume.findUnique({ where: { userId } });

      const saved = await prisma.userResume.upsert({
        where: { userId },
        create: { userId, content: content as Prisma.InputJsonValue, rawText, version: 1 },
        update: {
          content: content as Prisma.InputJsonValue,
          rawText,
          version: (existing?.version ?? 0) + 1,
        },
      });

      // Fire-and-forget: embed the updated resume
      void embedUserResume(userId, rawText).catch((err) => {
        logger.warn({ err, userId }, "[resume-builder] embedding failed after save");
      });

      res.json({ message: "Resume saved", id: saved.id, version: saved.version });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[resume-builder] save failed");
      res.status(500).json({ error: "Failed to save resume" });
    }
  }
);

// ── GET /api/skills/resume-builder/my-resume ─────────────────────────────────
router.get(
  "/my-resume",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const userId = req.user!.userId;
      const resume = await prisma.userResume.findUnique({ where: { userId } });

      if (!resume) {
        res.status(404).json({ error: "No resume found. Generate one first." });
        return;
      }

      res.json({ resume });
    } catch (error) {
      logger.error({ error, userId: req.user?.userId }, "[resume-builder] fetch failed");
      res.status(500).json({ error: "Failed to fetch resume" });
    }
  }
);

// ── POST /api/skills/resume-builder/scan-ats ─────────────────────────────────
router.post(
  "/scan-ats",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    const scanAtsSchema = z.object({
      resumeText: z.string().min(50).max(20000),
      jobDescription: z.string().max(5000).optional(),
    });

    try {
      const { resumeText, jobDescription } = scanAtsSchema.parse(req.body);
      const result = await scanResumeAts({
        resumeText,
        jobDescription: jobDescription ?? "",
      });
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[resume-builder] scan-ats failed");
      res.status(500).json({ error: "Failed to scan resume" });
    }
  }
);

// ── POST /api/skills/resume-builder/translate ────────────────────────────────
router.post(
  "/translate",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    const translateSchema = z.object({
      resumeText: z.string().min(50).max(20000),
      targetLanguage: z.enum(["fr", "pt", "ar", "sw", "es"]),
    });

    try {
      const { resumeText, targetLanguage } = translateSchema.parse(req.body);
      const result = await translateResume({
        resumeText,
        targetLanguage: targetLanguage as SupportedTranslationLanguage,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ error, userId: req.user?.userId }, "[resume-builder] translate failed");
      res.status(500).json({ error: "Failed to translate resume" });
    }
  }
);

export default router;
