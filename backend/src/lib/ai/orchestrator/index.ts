// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — team lead coordinating all specialist agents
//
// run_type routing:
//   resume_review  → parse resume only
//   job_match      → parse + score
//   apply_pack     → parse + score + tailor + cover letter + truth guard
//
// Every agent call emits a structured log line:
//   { run_id, agent, model, tokens_input, tokens_output, cached, status }
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import { z } from "zod/v4";
import logger from "../../logger.js";
import {
  ResumeParserAgent,
  JobParserAgent,
  MatchScorerAgent,
  ResumeTailorAgent,
  CoverLetterAgent,
  TruthConsistencyGuardAgent,
  estimateTokens,
} from "./agents.js";
import {
  ResumeSchemaValidator,
  JobSchemaValidator,
  MatchSchemaValidator,
  TailoredResumeSchemaValidator,
  CoverLetterPackSchemaValidator,
  GuardReportSchemaValidator,
} from "./validators.js";
import type {
  OrchestratorInput,
  OrchestratorOutput,
  OrchestratorStatus,
  ResumeSchema,
  JobSchema,
  RankedJob,
  TailoredOutput,
  BudgetInfo,
} from "./types.js";

// ── Mock AI mode ─────────────────────────────────────────────────────────────

const MOCK_AI = process.env.MOCK_AI === "1";

const MOCK_RESUME_JSON = {
  name: "Test User",
  email: "test@example.com",
  phone: null,
  location: "Lagos, Nigeria",
  headline: "Mock Candidate",
  summary: "Mock resume for testing purposes.",
  years_of_experience: 3,
  skills: ["JavaScript", "TypeScript", "React"],
  experience: [
    {
      company: "Mock Corp",
      title: "Software Engineer",
      start_date: "2021-01",
      end_date: null,
      description: "Built mock features",
      metrics: ["Increased performance by 30%"],
      technologies: ["JavaScript", "React"],
    },
  ],
  education: [
    {
      institution: "Mock University",
      degree: "BSc",
      field: "Computer Science",
      graduation_year: "2020",
    },
  ],
  languages: ["English"],
  certifications: [],
  work_auth_status: null,
};

function mockMatchForJob(jobId: string) {
  return {
    score: 75,
    must_have_coverage_pct: 80,
    nice_to_have_coverage_pct: 60,
    matched_skills: ["JavaScript", "TypeScript"],
    missing_must_haves: [],
    missing_nice_to_haves: ["Python"],
    location_match: true,
    work_auth_ok: true,
    visa_ok: true,
    seniority_match: "match" as const,
    recommendation: "apply" as const,
    explanation: `Mock match explanation for job ${jobId}`,
  };
}

function mockTailoredForJob(jobId: string) {
  return {
    tailored_resume: {
      summary: `Mock tailored resume for job ${jobId}.`,
      skills: ["JavaScript", "TypeScript", "React"],
      experience: [
        {
          company: "Mock Corp",
          title: "Software Engineer",
          period: "2021-01 - Present",
          bullets: ["Built mock features for job requirements"],
        },
      ],
      ats_keywords: ["JavaScript", "TypeScript"],
      warnings: [],
      change_log: ["Tailored summary for role"],
    },
    cover_letter_pack: {
      subject_line: `Application for Mock Position`,
      salutation: "Dear Hiring Manager,",
      body: "I am excited to apply for this mock position. My experience with JavaScript and TypeScript makes me an ideal candidate.",
      closing: "Thank you for your consideration.",
      tone: "professional" as const,
      word_count: 30,
    },
    guard_report: {
      verdict: "PASS" as const,
      issues: [],
      requires_user_confirmation: [],
      confidence: 0.99,
    },
  };
}

// ── Runtime validation ─────────────────────────────────────────────────────────

/**
 * Validates `data` against `schema`.  Throws a descriptive Error on mismatch
 * so the orchestrator can treat it as an agent failure and continue where possible.
 */
function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const iss = result.error.issues[0];
  const path = iss?.path.join(".") || "<root>";
  const msg  = iss?.message ?? "unknown";
  throw new Error(`[${label}] schema validation failed at [${path}]: ${msg}`);
}

// ── Output size guardrails ─────────────────────────────────────────────────────

const MAX_JOB_DESC    = 3_000;   // chars — job_json.description
const MAX_EXPLANATION = 800;     // chars — match.explanation
const MAX_CL_BODY     = 3_000;   // chars — cover_letter_pack.body
const MAX_SUMMARY     = 1_500;   // chars — tailored_resume.summary
const MAX_BULLET      = 600;     // chars — each experience bullet
const MAX_ATS_KW      = 30;      // items — ats_keywords array
const MAX_CHANGE_LOG  = 50;      // items — change_log array

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Caps oversized string fields in-place before the response is serialised.
 * Logs a warning for each field that required truncation.
 */
function truncateOutput(out: OrchestratorOutput, runId: string): void {
  for (const rj of out.ranked_jobs) {
    if (rj.job_json.description && rj.job_json.description.length > MAX_JOB_DESC) {
      rj.job_json.description = clip(rj.job_json.description, MAX_JOB_DESC);
      logger.warn({ run_id: runId, job_id: rj.job_id, field: "job_json.description", max: MAX_JOB_DESC }, "[orchestrator] field truncated");
    }
    if (rj.match.explanation.length > MAX_EXPLANATION) {
      rj.match.explanation = clip(rj.match.explanation, MAX_EXPLANATION);
    }
  }

  for (const t of out.tailored_outputs) {
    const cl = t.cover_letter_pack;
    if (cl.body.length > MAX_CL_BODY) {
      cl.body = clip(cl.body, MAX_CL_BODY);
      logger.warn({ run_id: runId, job_id: t.job_id, field: "cover_letter_pack.body", max: MAX_CL_BODY }, "[orchestrator] field truncated");
    }

    const tr = t.tailored_resume;
    if (tr.summary.length > MAX_SUMMARY) {
      tr.summary = clip(tr.summary, MAX_SUMMARY);
      logger.warn({ run_id: runId, job_id: t.job_id, field: "tailored_resume.summary", max: MAX_SUMMARY }, "[orchestrator] field truncated");
    }
    if (tr.ats_keywords.length > MAX_ATS_KW)   tr.ats_keywords = tr.ats_keywords.slice(0, MAX_ATS_KW);
    if ((tr.change_log?.length ?? 0) > MAX_CHANGE_LOG) tr.change_log = tr.change_log!.slice(0, MAX_CHANGE_LOG);
    for (const exp of tr.experience) {
      exp.bullets = exp.bullets.map((b) => clip(b, MAX_BULLET));
    }
  }
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_JOBS          = 20;
const DEFAULT_MAX_TAILORED_JOBS = 5;
const DEFAULT_TOKEN_BUDGET      = 60_000;

/** Jobs below EITHER threshold are never tailored (early stop). */
const MATCH_SCORE_THRESHOLD = 55;
const MUST_HAVE_THRESHOLD   = 60;

// ── Agent log helper ──────────────────────────────────────────────────────────

interface AgentLogCtx {
  run_id: string;
  user_id: string;
  agent: string;
  model?: string;
  cached: boolean;
  tokens?: number;
  status: "ok" | "skipped" | "error" | "budget_exceeded";
  job_id?: string;
  attempt?: number;
  extra?: Record<string, unknown>;
}

function agentLog(ctx: AgentLogCtx): void {
  logger.info(ctx, `[orchestrator:${ctx.agent}] ${ctx.status}`);
}

// ── Budget tracker ────────────────────────────────────────────────────────────

class Budget {
  readonly total: number;
  used = 0;
  stoppedReason = "";

  constructor(total: number) {
    this.total = total;
  }

  consume(tokens: number): void {
    this.used += tokens;
  }

  exhausted(): boolean {
    return this.used >= this.total;
  }

  /** Throws BudgetExceededError if adding `estimatedCost` would bust the budget. */
  assertAvailable(estimatedCost: number, label: string): void {
    if (this.used + estimatedCost > this.total) {
      this.stoppedReason = `token budget exceeded before ${label}`;
      throw new BudgetExceededError(this.stoppedReason);
    }
  }

  toInfo(): BudgetInfo {
    return {
      token_budget_total: this.total,
      token_used_estimate: this.used,
      stopped_reason: this.stoppedReason,
    };
  }
}

class BudgetExceededError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BudgetExceededError";
  }
}

// ── Orchestrator entry point ───────────────────────────────────────────────────

export async function runOrchestrator(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const {
    run_type,
    user_id,
    resume_text,
    candidate_profile,
    jobs = [],
    limits = {},
    cached = {},
  } = input;

  const maxJobs     = limits.max_jobs          ?? DEFAULT_MAX_JOBS;
  const maxTailored = limits.max_tailored_jobs  ?? DEFAULT_MAX_TAILORED_JOBS;
  const tokenBudget = limits.token_budget_total ?? DEFAULT_TOKEN_BUDGET;

  const run_id = input.run_id ?? randomUUID();

  // ── MOCK MODE — returns deterministic output without calling Claude API ────
  if (MOCK_AI) {
    logger.debug({ run_id, user_id, run_type }, "[orchestrator] MOCK_AI mode — skipping real API calls");

    const inputJobs = (jobs ?? []).slice(0, 3).map((j) => ({
      ...j,
      job_id: j.job_id ?? randomUUID(),
    }));

    const resumeJson = MOCK_RESUME_JSON;

    if (run_type === "resume_review") {
      return {
        run_id, status: "ok",
        budget: { token_budget_total: tokenBudget, token_used_estimate: 100, stopped_reason: "" },
        resume_json: resumeJson, ranked_jobs: [], tailored_outputs: [], notes_for_ui: ["[MOCK] resume review"],
      };
    }

    const mockJobJson = {
      title: "Mock Job Title", company: "Mock Company", location: "Remote",
      type: "full-time", seniority: "mid", salary_min: null, salary_max: null, currency: null,
      must_have_skills: ["JavaScript"], nice_to_have_skills: ["Python"],
      visa_sponsorship: "UNKNOWN" as const, relocation_assistance: false, eligible_countries: [],
      description: "Mock job description", requirements: [], responsibilities: [],
    };

    const rankedJobs: RankedJob[] = inputJobs.map((j) => ({
      job_id: j.job_id,
      job_json: mockJobJson,
      match: mockMatchForJob(j.job_id),
    }));

    if (run_type === "job_match") {
      return {
        run_id, status: "ok",
        budget: { token_budget_total: tokenBudget, token_used_estimate: 500, stopped_reason: "" },
        resume_json: resumeJson, ranked_jobs: rankedJobs, tailored_outputs: [], notes_for_ui: ["[MOCK] job match"],
      };
    }

    // apply_pack
    const tailoredOutputs: TailoredOutput[] = rankedJobs.map((rj) => ({
      job_id: rj.job_id,
      ...mockTailoredForJob(rj.job_id),
    }));

    return {
      run_id, status: "ok",
      budget: { token_budget_total: tokenBudget, token_used_estimate: 2000, stopped_reason: "" },
      resume_json: resumeJson, ranked_jobs: rankedJobs, tailored_outputs: tailoredOutputs,
      notes_for_ui: ["[MOCK] apply_pack — all agents mocked"],
    };
  }

  const budget = new Budget(tokenBudget);
  const notes: string[] = [];
  let status: OrchestratorStatus = "ok";

  logger.info(
    { run_id, user_id, run_type, job_count: jobs.length, token_budget: tokenBudget },
    "[orchestrator] run started"
  );

  // ── Step 1: Parse resume ────────────────────────────────────────────────────

  let resumeJson: ResumeSchema;

  if (cached.resume_json) {
    resumeJson = cached.resume_json;
    agentLog({ run_id, user_id, agent: "ResumeParserAgent", cached: true, status: "skipped" });
    notes.push("resume_json: served from cache");
  } else {
    const cost = estimateTokens(resume_text) + 600;
    budget.assertAvailable(cost, "ResumeParserAgent");

    const result = await ResumeParserAgent(resume_text);
    budget.consume(result.token_estimate);
    resumeJson = validateOrThrow(ResumeSchemaValidator, result.data, "ResumeParserAgent");
    agentLog({
      run_id, user_id,
      agent: "ResumeParserAgent",
      model: "fast",
      cached: false,
      tokens: result.token_estimate,
      status: "ok",
    });
  }

  if (run_type === "resume_review") {
    logger.info({ run_id, user_id, tokens_used: budget.used }, "[orchestrator] run complete (resume_review)");
    const out: OrchestratorOutput = { run_id, status, budget: budget.toInfo(), resume_json: resumeJson, ranked_jobs: [], tailored_outputs: [], notes_for_ui: notes };
    truncateOutput(out, run_id);
    return out;
  }

  // ── Step 2: Parse jobs ──────────────────────────────────────────────────────

  // Normalise jobs: fill in any missing job_id with an ephemeral UUID so the
  // rest of the pipeline can treat job_id as a guaranteed string key.
  const inputJobs = jobs.slice(0, maxJobs).map(j => ({
    ...j,
    job_id: j.job_id ?? randomUUID(),
  }));
  const jobJsonMap: Record<string, JobSchema> = { ...(cached.job_json_by_job_id ?? {}) };

  for (const jobInput of inputJobs) {
    if (jobJsonMap[jobInput.job_id]) {
      agentLog({ run_id, user_id, agent: "JobParserAgent", job_id: jobInput.job_id, cached: true, status: "skipped" });
      notes.push(`job ${jobInput.job_id}: served from cache`);
      continue;
    }

    if (budget.exhausted()) {
      status = "partial";
      notes.push(`stopped parsing jobs at ${jobInput.job_id}: budget exhausted`);
      break;
    }

    try {
      budget.assertAvailable(estimateTokens(jobInput.raw_text) + 600, `JobParserAgent:${jobInput.job_id}`);
      const result = await JobParserAgent(jobInput.raw_text);
      budget.consume(result.token_estimate);
      jobJsonMap[jobInput.job_id] = validateOrThrow(JobSchemaValidator, result.data, `JobParserAgent:${jobInput.job_id}`);
      agentLog({ run_id, user_id, agent: "JobParserAgent", job_id: jobInput.job_id, model: "fast", cached: false, tokens: result.token_estimate, status: "ok" });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        status = "partial";
        agentLog({ run_id, user_id, agent: "JobParserAgent", job_id: jobInput.job_id, cached: false, status: "budget_exceeded" });
        notes.push(`budget exceeded while parsing job ${jobInput.job_id}`);
        break;
      }
      agentLog({ run_id, user_id, agent: "JobParserAgent", job_id: jobInput.job_id, cached: false, status: "error", extra: { err: String(err) } });
      notes.push(`job ${jobInput.job_id}: parse error, skipped`);
    }
  }

  // ── Step 3: Score matches ───────────────────────────────────────────────────

  const rankedJobs: RankedJob[] = [];

  for (const jobInput of inputJobs) {
    const jobJson = jobJsonMap[jobInput.job_id];
    if (!jobJson) continue;

    if (budget.exhausted()) {
      status = "partial";
      notes.push(`stopped scoring at job ${jobInput.job_id}: budget exhausted`);
      break;
    }

    try {
      budget.assertAvailable(800, `MatchScorerAgent:${jobInput.job_id}`);
      const result = await MatchScorerAgent(resumeJson, jobJson, candidate_profile);
      budget.consume(result.token_estimate);
      const match = validateOrThrow(MatchSchemaValidator, result.data, `MatchScorerAgent:${jobInput.job_id}`);
      rankedJobs.push({ job_id: jobInput.job_id, job_json: jobJson, match });
      agentLog({
        run_id, user_id,
        agent: "MatchScorerAgent",
        job_id: jobInput.job_id,
        model: "fast",
        cached: false,
        tokens: result.token_estimate,
        status: "ok",
        extra: { score: match.score, recommendation: match.recommendation },
      });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        status = "partial";
        agentLog({ run_id, user_id, agent: "MatchScorerAgent", job_id: jobInput.job_id, cached: false, status: "budget_exceeded" });
        notes.push(`budget exceeded while scoring job ${jobInput.job_id}`);
        break;
      }
      agentLog({ run_id, user_id, agent: "MatchScorerAgent", job_id: jobInput.job_id, cached: false, status: "error", extra: { err: String(err) } });
      notes.push(`job ${jobInput.job_id}: scoring error, skipped`);
    }
  }

  // Rank descending by score
  rankedJobs.sort((a, b) => b.match.score - a.match.score);

  if (run_type === "job_match") {
    logger.info({ run_id, user_id, ranked: rankedJobs.length, tokens_used: budget.used }, "[orchestrator] run complete (job_match)");
    const out: OrchestratorOutput = { run_id, status, budget: budget.toInfo(), resume_json: resumeJson, ranked_jobs: rankedJobs, tailored_outputs: [], notes_for_ui: notes };
    truncateOutput(out, run_id);
    return out;
  }

  // ── Step 4: Tailor + cover letter + guard (apply_pack) ───────────────────────

  const tailoredOutputs: TailoredOutput[] = [];

  const eligible = rankedJobs.filter(
    (rj) =>
      rj.match.score >= MATCH_SCORE_THRESHOLD &&
      rj.match.must_have_coverage_pct >= MUST_HAVE_THRESHOLD
  );

  const skipped = rankedJobs.length - eligible.length;
  if (skipped > 0) {
    notes.push(`${skipped} job(s) skipped: score < ${MATCH_SCORE_THRESHOLD} OR must-haves < ${MUST_HAVE_THRESHOLD}%`);
  }
  if (eligible.length === 0) {
    notes.push(`No jobs passed thresholds — tailoring skipped`);
  }

  for (const ranked of eligible.slice(0, maxTailored)) {
    if (budget.exhausted()) {
      status = "partial";
      notes.push(`stopped tailoring at job ${ranked.job_id}: budget exhausted`);
      break;
    }

    const output = await tailorJob({
      jobId: ranked.job_id,
      resume: resumeJson,
      job: ranked.job_json,
      budget,
      notes,
      runId: run_id,
      userId: user_id,
    });
    if (output) tailoredOutputs.push(output);
  }

  logger.info(
    { run_id, user_id, ranked: rankedJobs.length, tailored: tailoredOutputs.length, tokens_used: budget.used },
    "[orchestrator] run complete (apply_pack)"
  );

  const out: OrchestratorOutput = {
    run_id,
    status,
    budget: budget.toInfo(),
    resume_json: resumeJson,
    ranked_jobs: rankedJobs,
    tailored_outputs: tailoredOutputs,
    notes_for_ui: notes,
  };
  truncateOutput(out, run_id);
  return out;
}

// ── Tailor one job (with 1 guard-fail retry) ──────────────────────────────────

interface TailorJobArgs {
  jobId: string;
  resume: ResumeSchema;
  job: JobSchema;
  budget: Budget;
  notes: string[];
  runId: string;
  userId: string;
}

async function tailorJob({ jobId, resume, job, budget, notes, runId, userId }: TailorJobArgs): Promise<TailoredOutput | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // ── ResumeTailorAgent ──────────────────────────────────────────────────
      budget.assertAvailable(3000, `ResumeTailorAgent:${jobId}:a${attempt}`);
      const tailorResult = await ResumeTailorAgent(resume, job);
      budget.consume(tailorResult.token_estimate);
      const tailoredResume = validateOrThrow(TailoredResumeSchemaValidator, tailorResult.data, `ResumeTailorAgent:${jobId}`);
      agentLog({ run_id: runId, user_id: userId, agent: "ResumeTailorAgent", job_id: jobId, model: "quality", cached: false, tokens: tailorResult.token_estimate, status: "ok", attempt });

      // ── CoverLetterAgent ───────────────────────────────────────────────────
      budget.assertAvailable(1500, `CoverLetterAgent:${jobId}:a${attempt}`);
      const clResult = await CoverLetterAgent(resume, job, tailoredResume);
      budget.consume(clResult.token_estimate);
      const coverLetter = validateOrThrow(CoverLetterPackSchemaValidator, clResult.data, `CoverLetterAgent:${jobId}`);
      agentLog({ run_id: runId, user_id: userId, agent: "CoverLetterAgent", job_id: jobId, model: "quality", cached: false, tokens: clResult.token_estimate, status: "ok", attempt });

      // ── TruthConsistencyGuardAgent ─────────────────────────────────────────
      budget.assertAvailable(1500, `TruthGuard:${jobId}:a${attempt}`);
      const guardResult = await TruthConsistencyGuardAgent(resume, tailoredResume, coverLetter);
      budget.consume(guardResult.token_estimate);
      const guardReport = validateOrThrow(GuardReportSchemaValidator, guardResult.data, `TruthConsistencyGuardAgent:${jobId}`);
      agentLog({
        run_id: runId, user_id: userId,
        agent: "TruthConsistencyGuardAgent",
        job_id: jobId,
        model: "quality",
        cached: false,
        tokens: guardResult.token_estimate,
        status: "ok",
        attempt,
        extra: {
          verdict: guardReport.verdict,
          issue_count: guardReport.issues.length,
          confidence: guardReport.confidence,
        },
      });

      if (guardReport.verdict === "PASS") {
        return { job_id: jobId, tailored_resume: tailoredResume, cover_letter_pack: coverLetter, guard_report: guardReport };
      }

      if (attempt === 2) {
        // Second attempt failed guard — return best-effort with issues flagged
        notes.push(`job ${jobId}: guard FAIL on retry (attempt 2) — returning with ${guardReport.issues.length} flagged issue(s)`);
        logger.warn({ run_id: runId, job_id: jobId, issue_count: guardReport.issues.length }, "[orchestrator] guard FAIL after max retries");
        return { job_id: jobId, tailored_resume: tailoredResume, cover_letter_pack: coverLetter, guard_report: guardReport };
      }

      // Guard FAIL on attempt 1 → retry tailor + cover letter + guard only
      notes.push(`job ${jobId}: guard FAIL (attempt 1), retrying tailor + cover letter`);
      logger.warn({ run_id: runId, job_id: jobId, issue_count: guardReport.issues.length }, "[orchestrator] guard FAIL — retrying");

    } catch (err) {
      if (err instanceof BudgetExceededError) {
        agentLog({ run_id: runId, user_id: userId, agent: "tailorJob", job_id: jobId, cached: false, status: "budget_exceeded", attempt });
        notes.push(`budget exceeded during tailoring job ${jobId} (attempt ${attempt})`);
        return null;
      }
      agentLog({ run_id: runId, user_id: userId, agent: "tailorJob", job_id: jobId, cached: false, status: "error", attempt, extra: { err: String(err) } });
      notes.push(`job ${jobId}: tailoring error (attempt ${attempt}) — ${(err as Error).message}`);
      return null;
    }
  }

  return null; // unreachable — satisfies TS
}

// ── Re-export types for route consumers ───────────────────────────────────────

export type {
  OrchestratorInput,
  OrchestratorOutput,
  ResumeSchema,
  JobSchema,
  RankedJob,
  TailoredOutput,
} from "./types.js";
