// ─────────────────────────────────────────────────────────────────────────────
// POST /api/orchestrator/run
//
// Runs the AfriTalent multi-agent pipeline:
//   resume_review | job_match | apply_pack
//
// Auth: requires JWT (CANDIDATE role only).
// Rate-limit: 5 runs per user per hour enforced by the token budget mechanism
//             inside the orchestrator; additionally capped here at network level.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import { runOrchestrator } from "../lib/ai/orchestrator/index.js";
import logger from "../lib/logger.js";
import { Role } from "@prisma/client";
const router = Router();
// ── Zod validation schema ────────────────────────────────────────────────────
const JobInputSchema = z.object({
    job_id: z.string().uuid(),
    source: z.enum(["linkedin", "indeed", "company_site", "internal"]),
    url: z.string().url().optional(),
    raw_text: z.string().min(50).max(20_000),
});
const CandidateProfileSchema = z.object({
    location: z.string().optional(),
    target_roles: z.array(z.string()).optional(),
    work_auth: z.string().optional(),
});
const LimitsSchema = z.object({
    max_jobs: z.number().int().min(1).max(50).optional(),
    max_tailored_jobs: z.number().int().min(1).max(10).optional(),
    token_budget_total: z.number().int().min(1000).max(120_000).optional(),
});
// Resume-JSON shapes are only validated structurally — we trust the cached
// data was previously produced by our own agents.
const ResumeExperienceSchema = z.object({
    company: z.string(),
    title: z.string(),
    start_date: z.string().optional(),
    end_date: z.string().nullable().optional(),
    description: z.string().optional(),
    metrics: z.array(z.string()),
    technologies: z.array(z.string()),
});
const ResumeEducationSchema = z.object({
    institution: z.string(),
    degree: z.string().optional(),
    field: z.string().optional(),
    graduation_year: z.string().optional(),
});
const ResumeJsonSchema = z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    years_of_experience: z.number().nullable().optional(),
    skills: z.array(z.string()),
    experience: z.array(ResumeExperienceSchema),
    education: z.array(ResumeEducationSchema),
    languages: z.array(z.string()),
    certifications: z.array(z.string()),
    work_auth_status: z.string().nullable().optional(),
});
const OrchestratorRequestSchema = z.object({
    run_type: z.enum(["resume_review", "job_match", "apply_pack"]),
    resume_text: z.string().min(100).max(30_000),
    candidate_profile: CandidateProfileSchema.optional(),
    jobs: z.array(JobInputSchema).max(50).optional(),
    limits: LimitsSchema.optional(),
    cached: z.object({
        resume_json: ResumeJsonSchema.optional().nullable(),
        job_json_by_job_id: z.record(z.string(), z.unknown()).optional(),
    }).optional(),
});
// ── Route ────────────────────────────────────────────────────────────────────
router.post("/run", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const parsed = OrchestratorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Invalid request body",
            details: parsed.error.flatten(),
        });
        return;
    }
    const userId = req.user.userId;
    const { run_type, jobs = [] } = parsed.data;
    // Basic guard: job_match and apply_pack require at least one job
    if (run_type !== "resume_review" && jobs.length === 0) {
        res.status(400).json({
            error: `run_type "${run_type}" requires at least one job in the jobs array`,
        });
        return;
    }
    logger.info({ userId, run_type, job_count: jobs.length }, "[orchestrator route] starting");
    try {
        const output = await runOrchestrator({
            ...parsed.data,
            user_id: userId,
            jobs,
            cached: {
                resume_json: parsed.data.cached?.resume_json ?? null,
                job_json_by_job_id: parsed.data.cached?.job_json_by_job_id ?? {},
            },
        });
        logger.info({
            userId,
            run_type,
            status: output.status,
            ranked_jobs: output.ranked_jobs.length,
            tailored_outputs: output.tailored_outputs.length,
            tokens_used: output.budget.token_used_estimate,
        }, "[orchestrator route] complete");
        res.json(output);
    }
    catch (err) {
        const message = err.message;
        if (message.includes("ANTHROPIC_API_KEY")) {
            res.status(503).json({ error: "AI service is not configured on this server" });
            return;
        }
        if (message.includes("quota exceeded") || message.includes("token budget")) {
            res.status(429).json({ error: message });
            return;
        }
        logger.error({ userId, run_type, err }, "[orchestrator route] unexpected error");
        res.status(500).json({ error: "Orchestrator run failed — please try again" });
    }
});
export default router;
//# sourceMappingURL=orchestrator.js.map