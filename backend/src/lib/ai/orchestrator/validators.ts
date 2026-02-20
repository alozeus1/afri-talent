// ─────────────────────────────────────────────────────────────────────────────
// AfriTalent Orchestrator — Zod runtime validators for all agent output schemas
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod/v4";

// ── ResumeSchemaValidator ─────────────────────────────────────────────────────

const ResumeExperienceValidator = z.object({
  company: z.string(),
  title: z.string(),
  start_date: z.string().optional(),
  end_date: z.string().nullable().optional(),
  description: z.string().optional(),
  metrics: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
});

const ResumeEducationValidator = z.object({
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  graduation_year: z.string().optional(),
});

export const ResumeSchemaValidator = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  years_of_experience: z.number().nullable().optional(),
  skills: z.array(z.string()).default([]),
  experience: z.array(ResumeExperienceValidator).default([]),
  education: z.array(ResumeEducationValidator).default([]),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  work_auth_status: z.string().nullable().optional(),
});

// ── JobSchemaValidator ────────────────────────────────────────────────────────

export const JobSchemaValidator = z.object({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  must_have_skills: z.array(z.string()).default([]),
  nice_to_have_skills: z.array(z.string()).default([]),
  visa_sponsorship: z.enum(["YES", "NO", "UNKNOWN"]).default("UNKNOWN"),
  relocation_assistance: z.boolean().default(false),
  eligible_countries: z.array(z.string()).default([]),
  description: z.string().nullable().optional(),
  requirements: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
});

// ── MatchSchemaValidator ──────────────────────────────────────────────────────

export const MatchSchemaValidator = z.object({
  score: z.number().min(0).max(100),
  must_have_coverage_pct: z.number().min(0).max(100),
  nice_to_have_coverage_pct: z.number().min(0).max(100),
  matched_skills: z.array(z.string()).default([]),
  missing_must_haves: z.array(z.string()).default([]),
  missing_nice_to_haves: z.array(z.string()).default([]),
  location_match: z.boolean(),
  work_auth_ok: z.boolean(),
  visa_ok: z.boolean(),
  seniority_match: z.enum(["match", "over", "under", "unknown"]),
  recommendation: z.enum(["apply", "stretch", "skip"]),
  explanation: z.string(),
});

// ── TailoredResumeSchemaValidator ─────────────────────────────────────────────

const TailoredExperienceValidator = z.object({
  company: z.string(),
  title: z.string(),
  period: z.string(),
  bullets: z.array(z.string()).default([]),
});

export const TailoredResumeSchemaValidator = z.object({
  summary: z.string(),
  skills: z.array(z.string()).default([]),
  experience: z.array(TailoredExperienceValidator).default([]),
  ats_keywords: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  change_log: z.array(z.string()).default([]),
});

// ── CoverLetterPackSchemaValidator ────────────────────────────────────────────

export const CoverLetterPackSchemaValidator = z.object({
  subject_line: z.string(),
  salutation: z.string(),
  body: z.string(),
  closing: z.string(),
  tone: z.enum(["professional", "warm", "direct"]),
  word_count: z.number().int().nonnegative(),
});

// ── GuardReportSchemaValidator ────────────────────────────────────────────────

const GuardIssueValidator = z.object({
  type: z.enum(["fabrication", "inconsistency", "exaggeration"]),
  field: z.string(),
  original_value: z.string(),
  fabricated_value: z.string(),
  severity: z.enum(["high", "medium", "low"]),
});

export const GuardReportSchemaValidator = z.object({
  verdict: z.enum(["PASS", "FAIL"]),
  issues: z.array(GuardIssueValidator).default([]),
  requires_user_confirmation: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

// ── Generic validation helper ─────────────────────────────────────────────────

export function validateAgentOutput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  agentName: string
): T {
  const result = schema.safeParse(raw);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.slice(0, 3);
  const firstIssue = issues[0]
    ? `[${issues[0].path.join(".") || "<root>"}] ${issues[0].message}`
    : "unknown validation error";

  console.error(
    `[validateAgentOutput] ${agentName} output failed schema validation.\n` +
      `First ${issues.length} issue(s):\n` +
      issues
        .map(
          (iss, i) =>
            `  ${i + 1}. [${iss.path.join(".") || "<root>"}] ${iss.message}`
        )
        .join("\n")
  );

  throw new Error(
    `${agentName} output failed schema validation: ${firstIssue}`
  );
}
