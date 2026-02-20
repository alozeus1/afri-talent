export type RunType = "resume_review" | "job_match" | "apply_pack";
export interface JobInput {
    job_id: string;
    source: "linkedin" | "indeed" | "company_site" | "internal";
    url?: string;
    raw_text: string;
}
export interface CandidateProfile {
    location?: string;
    target_roles?: string[];
    work_auth?: string;
}
export interface OrchestratorLimits {
    max_jobs?: number;
    max_tailored_jobs?: number;
    token_budget_total?: number;
}
export interface OrchestratorInput {
    run_type: RunType;
    user_id: string;
    resume_text: string;
    candidate_profile?: CandidateProfile;
    jobs?: JobInput[];
    limits?: OrchestratorLimits;
    /** Pre-computed cache to avoid redundant AI calls */
    cached?: {
        resume_json?: ResumeSchema | null;
        job_json_by_job_id?: Record<string, JobSchema>;
    };
}
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
export type MatchRecommendation = "apply" | "stretch" | "skip";
export type SeniorityMatch = "match" | "over" | "under" | "unknown";
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
}
export interface CoverLetterPackSchema {
    subject_line: string;
    salutation: string;
    body: string;
    closing: string;
    tone: "professional" | "warm" | "direct";
    word_count: number;
}
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
    requires_user_confirmation: string[];
    confidence: number;
}
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
export interface BudgetInfo {
    token_budget_total: number;
    token_used_estimate: number;
    stopped_reason: string;
}
export type OrchestratorStatus = "ok" | "partial" | "blocked";
export interface OrchestratorOutput {
    status: OrchestratorStatus;
    budget: BudgetInfo;
    resume_json: ResumeSchema;
    ranked_jobs: RankedJob[];
    tailored_outputs: TailoredOutput[];
    notes_for_ui: string[];
}
//# sourceMappingURL=types.d.ts.map