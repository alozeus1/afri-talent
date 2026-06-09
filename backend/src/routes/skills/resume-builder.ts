// POST /api/skills/resume-builder/generate           — generate a resume with Claude
// POST /api/skills/resume-builder/save               — save / update the user's resume
// GET  /api/skills/resume-builder/my-resume          — fetch the user's saved resume
// POST /api/skills/resume-builder/scan-ats           — quick ATS keyword scan (existing)
// POST /api/skills/resume-builder/translate          — translate a resume
// POST /api/skills/resume-builder/ats-rubric/score   — Wave 5 PR #2: ATS rubric scoring + persistence
//
// All routes require PROFESSIONAL subscription.

import { Router, Request, Response } from "express";
import { z } from "zod";
import { Prisma, Role, SubscriptionPlan } from "@prisma/client";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import { generateLimiter } from "../../middleware/security.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { buildResume } from "../../lib/ai/skills/resume-builder.js";
import { embedUserResume } from "../../lib/ai/skills/job-matcher.js";
import { scanResumeAts } from "../../lib/ai/skills/ats-scanner.js";
import { translateResume, type SupportedTranslationLanguage } from "../../lib/ai/skills/resume-translator.js";
import { scoreAtsRubric } from "../../services/ats-rubric.js";
import {
  ATS_RUBRIC_ROW_MAX_BYTES,
  atsRubricRequestSchema,
} from "../../lib/resume/rubric-schema.js";

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
  generateLimiter,
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
  generateLimiter,
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

// ── POST /api/skills/resume-builder/ats-rubric/score ─────────────────────────
// Wave 5 PR #2 — score a resume against a target job using a weighted rubric
// and persist the result. The route handler derives `userId` from `req.user`
// and NEVER trusts a candidate identifier from the request body
// (security-engineer hard-block). Defense-in-depth layers:
//   1. Express body-parser per-route limit (1 MB) configured in app.ts
//   2. Zod resumeContentSchema per-field 256 KB cap (PR #1)
//   3. Combined envelope cap (768 KB) enforced just below
//   4. Per-user AI quotas + generateLimiter rate limit (existing)
router.post(
  "/ats-rubric/score",
  authenticate,
  generateLimiter,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response): Promise<void> => {
    if (!checkSkillsEnabled(res)) return;

    try {
      const parsed = atsRubricRequestSchema.parse(req.body);

      // Envelope check: combined request body must not exceed
      // ATS_RUBRIC_ROW_MAX_BYTES. Runs AFTER Zod so we know the shape is
      // valid before doing the serialization work.
      let envelopeBytes = 0;
      try {
        envelopeBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      } catch {
        res.status(400).json({
          error: "Request body could not be serialized",
          code: "RESUME_NOT_SERIALIZABLE",
        });
        return;
      }
      if (envelopeBytes > ATS_RUBRIC_ROW_MAX_BYTES) {
        res.status(413).json({
          error: "Request body too large",
          code: "RESUME_TOO_LARGE",
          limit_bytes: ATS_RUBRIC_ROW_MAX_BYTES,
          received_bytes: envelopeBytes,
        });
        return;
      }

      const userId = req.user!.userId;
      const result = await scoreAtsRubric({
        userId,
        resumeContent: parsed.resumeContent,
        targetJobId: parsed.targetJobId ?? null,
        targetJobDescription: parsed.targetJobDescription ?? null,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // The Zod .refine() on resumeContentSchema (PR #1) fires a known
        // message when the per-field 256 KB cap is exceeded. Detect that
        // case and emit a distinctive code so the FE can route to a
        // size-specific 400 toast instead of a generic validation toast.
        const sizeIssue = error.issues.find(
          (i) =>
            typeof i.message === "string" &&
            i.message.includes("exceeds") &&
            i.message.includes("bytes")
        );
        if (sizeIssue) {
          res.status(400).json({
            error: "Resume content field exceeds the per-field size limit",
            code: "RESUME_FIELD_TOO_LARGE",
            details: error.issues,
          });
          return;
        }
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_FAILED",
          details: error.issues,
        });
        return;
      }
      // Never log raw resume content. Hash-based identifiers only —
      // userId is short and not PII-grade, so logged as-is.
      logger.error(
        { error, userId: req.user?.userId },
        "[resume-builder] ats-rubric/score failed"
      );
      res.status(500).json({
        error: "Failed to score resume against rubric",
        code: "ATS_RUBRIC_INTERNAL_ERROR",
      });
    }
  }
);

export default router;
