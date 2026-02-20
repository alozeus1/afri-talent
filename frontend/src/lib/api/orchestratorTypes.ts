/**
 * AfriTalent Orchestrator — frontend TypeScript types
 *
 * These mirror the canonical types in
 * backend/src/lib/ai/orchestrator/types.ts.
 * Keep in sync when the backend schema changes.
 */

// ── Enums / unions ─────────────────────────────────────────────────────────

export type RunType = "resume_review" | "job_match" | "apply_pack";
export type OrchestratorStatus = "ok" | "partial" | "blocked";
export type MatchRecommendation = "apply" | "stretch" | "skip";
export type SeniorityMatch = "match" | "over" | "under" | "unknown";
export type IssueType = "fabrication" | "inconsistency" | "exaggeration";
export type IssueSeverity = "high" | "medium" | "low";
export type JobSource = "linkedin" | "indeed" | "company_site" | "internal";

// ── Payload sub-types ──────────────────────────────────────────────────────

/**
 * A single job sent to the orchestrator for matching/tailoring.
 *
 * - `job_id` accepts a UUID, an external composite id ("linkedin:abc123"),
 *   or may be omitted entirely (the orchestrator assigns an ephemeral id).
 * - `raw_text` is the full job description pasted/scraped from the source.
 *   Min 50 chars, max 20 000 chars.
 */
export interface JobInput {
  /** Optional. UUID, "linkedin:abc123", or any stable external id. */
  job_id?: string;
  source?: JobSource;
  url?: string;
  raw_text: string;
}

export interface CandidateProfile {
  location?: string;
  /** Roles the candidate is targeting, e.g. ["Backend Engineer", "SRE"] */
  target_roles?: string[];
  /** e.g. "citizen" | "open_to_relocation" | "needs_visa" */
  work_auth?: string;
}

export interface OrchestratorLimits {
  /** Max jobs to rank. Default 20, ceiling 50. */
  max_jobs?: number;
  /** Max jobs to produce tailored output for. Default 5, ceiling 10. */
  max_tailored_jobs?: number;
  /** Total Claude token budget across all agents. Default 60 000, ceiling 120 000. */
  token_budget_total?: number;
}

// ── Resume types (mirrors backend ResumeSchema) ────────────────────────────

export interface ResumeExperience {
  company: string;
  title: string;
  start_date?: string;
  end_date?: string | null;
  description?: string;
  metrics: string[];
  technologies: string[];
}

export interface ResumeEducation {
  institution: string;
  degree?: string;
  field?: string;
  graduation_year?: string;
}

export interface ResumeSchema {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  summary?: string | null;
  years_of_experience?: number | null;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  languages: string[];
  certifications: string[];
  work_auth_status?: string | null;
}

// ── Job schema (returned inside ranked_jobs) ───────────────────────────────

export interface JobSchema {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  type?: string | null;
  seniority?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  must_have_skills: string[];
  nice_to_have_skills: string[];
  visa_sponsorship: "YES" | "NO" | "UNKNOWN";
  relocation_assistance: boolean;
  eligible_countries: string[];
  description?: string | null;
  requirements: string[];
  responsibilities: string[];
}

// ── Match schema ───────────────────────────────────────────────────────────

export interface MatchSchema {
  score: number;
  must_have_coverage_pct: number;
  nice_to_have_coverage_pct: number;
  matched_skills: string[];
  missing_must_haves: string[];
  missing_nice_to_haves: string[];
  location_match: boolean;
  work_auth_ok: boolean;
  visa_ok: boolean;
  seniority_match: SeniorityMatch;
  recommendation: MatchRecommendation;
  explanation: string;
}

// ── Tailored output types ──────────────────────────────────────────────────

export interface TailoredExperience {
  company: string;
  title: string;
  period: string;
  bullets: string[];
}

export interface TailoredResumeSchema {
  summary: string;
  skills: string[];
  experience: TailoredExperience[];
  ats_keywords: string[];
  warnings: string[];
  change_log?: string[];
}

export interface CoverLetterPackSchema {
  subject_line: string;
  salutation: string;
  body: string;
  closing: string;
  tone: "professional" | "warm" | "direct";
  word_count: number;
}

export interface GuardIssue {
  type: IssueType;
  field: string;
  original_value: string;
  fabricated_value: string;
  severity: IssueSeverity;
}

export interface GuardReportSchema {
  verdict: "PASS" | "FAIL";
  issues: GuardIssue[];
  requires_user_confirmation: string[];
  confidence: number;
}

// ── Ranked job + tailored output entries ──────────────────────────────────

export interface RankedJob {
  job_id: string;
  job_json: JobSchema;
  match: MatchSchema;
}

export interface TailoredOutput {
  job_id: string;
  tailored_resume: TailoredResumeSchema;
  cover_letter_pack: CoverLetterPackSchema;
  guard_report: GuardReportSchema;
}

// ── Budget ─────────────────────────────────────────────────────────────────

export interface BudgetInfo {
  token_budget_total: number;
  token_used_estimate: number;
  /** Empty string when the run completed normally. */
  stopped_reason: string;
}

// ── Top-level request / response ──────────────────────────────────────────

/**
 * Payload sent by the client to POST /api/orchestrator/run.
 *
 * `user_id` and `run_id` are NOT included here — the server reads userId
 * from the JWT cookie and generates run_id itself.
 *
 * @example
 * ```ts
 * const payload: OrchestratorRunPayload = {
 *   run_type: "apply_pack",
 *   resume_text: "Alice Engineer …",
 *   jobs: [{ raw_text: "We are looking for …", source: "linkedin" }],
 *   limits: { max_tailored_jobs: 3 },
 * };
 * ```
 */
export interface OrchestratorRunPayload {
  run_type: RunType;
  /**
   * Full resume text (plain text or markdown).
   * Min 100 chars, max 30 000 chars.
   */
  resume_text: string;
  candidate_profile?: CandidateProfile;
  /** Jobs to rank/tailor. Required unless run_type is "resume_review". */
  jobs?: JobInput[];
  limits?: OrchestratorLimits;
  /**
   * Pre-computed cache to avoid redundant AI calls on subsequent runs.
   * Pass the `resume_json` and `ranked_jobs[].job_json` from a previous
   * successful response.
   */
  cached?: {
    resume_json?: ResumeSchema | null;
    job_json_by_job_id?: Record<string, JobSchema>;
  };
}

/**
 * Response envelope from POST /api/orchestrator/run.
 *
 * Both success (`status: "ok"`) and error (`status: "blocked"`) responses
 * share this shape. Always check `status` before using `resume_json`,
 * `ranked_jobs`, and `tailored_outputs`.
 */
export interface OrchestratorRunResponse {
  run_id: string;
  status: OrchestratorStatus;
  budget: BudgetInfo;
  resume_json?: ResumeSchema;
  ranked_jobs: RankedJob[];
  tailored_outputs: TailoredOutput[];
  notes_for_ui: string[];
  /** Present on error responses. */
  error?: string;
  /** Present on 400 responses — Zod validation detail. */
  details?: unknown;
}

// ── Run History types (from GET /api/orchestrator/runs) ───────────────────

export interface AiRunJobHistory {
  jobIndex: number;
  jobTitle: string | null;
  jobCompany: string | null;
  score: number | null;
  mustHavePct: number | null;
  tailoredOutput: TailoredResumeSchema | null;
  coverLetterOutput: CoverLetterPackSchema | null;
  guardReport: GuardReportSchema | null;
}

export interface AiRunHistory {
  id: string;
  runId: string;
  runType: "RESUME_REVIEW" | "JOB_MATCH" | "APPLY_PACK";
  status: "RUNNING" | "COMPLETE" | "PARTIAL" | "BLOCKED";
  tokenBudgetTotal: number;
  tokenBudgetUsed: number;
  notes: string[];
  createdAt: string;
  completedAt: string | null;
  jobs: AiRunJobHistory[];
}

// ── Job Search types (from GET /api/jobs/ai-search) ───────────────────────

export interface SearchJobResult {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  seniority: string;
  rawText: string;
  url: string | null;
}
