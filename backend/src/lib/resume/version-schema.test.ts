// Wave 5 PR #1 — smoke tests for the ResumeVersion Zod contract.
//
// Broader resume-builder coverage (route round-trips, Playwright happy path)
// lives in Wave 5 PR #4 owned by qa-tester. This file only asserts the
// schema-level contract that PR #2 / PR #3 depend on.

import { describe, it, expect } from "vitest";
import {
  RESUME_CONTENT_MAX_BYTES,
  resumeContentSchema,
  resumeVersionCreateSchema,
  resumeVersionScoresSchema,
  resumeVersionUpdateSchema,
} from "./version-schema.js";

const validUuid = "00000000-0000-4000-8000-000000000001";

describe("resumeVersionCreateSchema", () => {
  it("accepts the minimum payload (candidateId only)", () => {
    const result = resumeVersionCreateSchema.safeParse({ candidateId: validUuid });
    expect(result.success).toBe(true);
  });

  it("accepts a full payload with scores and target job", () => {
    const result = resumeVersionCreateSchema.safeParse({
      candidateId: validUuid,
      targetJobId: validUuid,
      originalContent: { summary: "x" },
      optimizedContent: { summary: "y" },
      atsScore: 82,
      matchScore: 91,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid candidateId", () => {
    const result = resumeVersionCreateSchema.safeParse({ candidateId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects atsScore above 100", () => {
    const result = resumeVersionCreateSchema.safeParse({
      candidateId: validUuid,
      atsScore: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative matchScore", () => {
    const result = resumeVersionCreateSchema.safeParse({
      candidateId: validUuid,
      matchScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer atsScore", () => {
    const result = resumeVersionCreateSchema.safeParse({
      candidateId: validUuid,
      atsScore: 82.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("resumeVersionScoresSchema", () => {
  it("accepts both scores at the boundaries", () => {
    expect(
      resumeVersionScoresSchema.safeParse({ atsScore: 0, matchScore: 100 }).success
    ).toBe(true);
  });

  it("accepts an empty object (both fields are optional)", () => {
    expect(resumeVersionScoresSchema.safeParse({}).success).toBe(true);
  });
});

describe("resumeVersionUpdateSchema", () => {
  it("forbids candidateId in updates", () => {
    const result = resumeVersionUpdateSchema.safeParse({
      candidateId: validUuid,
      atsScore: 80,
    });
    // .partial().omit() strips candidateId from the schema; Zod by default
    // ignores unknown keys, so the parse succeeds but candidateId is dropped.
    expect(result.success).toBe(true);
    if (result.success) {
      expect("candidateId" in result.data).toBe(false);
    }
  });

  it("accepts a partial score-only update", () => {
    expect(
      resumeVersionUpdateSchema.safeParse({ atsScore: 75 }).success
    ).toBe(true);
  });
});

describe("resumeContentSchema serialized-size cap", () => {
  it("accepts a small resume content payload", () => {
    expect(
      resumeContentSchema.safeParse({ summary: "Senior engineer with 10y exp" }).success
    ).toBe(true);
  });

  it("accepts a payload exactly at the cap", () => {
    // Pad a value so that JSON.stringify({ k: "<pad>" }) lands at the cap.
    // Envelope is `{"k":"…"}` = 8 chars, so the padding length = cap - 8.
    const padding = "a".repeat(RESUME_CONTENT_MAX_BYTES - 8);
    expect(resumeContentSchema.safeParse({ k: padding }).success).toBe(true);
  });

  it("rejects a payload larger than the cap", () => {
    const tooBig = "a".repeat(RESUME_CONTENT_MAX_BYTES);
    const result = resumeContentSchema.safeParse({ k: tooBig });
    expect(result.success).toBe(false);
  });

  it("rejects a too-large originalContent inside resumeVersionCreateSchema", () => {
    const tooBig = "a".repeat(RESUME_CONTENT_MAX_BYTES);
    const result = resumeVersionCreateSchema.safeParse({
      candidateId: validUuid,
      originalContent: { k: tooBig },
    });
    expect(result.success).toBe(false);
  });
});
