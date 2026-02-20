// Orchestrator unit tests — run with: MOCK_AI=1 npx tsx --test tests/orchestrator.test.ts
// No Claude API key needed when MOCK_AI=1

import { test } from "node:test";
import assert from "node:assert/strict";

test("validators can be imported", async () => {
  const validators = await import("../src/lib/ai/orchestrator/validators.js");
  assert.ok(validators.ResumeSchemaValidator);
  assert.ok(validators.JobSchemaValidator);
  assert.ok(validators.MatchSchemaValidator);
  assert.ok(validators.TailoredResumeSchemaValidator);
  assert.ok(validators.CoverLetterPackSchemaValidator);
  assert.ok(validators.GuardReportSchemaValidator);
});

test("ResumeSchemaValidator accepts minimal resume", async () => {
  const { ResumeSchemaValidator } = await import("../src/lib/ai/orchestrator/validators.js");
  const r = ResumeSchemaValidator.safeParse({ skills: [], experience: [], education: [], languages: [], certifications: [] });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("MatchSchemaValidator accepts valid match", async () => {
  const { MatchSchemaValidator } = await import("../src/lib/ai/orchestrator/validators.js");
  const r = MatchSchemaValidator.safeParse({
    score: 75, must_have_coverage_pct: 80, nice_to_have_coverage_pct: 60,
    matched_skills: [], missing_must_haves: [], missing_nice_to_haves: [],
    location_match: true, work_auth_ok: true, visa_ok: true,
    seniority_match: "match", recommendation: "apply", explanation: "Good match",
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("CoverLetterPackSchemaValidator accepts valid cover letter", async () => {
  const { CoverLetterPackSchemaValidator } = await import("../src/lib/ai/orchestrator/validators.js");
  const r = CoverLetterPackSchemaValidator.safeParse({
    subject_line: "Application", salutation: "Dear Hiring Manager,",
    body: "I am excited to apply.", closing: "Thank you.", tone: "professional", word_count: 10,
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("GuardReportSchemaValidator accepts passing report", async () => {
  const { GuardReportSchemaValidator } = await import("../src/lib/ai/orchestrator/validators.js");
  const r = GuardReportSchemaValidator.safeParse({
    verdict: "PASS", issues: [], requires_user_confirmation: [], confidence: 0.99,
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

test("TailoredResumeSchemaValidator accepts valid tailored resume", async () => {
  const { TailoredResumeSchemaValidator } = await import("../src/lib/ai/orchestrator/validators.js");
  const r = TailoredResumeSchemaValidator.safeParse({
    summary: "Tailored summary", skills: [], experience: [],
    ats_keywords: [], warnings: [], change_log: [],
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});
