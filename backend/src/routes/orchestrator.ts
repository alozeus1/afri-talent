// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orchestrator/run
//
// Every response — success or failure — shares the envelope:
//   { status, run_id, budget, resume_json?, ranked_jobs?, tailored_outputs?,
//     notes_for_ui?, error? }
//
// Auth: JWT required, CANDIDATE role only.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomUUID } from "crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { checkDailyQuota } from "../middleware/quotas.js";
import { runOrchestrator } from "../lib/ai/orchestrator/index.js";
import { createAiRun, completeAiRun, getRunHistory } from "../lib/ai/persistence.js";
import logger from "../lib/logger.js";
import { Role } from "@prisma/client";

// Safe hash for logging - never log raw text
function safeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// Env-configurable token budget cap
const ORCHESTRATOR_BUDGET_MAX = parseInt(process.env.ORCHESTRATOR_TOKEN_BUDGET_MAX || "120000", 10);

// AI Kill Switch — set AI_DISABLED=1 to block all orchestrator calls
const AI_DISABLED = process.env.AI_DISABLED === "1";

const router = Router();

// ── Request validation ────────────────────────────────────────────────────────

// job_id accepts:
//   (a) a proper UUID  e.g. "550e8400-e29b-41d4-a716-446655440000"
//   (b) an external composite id  e.g. "linkedin:abc123" / "indeed:xyz"
//   (c) omitted entirely (orchestrator assigns an ephemeral id)
// Regression guard: if someone tightens this back to .uuid() the unit test below will catch it.
const JobInputSchema = z.object({
  job_id:   z.string().min(1).max(200).optional(),
  source:   z.enum(["linkedin", "indeed", "company_site", "internal"]).optional(),
  url:      z.string().url().optional(),
  raw_text: z.string().min(50).max(20_000),
});

// ── Inline regression guard (runs at module load, costs nothing in prod) ─────
{
  const _ok1 = JobInputSchema.safeParse({ raw_text: "x".repeat(50) });
  const _ok2 = JobInputSchema.safeParse({ job_id: "linkedin:abc123", source: "linkedin", raw_text: "x".repeat(50) });
  const _ok3 = JobInputSchema.safeParse({ job_id: "550e8400-e29b-41d4-a716-446655440000", source: "internal", raw_text: "x".repeat(50) });
  const _bad = JobInputSchema.safeParse({ raw_text: "x".repeat(20) }); // too short
  if (!_ok1.success || !_ok2.success || !_ok3.success || _bad.success) {
    throw new Error("[orchestrator route] JobInputSchema self-test failed — check validation rules");
  }
}

const CandidateProfileSchema = z.object({
  location:     z.string().optional(),
  target_roles: z.array(z.string()).optional(),
  work_auth:    z.string().optional(),
});

const LimitsSchema = z.object({
  max_jobs:           z.number().int().min(1).max(50).optional(),
  max_tailored_jobs:  z.number().int().min(1).max(10).optional(),
  token_budget_total: z.number().int().min(1000).max(120_000).optional(),
});

const ResumeExperienceSchema = z.object({
  company:      z.string(),
  title:        z.string(),
  start_date:   z.string().optional(),
  end_date:     z.string().nullable().optional(),
  description:  z.string().optional(),
  metrics:      z.array(z.string()),
  technologies: z.array(z.string()),
});

const ResumeEducationSchema = z.object({
  institution:     z.string(),
  degree:          z.string().optional(),
  field:           z.string().optional(),
  graduation_year: z.string().optional(),
});

const ResumeJsonSchema = z.object({
  name:                z.string().nullable().optional(),
  email:               z.string().nullable().optional(),
  phone:               z.string().nullable().optional(),
  location:            z.string().nullable().optional(),
  headline:            z.string().nullable().optional(),
  summary:             z.string().nullable().optional(),
  years_of_experience: z.number().nullable().optional(),
  skills:              z.array(z.string()),
  experience:          z.array(ResumeExperienceSchema),
  education:           z.array(ResumeEducationSchema),
  languages:           z.array(z.string()),
  certifications:      z.array(z.string()),
  work_auth_status:    z.string().nullable().optional(),
});

const OrchestratorRequestSchema = z.object({
  run_type:          z.enum(["resume_review", "job_match", "apply_pack"]),
  resume_text:       z.string().min(100).max(30_000),
  candidate_profile: CandidateProfileSchema.optional(),
  jobs:              z.array(JobInputSchema).max(50).optional(),
  limits:            LimitsSchema.optional(),
  cached: z.object({
    resume_json:        ResumeJsonSchema.optional().nullable(),
    job_json_by_job_id: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
});

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  "/run",
  authenticate,
  authorize(Role.CANDIDATE),
  checkDailyQuota,
  async (req: Request, res: Response): Promise<void> => {

    // Generate run_id before anything so all error responses carry it.
    const run_id = randomUUID();

    // AI Kill Switch
    if (AI_DISABLED) {
      res.status(503).json({
        status: "blocked",
        run_id,
        budget: { token_budget_total: 0, token_used_estimate: 0, stopped_reason: "ai_disabled" },
        ranked_jobs: [],
        tailored_outputs: [],
        notes_for_ui: ["AI features are temporarily disabled for maintenance. Please try again later."],
        error: "AI features are temporarily disabled",
      });
      return;
    }

    // ── Request validation ──────────────────────────────────────────────────
    const parsed = OrchestratorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      // Read token budget from raw body so the error envelope isn't misleadingly 0.
      const rawBudget = (req.body as Record<string, Record<string, unknown>>)?.limits?.token_budget_total;
      const errBudget = typeof rawBudget === "number" && rawBudget > 0 ? rawBudget : 60_000;
      res.status(400).json({
        status: "blocked",
        run_id,
        budget: { token_budget_total: errBudget, token_used_estimate: 0, stopped_reason: "invalid request" },
        ranked_jobs: [],
        tailored_outputs: [],
        notes_for_ui: [],
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const { run_type, jobs = [], limits = {} } = parsed.data;
    const tokenBudget = limits.token_budget_total ?? 60_000;
    const userId = req.user!.userId;

    // Helper: uniform error envelope (no success fields)
    const sendError = (httpStatus: number, message: string, stoppedReason = message): void => {
      res.status(httpStatus).json({
        status: "blocked",
        run_id,
        budget: { token_budget_total: tokenBudget, token_used_estimate: 0, stopped_reason: stoppedReason },
        ranked_jobs: [],
        tailored_outputs: [],
        notes_for_ui: [],
        error: message,
      });
    };

    if (run_type !== "resume_review" && jobs.length === 0) {
      sendError(400, `run_type "${run_type}" requires at least one job in the jobs array`);
      return;
    }

    // Enforce server-side budget cap
    if (tokenBudget > ORCHESTRATOR_BUDGET_MAX) {
      sendError(400, `Token budget cannot exceed ${ORCHESTRATOR_BUDGET_MAX}`, "budget_cap_exceeded");
      return;
    }

    // Persist run start (non-fatal)
    const resumeHash = createHash("sha256").update(parsed.data.resume_text).digest("hex").slice(0, 64);
    void createAiRun(userId, run_id, run_type, resumeHash, tokenBudget);

    logger.info({
      run_id,
      user_id_prefix: userId.slice(0, 8), // never log full user ID
      run_type,
      job_count: jobs.length,
      resume_len: parsed.data.resume_text.length,
      resume_hash: safeHash(parsed.data.resume_text),
      job_lengths: jobs.map(j => j.raw_text?.length ?? 0),
    }, "[orchestrator route] starting");

    // ── Orchestrator call ───────────────────────────────────────────────────
    try {
      const output = await runOrchestrator({
        ...parsed.data,
        run_id,      // pass pre-generated id — orchestrator uses it verbatim
        user_id: userId,
        jobs,
        cached: {
          resume_json: parsed.data.cached?.resume_json ?? null,
          job_json_by_job_id:
            (parsed.data.cached?.job_json_by_job_id as Record<string, never>) ?? {},
        },
      });

      logger.info(
        {
          run_id,
          userId,
          run_type,
          status: output.status,
          ranked_jobs: output.ranked_jobs.length,
          tailored_outputs: output.tailored_outputs.length,
          tokens_used: output.budget.token_used_estimate,
        },
        "[orchestrator route] complete"
      );

      // Persist run result (non-fatal, fire-and-forget)
      void completeAiRun(run_id, output);

      res.json(output);
    } catch (err) {
      const message = (err as Error).message ?? "unknown error";
      logger.error({ run_id, user_id_prefix: userId.slice(0, 8), run_type, err_msg: (err as Error).message }, "[orchestrator route] error");

      if (message.includes("ANTHROPIC_API_KEY")) {
        sendError(503, "AI service is not configured on this server", "misconfiguration");
        return;
      }
      if (message.includes("quota exceeded")) {
        sendError(429, message, "quota_exceeded");
        return;
      }
      if (message.includes("token budget")) {
        sendError(429, message, "token_budget_exceeded");
        return;
      }
      if (message.includes("schema validation failed")) {
        sendError(502, `Agent returned malformed output: ${message}`, "agent_schema_error");
        return;
      }

      sendError(500, "Orchestrator run failed — please try again", "internal_error");
    }
  }
);

// GET /api/orchestrator/runs — return last N runs for authenticated candidate
router.get(
  "/runs",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);
      const runs = await getRunHistory(userId, limit);
      res.json({ runs });
    } catch (err) {
      logger.error({ err }, "[orchestrator runs] history fetch failed");
      res.status(500).json({ error: "Failed to fetch run history" });
    }
  }
);

export default router;
