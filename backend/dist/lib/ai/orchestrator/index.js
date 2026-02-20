// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — team lead coordinating all specialist agents
//
// Handles three run_types:
//   resume_review  → parse resume only
//   job_match      → parse resume + parse jobs + score matches
//   apply_pack     → job_match + tailor + cover letter + truth guard
//
// Enforces:
//   - token budget with early stopping
//   - result caching (resume_json, job_json)
//   - early stop per job if score < 55 OR must_have_coverage_pct < 60
//   - max 1 retry per job through the truth guard
// ─────────────────────────────────────────────────────────────────────────────
import logger from "../../logger.js";
import { ResumeParserAgent, JobParserAgent, MatchScorerAgent, ResumeTailorAgent, CoverLetterAgent, TruthConsistencyGuardAgent, estimateTokens, } from "./agents.js";
// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULT_MAX_JOBS = 20;
const DEFAULT_MAX_TAILORED_JOBS = 5;
const DEFAULT_TOKEN_BUDGET = 60_000;
const MATCH_SCORE_THRESHOLD = 55;
const MUST_HAVE_THRESHOLD = 60;
// ── Budget tracker ────────────────────────────────────────────────────────────
class Budget {
    total;
    used = 0;
    stoppedReason = "";
    constructor(total) {
        this.total = total;
    }
    consume(tokens) {
        this.used += tokens;
    }
    /** Returns true when budget is exhausted. */
    exhausted() {
        return this.used >= this.total;
    }
    assertAvailable(estimatedCost, label) {
        if (this.used + estimatedCost > this.total) {
            this.stoppedReason = `token budget exceeded before ${label}`;
            throw new BudgetExceededError(this.stoppedReason);
        }
    }
    toInfo() {
        return {
            token_budget_total: this.total,
            token_used_estimate: this.used,
            stopped_reason: this.stoppedReason,
        };
    }
}
class BudgetExceededError extends Error {
    constructor(reason) {
        super(reason);
        this.name = "BudgetExceededError";
    }
}
// ── Orchestrator ──────────────────────────────────────────────────────────────
export async function runOrchestrator(input) {
    const { run_type, user_id, resume_text, candidate_profile, jobs = [], limits = {}, cached = {}, } = input;
    const maxJobs = limits.max_jobs ?? DEFAULT_MAX_JOBS;
    const maxTailored = limits.max_tailored_jobs ?? DEFAULT_MAX_TAILORED_JOBS;
    const tokenBudget = limits.token_budget_total ?? DEFAULT_TOKEN_BUDGET;
    const budget = new Budget(tokenBudget);
    const notes = [];
    let status = "ok";
    logger.info({ user_id, run_type }, "[orchestrator] starting run");
    // ── Step 1: Parse resume ────────────────────────────────────────────────────
    let resumeJson;
    if (cached.resume_json) {
        resumeJson = cached.resume_json;
        notes.push("resume_json: served from cache");
        logger.info({ user_id }, "[orchestrator] resume cache hit");
    }
    else {
        budget.assertAvailable(estimateTokens(resume_text) + 600, "ResumeParserAgent");
        const result = await ResumeParserAgent(resume_text);
        budget.consume(result.token_estimate);
        resumeJson = result.data;
        logger.info({ user_id, tokens: result.token_estimate }, "[orchestrator] ResumeParserAgent done");
    }
    // Early return for resume_review runs
    if (run_type === "resume_review") {
        logger.info({ user_id }, "[orchestrator] resume_review complete");
        return {
            status,
            budget: budget.toInfo(),
            resume_json: resumeJson,
            ranked_jobs: [],
            tailored_outputs: [],
            notes_for_ui: notes,
        };
    }
    // ── Step 2: Parse jobs ──────────────────────────────────────────────────────
    const inputJobs = jobs.slice(0, maxJobs);
    const jobJsonMap = { ...(cached.job_json_by_job_id ?? {}) };
    for (const jobInput of inputJobs) {
        if (jobJsonMap[jobInput.job_id]) {
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
            jobJsonMap[jobInput.job_id] = result.data;
            logger.info({ user_id, job_id: jobInput.job_id, tokens: result.token_estimate }, "[orchestrator] JobParserAgent done");
        }
        catch (err) {
            if (err instanceof BudgetExceededError) {
                status = "partial";
                notes.push(`budget exceeded while parsing job ${jobInput.job_id}`);
                break;
            }
            logger.warn({ user_id, job_id: jobInput.job_id, err }, "[orchestrator] JobParserAgent failed — skipping");
            notes.push(`job ${jobInput.job_id}: parse error, skipped`);
        }
    }
    // ── Step 3: Score matches ───────────────────────────────────────────────────
    const rankedJobs = [];
    for (const jobInput of inputJobs) {
        const jobJson = jobJsonMap[jobInput.job_id];
        if (!jobJson)
            continue;
        if (budget.exhausted()) {
            status = "partial";
            notes.push(`stopped scoring at job ${jobInput.job_id}: budget exhausted`);
            break;
        }
        try {
            budget.assertAvailable(800, `MatchScorerAgent:${jobInput.job_id}`);
            const result = await MatchScorerAgent(resumeJson, jobJson, candidate_profile);
            budget.consume(result.token_estimate);
            rankedJobs.push({ job_id: jobInput.job_id, job_json: jobJson, match: result.data });
            logger.info({ user_id, job_id: jobInput.job_id, score: result.data.score, tokens: result.token_estimate }, "[orchestrator] MatchScorerAgent done");
        }
        catch (err) {
            if (err instanceof BudgetExceededError) {
                status = "partial";
                notes.push(`budget exceeded while scoring job ${jobInput.job_id}`);
                break;
            }
            logger.warn({ user_id, job_id: jobInput.job_id, err }, "[orchestrator] MatchScorerAgent failed — skipping");
            notes.push(`job ${jobInput.job_id}: scoring error, skipped`);
        }
    }
    // Sort descending by score
    rankedJobs.sort((a, b) => b.match.score - a.match.score);
    // Early return for job_match runs
    if (run_type === "job_match") {
        logger.info({ user_id, ranked: rankedJobs.length }, "[orchestrator] job_match complete");
        return {
            status,
            budget: budget.toInfo(),
            resume_json: resumeJson,
            ranked_jobs: rankedJobs,
            tailored_outputs: [],
            notes_for_ui: notes,
        };
    }
    // ── Step 4: Tailor + cover letter + guard (apply_pack only) ─────────────────
    const tailoredOutputs = [];
    const eligible = rankedJobs.filter((rj) => rj.match.score >= MATCH_SCORE_THRESHOLD &&
        rj.match.must_have_coverage_pct >= MUST_HAVE_THRESHOLD);
    const toTailor = eligible.slice(0, maxTailored);
    if (toTailor.length === 0) {
        notes.push(`No jobs passed thresholds (score ≥ ${MATCH_SCORE_THRESHOLD}, must-haves ≥ ${MUST_HAVE_THRESHOLD}%) — tailoring skipped`);
    }
    for (const ranked of toTailor) {
        if (budget.exhausted()) {
            status = "partial";
            notes.push(`stopped tailoring at job ${ranked.job_id}: budget exhausted`);
            break;
        }
        const output = await tailorJob(ranked.job_id, resumeJson, ranked.job_json, budget, notes, user_id);
        if (output)
            tailoredOutputs.push(output);
    }
    logger.info({ user_id, tailored: tailoredOutputs.length }, "[orchestrator] apply_pack complete");
    return {
        status,
        budget: budget.toInfo(),
        resume_json: resumeJson,
        ranked_jobs: rankedJobs,
        tailored_outputs: tailoredOutputs,
        notes_for_ui: notes,
    };
}
// ── Tailor one job with guard + 1 retry ───────────────────────────────────────
async function tailorJob(jobId, resume, job, budget, notes, userId) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            // ResumeTailorAgent
            budget.assertAvailable(3000, `ResumeTailorAgent:${jobId}:attempt${attempt}`);
            const tailorResult = await ResumeTailorAgent(resume, job);
            budget.consume(tailorResult.token_estimate);
            logger.info({ userId, jobId, attempt, tokens: tailorResult.token_estimate }, "[orchestrator] ResumeTailorAgent done");
            // CoverLetterAgent
            budget.assertAvailable(1500, `CoverLetterAgent:${jobId}:attempt${attempt}`);
            const clResult = await CoverLetterAgent(resume, job, tailorResult.data);
            budget.consume(clResult.token_estimate);
            logger.info({ userId, jobId, attempt, tokens: clResult.token_estimate }, "[orchestrator] CoverLetterAgent done");
            // TruthConsistencyGuardAgent
            budget.assertAvailable(1500, `TruthGuard:${jobId}:attempt${attempt}`);
            const guardResult = await TruthConsistencyGuardAgent(resume, tailorResult.data, clResult.data);
            budget.consume(guardResult.token_estimate);
            logger.info({ userId, jobId, attempt, verdict: guardResult.data.verdict, tokens: guardResult.token_estimate }, "[orchestrator] TruthConsistencyGuardAgent done");
            if (guardResult.data.verdict === "PASS" || attempt === 2) {
                if (guardResult.data.verdict === "FAIL" && attempt === 2) {
                    notes.push(`job ${jobId}: guard FAIL on retry — returning best effort with issues flagged`);
                }
                return {
                    job_id: jobId,
                    tailored_resume: tailorResult.data,
                    cover_letter_pack: clResult.data,
                    guard_report: guardResult.data,
                };
            }
            // Guard FAIL on attempt 1 → retry
            notes.push(`job ${jobId}: guard FAIL (attempt 1) — retrying tailor/cover letter`);
            logger.warn({ userId, jobId, issues: guardResult.data.issues }, "[orchestrator] guard FAIL, retrying");
        }
        catch (err) {
            if (err instanceof BudgetExceededError) {
                notes.push(`budget exceeded during tailoring job ${jobId} (attempt ${attempt})`);
                return null;
            }
            logger.error({ userId, jobId, attempt, err }, "[orchestrator] tailorJob error");
            notes.push(`job ${jobId}: tailoring error on attempt ${attempt} — ${err.message}`);
            return null;
        }
    }
    return null; // unreachable but satisfies TS
}
//# sourceMappingURL=index.js.map