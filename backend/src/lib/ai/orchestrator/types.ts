// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — canonical JSON schemas
// All agents and the orchestrator operate on these types.
// ─────────────────────────────────────────────────────────────────────────────

// ── Input ─────────────────────────────────────────────────────────────────────

export type RunType = "resume_review" | "job_match" | "apply_pack";

export interface JobInput {
  job_id?: string;   // UUID, external composite id (e.g. "linkedin:abc"), or omitted
  source?: "linkedin" | "indeed" | "company_site" | "internal";
  url?: string;
  raw_text: string;
}

export interface CandidateProfile {
  location?: string;
  target_roles?: string[];
  work_auth?: string; // e.g. "citizen", "open_to_relocation", "needs_visa"
}

export interface OrchestratorLimits {
  max_jobs?: number;            // default 20
  max_tailored_jobs?: number;   // default 5
  token_budget_total?: number;  // default 60000
}

export interface OrchestratorInput {
  run_type: RunType;
  user_id: string;
  resume_text: string;
  candidate_profile?: CandidateProfile;
  jobs?: JobInput[];
  limits?: OrchestratorLimits;
  /** Caller-supplied run_id for log correlation; generated internally if omitted. */
  run_id?: string;
  /** Pre-computed cache to avoid redundant AI calls */
  cached?: {
    resume_json?: ResumeSchema | null;
    job_json_by_job_id?: Record<string, JobSchema>;
  };
}

// ── RESUME_SCHEMA ──────────────────────────────────────────────────────────────

export interface ResumeExperience {
  company: string;
  title: string;
  start_date?: string;
  end_date?: string | null;
  description?: string;
  metrics: string[];       // quantifiable achievements, may be empty
  technologies: string[];  // tools/tech mentioned in this role
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
  headline?: string | null;   // e.g. "Senior Backend Engineer"
  summary?: string | null;
  years_of_experience?: number | null;
  skills: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  languages: string[];
  certifications: string[];
  work_auth_status?: string | null; // from resume text only — never inferred
}

// ── JOB_SCHEMA ────────────────────────────────────────────────────────────────

export interface JobSchema {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  type?: string | null;   // Full-time | Part-time | Contract | Freelance | Internship
  seniority?: string | null; // Junior | Mid-level | Senior | Lead | Executive
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string | null;
  must_have_skills: string[];   // explicitly required
  nice_to_have_skills: string[]; // preferred / bonus
  visa_sponsorship: "YES" | "NO" | "UNKNOWN";
  relocation_assistance: boolean;
  eligible_countries: string[]; // ISO-3166 alpha-2 codes
  description?: string | null;  // cleaned, max ~2000 chars
  requirements: string[];       // extracted requirement bullets
  responsibilities: string[];   // extracted responsibility bullets
}

// ── MATCH_SCHEMA ──────────────────────────────────────────────────────────────

export type MatchRecommendation = "apply" | "stretch" | "skip";
export type SeniorityMatch = "match" | "over" | "under" | "unknown";

export interface MatchSchema {
  score: number;                        // 0–100
  must_have_coverage_pct: number;       // 0–100
  nice_to_have_coverage_pct: number;   // 0–100
  matched_skills: string[];
  missing_must_haves: string[];
  missing_nice_to_haves: string[];
  location_match: boolean;
  work_auth_ok: boolean;
  visa_ok: boolean;
  seniority_match: SeniorityMatch;
  recommendation: MatchRecommendation;
  explanation: string; // 2–3 sentence rationale
}

// ── TAILORED_RESUME_SCHEMA ────────────────────────────────────────────────────

export interface TailoredExperience {
  company: string;
  title: string;
  period: string; // e.g. "Jan 2021 – Mar 2023"
  bullets: string[]; // rewritten bullets aligned to job
}

export interface TailoredResumeSchema {
  summary: string;
  skills: string[];           // top ~10 most relevant from candidate's actual skills
  experience: TailoredExperience[];
  ats_keywords: string[];     // keywords from JD to embed
  warnings: string[];         // items flagged as requires_user_confirmation
  change_log?: string[];      // list of what was changed from the original resume
}

// ── COVER_LETTER_PACK_SCHEMA ───────────────────────────────────────────────────

export interface CoverLetterPackSchema {
  subject_line: string;
  salutation: string;
  body: string;   // 3 paragraphs, 200–300 words
  closing: string;
  tone: "professional" | "warm" | "direct";
  word_count: number;
}

// ── GUARD_REPORT_SCHEMA ───────────────────────────────────────────────────────

export type IssueType = "fabrication" | "inconsistency" | "exaggeration";
export type IssueSeverity = "high" | "medium" | "low";

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
  requires_user_confirmation: string[]; // placeholders needing candidate input
  confidence: number; // 0–1, guard's confidence in its verdict
}

// ── RANKED JOB ENTRY ──────────────────────────────────────────────────────────

export interface RankedJob {
  job_id: string;
  job_json: JobSchema;
  match: MatchSchema;
}

// ── TAILORED OUTPUT ENTRY ─────────────────────────────────────────────────────

export interface TailoredOutput {
  job_id: string;
  tailored_resume: TailoredResumeSchema;
  cover_letter_pack: CoverLetterPackSchema;
  guard_report: GuardReportSchema;
}

// ── BUDGET TRACKING ───────────────────────────────────────────────────────────

export interface BudgetInfo {
  token_budget_total: number;
  token_used_estimate: number;
  stopped_reason: string; // empty if not stopped early
}

// ── FINAL OUTPUT ──────────────────────────────────────────────────────────────

export type OrchestratorStatus = "ok" | "partial" | "blocked";

export interface OrchestratorOutput {
  run_id: string;           // UUID generated at run start — use for log correlation
  status: OrchestratorStatus;
  budget: BudgetInfo;
  resume_json: ResumeSchema;
  ranked_jobs: RankedJob[];
  tailored_outputs: TailoredOutput[];
  notes_for_ui: string[];
}
