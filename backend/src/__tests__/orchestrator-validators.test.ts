/**
 * Pure unit tests for the orchestrator Zod validators.
 *
 * No HTTP server, no DB, no Claude API — just schema validation.
 * These tests run in < 1 second and validate that the schemas
 * correctly accept/reject agent outputs.
 */

import { describe, it, expect } from "vitest";
import {
  ResumeSchemaValidator,
  JobSchemaValidator,
  MatchSchemaValidator,
  TailoredResumeSchemaValidator,
  CoverLetterPackSchemaValidator,
  GuardReportSchemaValidator,
} from "../lib/ai/orchestrator/validators.js";

// ── ResumeSchemaValidator ─────────────────────────────────────────────────────

describe("ResumeSchemaValidator", () => {
  it("accepts a fully empty object (all arrays default to [])", () => {
    const result = ResumeSchemaValidator.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
      expect(result.data.experience).toEqual([]);
      expect(result.data.education).toEqual([]);
    }
  });

  it("accepts a rich resume with all fields", () => {
    const result = ResumeSchemaValidator.safeParse({
      name: "Ada Obi",
      email: "ada@example.com",
      years_of_experience: 5,
      skills: ["Python", "SQL"],
      experience: [
        {
          company: "TechCo",
          title: "Engineer",
          start_date: "2020-01",
          end_date: null,
          metrics: ["30% perf gain"],
          technologies: ["Python"],
        },
      ],
      education: [
        { institution: "Uni of Lagos", degree: "BSc", field: "CS", graduation_year: "2019" },
      ],
      languages: ["English"],
      certifications: ["AWS SAA"],
      work_auth_status: "citizen",
    });
    expect(result.success).toBe(true);
  });
});

// ── JobSchemaValidator ────────────────────────────────────────────────────────

describe("JobSchemaValidator", () => {
  it("accepts a fully empty object (all fields optional)", () => {
    const result = JobSchemaValidator.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      // Defaults
      expect(result.data.visa_sponsorship).toBe("UNKNOWN");
      expect(result.data.relocation_assistance).toBe(false);
      expect(result.data.must_have_skills).toEqual([]);
    }
  });

  it("rejects invalid visa_sponsorship value", () => {
    const result = JobSchemaValidator.safeParse({ visa_sponsorship: "MAYBE" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid visa_sponsorship values", () => {
    for (const val of ["YES", "NO", "UNKNOWN"] as const) {
      const r = JobSchemaValidator.safeParse({ visa_sponsorship: val });
      expect(r.success).toBe(true);
    }
  });
});

// ── MatchSchemaValidator ──────────────────────────────────────────────────────

describe("MatchSchemaValidator", () => {
  const BASE_MATCH = {
    score: 75,
    must_have_coverage_pct: 80,
    nice_to_have_coverage_pct: 60,
    location_match: true,
    work_auth_ok: true,
    visa_ok: true,
    seniority_match: "match" as const,
    recommendation: "apply" as const,
    explanation: "Strong candidate.",
  };

  it("accepts a valid match", () => {
    expect(MatchSchemaValidator.safeParse(BASE_MATCH).success).toBe(true);
  });

  it("rejects score > 100", () => {
    const r = MatchSchemaValidator.safeParse({ ...BASE_MATCH, score: 150 });
    expect(r.success).toBe(false);
  });

  it("rejects score < 0", () => {
    const r = MatchSchemaValidator.safeParse({ ...BASE_MATCH, score: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects invalid recommendation value", () => {
    const r = MatchSchemaValidator.safeParse({ ...BASE_MATCH, recommendation: "maybe" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid seniority_match value", () => {
    const r = MatchSchemaValidator.safeParse({ ...BASE_MATCH, seniority_match: "senior" });
    expect(r.success).toBe(false);
  });

  it("accepts all valid recommendation values", () => {
    for (const rec of ["apply", "stretch", "skip"] as const) {
      expect(MatchSchemaValidator.safeParse({ ...BASE_MATCH, recommendation: rec }).success).toBe(true);
    }
  });
});

// ── TailoredResumeSchemaValidator ─────────────────────────────────────────────

describe("TailoredResumeSchemaValidator", () => {
  it("accepts a minimal tailored resume", () => {
    const result = TailoredResumeSchemaValidator.safeParse({ summary: "Experienced engineer." });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
      expect(result.data.experience).toEqual([]);
      expect(result.data.ats_keywords).toEqual([]);
    }
  });

  it("rejects experience entry missing required company/title", () => {
    const result = TailoredResumeSchemaValidator.safeParse({
      summary: "Engineer",
      experience: [{ bullets: [] }], // missing company + title + period
    });
    expect(result.success).toBe(false);
  });
});

// ── CoverLetterPackSchemaValidator ────────────────────────────────────────────

describe("CoverLetterPackSchemaValidator", () => {
  const BASE_CL = {
    subject_line: "Application for Senior Engineer",
    salutation: "Dear Hiring Manager,",
    body: "I am excited to apply for this role.",
    closing: "Thank you for your time.",
    tone: "professional" as const,
    word_count: 20,
  };

  it("accepts a valid cover letter pack", () => {
    expect(CoverLetterPackSchemaValidator.safeParse(BASE_CL).success).toBe(true);
  });

  it("rejects invalid tone value", () => {
    const r = CoverLetterPackSchemaValidator.safeParse({ ...BASE_CL, tone: "aggressive" });
    expect(r.success).toBe(false);
  });

  it("accepts all valid tone values", () => {
    for (const tone of ["professional", "warm", "direct"] as const) {
      expect(CoverLetterPackSchemaValidator.safeParse({ ...BASE_CL, tone }).success).toBe(true);
    }
  });

  it("rejects negative word_count", () => {
    const r = CoverLetterPackSchemaValidator.safeParse({ ...BASE_CL, word_count: -1 });
    expect(r.success).toBe(false);
  });
});

// ── GuardReportSchemaValidator ────────────────────────────────────────────────

describe("GuardReportSchemaValidator", () => {
  const BASE_GUARD = {
    verdict: "PASS" as const,
    issues: [],
    requires_user_confirmation: [],
    confidence: 0.99,
  };

  it("accepts a clean PASS report", () => {
    expect(GuardReportSchemaValidator.safeParse(BASE_GUARD).success).toBe(true);
  });

  it("accepts a FAIL report with issues", () => {
    const result = GuardReportSchemaValidator.safeParse({
      ...BASE_GUARD,
      verdict: "FAIL",
      issues: [
        {
          type: "fabrication",
          field: "skills",
          original_value: "Python",
          fabricated_value: "Rust",
          severity: "high",
        },
      ],
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid verdict", () => {
    const r = GuardReportSchemaValidator.safeParse({ ...BASE_GUARD, verdict: "UNCERTAIN" });
    expect(r.success).toBe(false);
  });

  it("rejects confidence > 1", () => {
    const r = GuardReportSchemaValidator.safeParse({ ...BASE_GUARD, confidence: 1.1 });
    expect(r.success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    const r = GuardReportSchemaValidator.safeParse({ ...BASE_GUARD, confidence: -0.1 });
    expect(r.success).toBe(false);
  });

  it("rejects invalid issue type", () => {
    const r = GuardReportSchemaValidator.safeParse({
      ...BASE_GUARD,
      issues: [
        {
          type: "lie",  // invalid
          field: "experience",
          original_value: "5 years",
          fabricated_value: "10 years",
          severity: "high",
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
