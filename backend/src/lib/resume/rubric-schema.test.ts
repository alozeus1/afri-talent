// Wave 5 PR #2 — smoke tests for the ATS rubric Zod contract.

import { describe, it, expect } from "vitest";
import {
  ATS_RUBRIC_ROW_MAX_BYTES,
  atsRubricRequestSchema,
  atsRubricResponseSchema,
  rubricCriterionSchema,
} from "./rubric-schema.js";

const uuid = "00000000-0000-4000-8000-000000000001";

describe("atsRubricRequestSchema", () => {
  it("accepts the minimum payload (resumeContent only)", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
    });
    expect(result.success).toBe(true);
  });

  it("does NOT accept a candidateId field (security: server-derives userId)", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
      candidateId: uuid,
    });
    // .object() default behaviour drops unknown keys silently — so the parse
    // succeeds but candidateId is not present in the parsed output.
    expect(result.success).toBe(true);
    if (result.success) {
      expect("candidateId" in result.data).toBe(false);
    }
  });

  it("accepts a targetJobId UUID", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
      targetJobId: uuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID targetJobId", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
      targetJobId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a targetJobDescription string up to 20_000 chars", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
      targetJobDescription: "a".repeat(20_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a targetJobDescription longer than 20_000 chars", () => {
    const result = atsRubricRequestSchema.safeParse({
      resumeContent: { summary: "x" },
      targetJobDescription: "a".repeat(20_001),
    });
    expect(result.success).toBe(false);
  });
});

describe("rubricCriterionSchema", () => {
  it("accepts a well-formed criterion", () => {
    const result = rubricCriterionSchema.safeParse({
      key: "keywords",
      label: "Keyword coverage",
      score: 80,
      weight: 40,
      notes: ["Looks good."],
      present: ["react", "typescript"],
      missing: ["kubernetes"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a score above 100", () => {
    const result = rubricCriterionSchema.safeParse({
      key: "k",
      label: "L",
      score: 101,
      weight: 10,
      notes: [],
    });
    expect(result.success).toBe(false);
  });

  it("makes present/missing optional (non-keyword criteria)", () => {
    const result = rubricCriterionSchema.safeParse({
      key: "formatting",
      label: "Formatting",
      score: 70,
      weight: 20,
      notes: ["Looks fine."],
    });
    expect(result.success).toBe(true);
  });
});

describe("atsRubricResponseSchema", () => {
  it("accepts a full valid response", () => {
    const result = atsRubricResponseSchema.safeParse({
      resumeVersionId: uuid,
      atsScore: 82,
      matchScore: 75,
      criteria: [
        { key: "keywords", label: "Keywords", score: 80, weight: 40, notes: [], present: [], missing: [] },
        { key: "formatting", label: "Formatting", score: 90, weight: 20, notes: [] },
        { key: "experience", label: "Experience", score: 75, weight: 25, notes: [] },
        { key: "skills", label: "Skills", score: 70, weight: 15, notes: [] },
      ],
      suggestions: ["Add quantified achievements."],
      optimizedContent: { summary: "y" },
      source: "ai",
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one criterion", () => {
    const result = atsRubricResponseSchema.safeParse({
      resumeVersionId: null,
      atsScore: 0,
      matchScore: null,
      criteria: [],
      suggestions: [],
      optimizedContent: null,
      source: "template",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null branches: resumeVersionId/matchScore/optimizedContent", () => {
    const result = atsRubricResponseSchema.safeParse({
      resumeVersionId: null,
      atsScore: 50,
      matchScore: null,
      criteria: [
        { key: "k", label: "L", score: 50, weight: 100, notes: [] },
      ],
      suggestions: [],
      optimizedContent: null,
      source: "template",
    });
    expect(result.success).toBe(true);
  });
});

describe("ATS_RUBRIC_ROW_MAX_BYTES", () => {
  it("is 768 KB (envelope budget)", () => {
    expect(ATS_RUBRIC_ROW_MAX_BYTES).toBe(768 * 1024);
  });
});
