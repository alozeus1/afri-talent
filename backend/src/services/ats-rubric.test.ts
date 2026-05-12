// Wave 5 PR #2 — unit tests for the ATS rubric scoring service.
//
// vitest config sets MOCK_AI=1 globally, so the ATS scanner returns
// deterministic template output and no network calls happen. The Prisma
// calls in `scoreAtsRubric` are mocked via vi.mock — these tests assert
// the rubric composition + score math + persistence-shape boundaries,
// not actual DB writes (DB-touching coverage is qa-tester's PR #4 scope).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  default: {
    job: { findUnique: vi.fn().mockResolvedValue(null) },
    candidateResumeVersion: {
      create: vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000aaa" }),
    },
  },
}));

vi.mock("../lib/ai/persistence.js", async (importActual) => {
  const actual = await importActual<typeof import("../lib/ai/persistence.js")>();
  return {
    ...actual,
    createAiRun: vi.fn().mockResolvedValue(undefined),
  };
});

import prisma from "../lib/prisma.js";
import { scoreAtsRubric } from "./ats-rubric.js";

const userId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";

const sampleResume = {
  summary: "Senior software engineer with 10 years building distributed systems.",
  skills: ["typescript", "postgres", "kubernetes", "react"],
  experience: [
    { company: "Acme", title: "Staff Engineer", period: "2020-2024", bullets: ["Led platform migration", "Cut p95 latency 40%"] },
  ],
} satisfies Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scoreAtsRubric", () => {
  it("returns a 4-criteria rubric with weights summing to 100", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobId: null,
      targetJobDescription: null,
    });

    expect(result.criteria).toHaveLength(4);
    expect(result.criteria.map((c) => c.key)).toEqual([
      "keywords",
      "formatting",
      "experience",
      "skills",
    ]);
    const totalWeight = result.criteria.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it("returns atsScore as the weighted average of criteria scores", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
    });

    const totalWeight = result.criteria.reduce((s, c) => s + c.weight, 0);
    const weighted = result.criteria.reduce((s, c) => s + c.score * c.weight, 0);
    const expected = Math.round(weighted / totalWeight);
    expect(result.atsScore).toBe(expected);
    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
  });

  it("returns matchScore null when no target job is provided", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobId: null,
      targetJobDescription: null,
    });
    expect(result.matchScore).toBeNull();
  });

  it("returns matchScore 0-100 when targetJobDescription is provided", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobDescription: "Looking for a senior TypeScript engineer with Postgres and Kubernetes experience.",
    });
    expect(result.matchScore).not.toBeNull();
    expect(result.matchScore!).toBeGreaterThanOrEqual(0);
    expect(result.matchScore!).toBeLessThanOrEqual(100);
  });

  it("returns resumeVersionId null when no jobId is provided (no persistence anchor)", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobDescription: "Senior TS engineer.",
    });
    expect(result.resumeVersionId).toBeNull();
    expect(prisma.candidateResumeVersion.create).not.toHaveBeenCalled();
  });

  it("persists a CandidateResumeVersion when targetJobId is provided", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobId: jobId,
    });
    expect(result.resumeVersionId).toBe("00000000-0000-4000-8000-000000000aaa");
    expect(prisma.candidateResumeVersion.create).toHaveBeenCalledOnce();
    const call = (prisma.candidateResumeVersion.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.userId).toBe(userId);
    expect(call.data.jobId).toBe(jobId);
    expect(call.data.atsScore).toBe(result.atsScore);
  });

  it("never persists when persistence is called without a jobId, even if a description is provided", async () => {
    await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobDescription: "Looking for a TS engineer.",
    });
    expect(prisma.candidateResumeVersion.create).not.toHaveBeenCalled();
  });

  it("includes present/missing keyword arrays only on the keywords criterion", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobDescription: "Looking for kubernetes, postgres, terraform, observability skills.",
    });
    const keywords = result.criteria.find((c) => c.key === "keywords")!;
    const formatting = result.criteria.find((c) => c.key === "formatting")!;
    expect(Array.isArray(keywords.present)).toBe(true);
    expect(Array.isArray(keywords.missing)).toBe(true);
    expect(formatting.present).toBeUndefined();
    expect(formatting.missing).toBeUndefined();
  });

  it("returns source 'template' under MOCK_AI=1 (no Claude calls)", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
    });
    expect(result.source).toBe("template");
  });

  it("does not throw when persistence fails (non-fatal)", async () => {
    (prisma.candidateResumeVersion.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("simulated DB failure")
    );
    const result = await scoreAtsRubric({
      userId,
      resumeContent: sampleResume,
      targetJobId: jobId,
    });
    // Persistence failure surfaces as resumeVersionId: null but the scoring
    // result still returns.
    expect(result.resumeVersionId).toBeNull();
    expect(result.atsScore).toBeGreaterThanOrEqual(0);
  });

  it("clamps criterion scores to 0-100 even with adversarial inputs", async () => {
    const result = await scoreAtsRubric({
      userId,
      resumeContent: { summary: "" },
      targetJobDescription: "x".repeat(100),
    });
    for (const c of result.criteria) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});
