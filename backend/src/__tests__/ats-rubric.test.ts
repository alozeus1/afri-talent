// Wave 5 PR #4 — vitest coverage for the ATS rubric scoring service.
//
// Covers the service exported by backend/src/services/ats-rubric.ts. The
// route handler (backend/src/routes/skills/resume-builder.ts) is exercised
// indirectly via supertest in adjacent tests; this file focuses on the pure
// scoring + persistence behaviour of `scoreAtsRubric`.
//
// vitest.config.ts sets MOCK_AI=1 globally, so `scanResumeAts` always takes
// its deterministic mock branch. We mock the persistence helper and the
// Prisma client so no database is required.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI persistence helper — createAiRun is invoked fire-and-forget,
// so we expose a vi.fn we can assert against without actually writing to the
// AiRun table.
vi.mock("../lib/ai/persistence.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/ai/persistence.js")>(
    "../lib/ai/persistence.js"
  );
  return {
    ...actual,
    createAiRun: vi.fn().mockResolvedValue(undefined),
    // hashText is a pure sha256 — keep the real implementation so logged
    // hashes match the production format.
  };
});

// Mock the Prisma client. Both code paths (jobs lookup + resume version
// persistence) are exercised through these spies.
vi.mock("../lib/prisma.js", () => ({
  default: {
    job: {
      findUnique: vi.fn(),
    },
    candidateResumeVersion: {
      create: vi.fn(),
    },
  },
}));

// Imports must come AFTER the vi.mock calls above (vitest hoists vi.mock,
// but keeping the explicit ordering matches sibling tests' style).
import { scoreAtsRubric } from "../services/ats-rubric.js";
import { createAiRun } from "../lib/ai/persistence.js";
import prisma from "../lib/prisma.js";
import { atsRubricResponseSchema } from "../lib/resume/rubric-schema.js";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_JOB_ID = "22222222-2222-4222-8222-222222222222";

// A resume content payload that exercises every walk path: nested objects,
// arrays of strings, numbers, and booleans. Long enough (~600 chars after
// walkContent flattening) to avoid the "<400 chars" formatting penalty.
const RICH_RESUME = {
  summary:
    "Senior backend engineer with 8 years building distributed payments systems on AWS using TypeScript Node Postgres Redis Kafka and Kubernetes.",
  skills: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "Kubernetes", "Redis"],
  experience: [
    {
      company: "PayRail",
      title: "Senior Engineer",
      from: 2022,
      to: 2026,
      bullets: [
        "Cut p95 latency from 900ms to 420ms",
        "Grew checkout conversion from 2.1% to 3.8%",
      ],
    },
    {
      company: "Flutterpay",
      title: "Software Engineer",
      from: 2019,
      to: 2022,
      bullets: ["Built reconciliation pipeline processing 2M transactions per day"],
    },
  ],
  education: [{ school: "University of Lagos", degree: "BSc Computer Science" }],
  remote: true,
};

const PAYMENTS_JD =
  "Senior Backend Engineer — Payments. We build distributed payments " +
  "infrastructure on AWS using TypeScript and PostgreSQL. Strong Kubernetes " +
  "and Redis experience required. Familiarity with Kafka or RabbitMQ is a " +
  "plus. Located in Lagos or fully remote.";

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock returns: keep unrelated tests quiet. Individual tests that
  // exercise error branches override these with mockResolvedValueOnce /
  // mockRejectedValueOnce.
  vi.mocked(prisma.candidateResumeVersion.create).mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000abc",
  } as never);
  vi.mocked(prisma.job.findUnique).mockResolvedValue({
    title: "Default test job",
    description: PAYMENTS_JD,
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scoreAtsRubric — MOCK_AI=1 (vitest.config sets MOCK_AI globally)", () => {
  it("returns a response that satisfies atsRubricResponseSchema", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    const parsed = atsRubricResponseSchema.safeParse(result);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("emits `source: \"template\"` because scanResumeAts takes the MOCK_AI branch", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(result.source).toBe("template");
  });

  it("returns optimizedContent === null when MOCK_AI=1 is in effect", async () => {
    // ats-rubric.ts:92-94 — `MOCK_AI || AI_DISABLED ? null : buildMockOptimizedContent(...)`.
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(result.optimizedContent).toBeNull();
  });

  it("produces exactly the four core rubric criteria with weights summing to 100", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    const keys = result.criteria.map((c) => c.key).sort();
    expect(keys).toEqual(["experience", "formatting", "keywords", "skills"]);

    const totalWeight = result.criteria.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it("clamps atsScore + matchScore into [0, 100]", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
    expect(result.matchScore).not.toBeNull();
    expect(result.matchScore!).toBeGreaterThanOrEqual(0);
    expect(result.matchScore!).toBeLessThanOrEqual(100);
    for (const c of result.criteria) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scoreAtsRubric — target-job handling", () => {
  it("returns matchScore === null when neither targetJobId nor targetJobDescription is provided", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
    });

    expect(result.matchScore).toBeNull();
    // Without a target job, the experience criterion uses the no-JD fallback.
    const experience = result.criteria.find((c) => c.key === "experience");
    expect(experience?.notes[0]).toMatch(/general patterns/i);
  });

  it("prefers an explicit targetJobDescription over a targetJobId DB lookup", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
      targetJobDescription: PAYMENTS_JD,
    });

    // resolveJobDescription returns the explicit description on line 131-133
    // BEFORE touching Prisma, so prisma.job.findUnique must not be called.
    expect(prisma.job.findUnique).not.toHaveBeenCalled();
    expect(result.matchScore).not.toBeNull();
  });

  it("falls back to prisma.job.findUnique when only targetJobId is provided", async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValueOnce({
      title: "Backend Engineer",
      description: "Build APIs in TypeScript on AWS with PostgreSQL.",
    } as never);

    await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
    });

    expect(prisma.job.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.job.findUnique).toHaveBeenCalledWith({
      where: { id: TEST_JOB_ID },
      select: { description: true, title: true },
    });
  });

  it("treats a non-existent targetJobId as no-JD (returns matchScore null, no throw)", async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValueOnce(null as never);

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
    });

    expect(result.matchScore).toBeNull();
  });

  it("survives a Prisma error during job lookup without throwing", async () => {
    vi.mocked(prisma.job.findUnique).mockRejectedValueOnce(new Error("simulated DB outage") as never);

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
    });

    // resolveJobDescription's try/catch swallows the error and returns null,
    // so the request still produces a valid rubric.
    expect(result.matchScore).toBeNull();
    expect(result.criteria.length).toBe(4);
  });
});

describe("scoreAtsRubric — persistence", () => {
  it("does NOT persist a CandidateResumeVersion when no targetJobId is provided", async () => {
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(prisma.candidateResumeVersion.create).not.toHaveBeenCalled();
    expect(result.resumeVersionId).toBeNull();
  });

  it("persists a CandidateResumeVersion when targetJobId is provided, with userId from input", async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValueOnce({
      title: "Backend Engineer",
      description: PAYMENTS_JD,
    } as never);
    vi.mocked(prisma.candidateResumeVersion.create).mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
    } as never);

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
    });

    expect(prisma.candidateResumeVersion.create).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.candidateResumeVersion.create).mock.calls[0]![0]!;
    // Security invariant: userId comes from the service caller (route handler
    // pulls it from req.user), NOT from the resume content body. This test
    // asserts the data row reflects the *input* userId verbatim.
    expect(call.data.userId).toBe(TEST_USER_ID);
    expect(call.data.jobId).toBe(TEST_JOB_ID);
    expect(call.data.source).toBe("AI_TAILOR");
    expect(call.data.status).toBe("READY");
    expect(typeof call.data.atsScore).toBe("number");
    expect(result.resumeVersionId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("returns a null resumeVersionId (and does not throw) when persistence fails", async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValueOnce({
      title: "x",
      description: PAYMENTS_JD,
    } as never);
    vi.mocked(prisma.candidateResumeVersion.create).mockRejectedValueOnce(
      new Error("simulated unique violation") as never
    );

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobId: TEST_JOB_ID,
    });

    expect(result.resumeVersionId).toBeNull();
    // The scoring portion still succeeds — persistence is non-fatal.
    expect(result.criteria.length).toBe(4);
  });
});

describe("scoreAtsRubric — fire-and-forget AiRun header", () => {
  it("invokes createAiRun with the run_type 'resume_review' and a stable token budget", async () => {
    await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(createAiRun).toHaveBeenCalledTimes(1);
    const [userId, runId, runType, , tokenBudget] = vi.mocked(createAiRun).mock.calls[0]!;
    expect(userId).toBe(TEST_USER_ID);
    expect(runType).toBe("resume_review");
    expect(tokenBudget).toBe(8_000);
    // runId is a randomUUID — assert it looks like a v4 UUID.
    expect(runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("does NOT await createAiRun — service returns even if the persistence promise never resolves", async () => {
    // Replace createAiRun with a promise that never settles. If scoreAtsRubric
    // awaited it, this test would time out at vitest.config testTimeout (10s).
    vi.mocked(createAiRun).mockImplementationOnce(() => new Promise<void>(() => {}));

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: RICH_RESUME,
      targetJobDescription: PAYMENTS_JD,
    });

    expect(result.criteria.length).toBe(4);
  });
});

describe("scoreAtsRubric — formatting + edge cases", () => {
  it("penalises formatting when the resume body is shorter than 400 characters", async () => {
    const shortResume = { summary: "Quick blurb. 10 yrs." };

    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: shortResume,
    });

    const formatting = result.criteria.find((c) => c.key === "formatting");
    expect(formatting?.notes.some((n) => /unusually short/i.test(n))).toBe(true);
    // 80 baseline − 25 (short) − 10 (digits are present here, so not deducted)
    // = 55 at most. The exact number matters less than the cap.
    expect(formatting!.score).toBeLessThan(80);
  });

  it("flags missing quantified achievements when the resume contains no digits", async () => {
    // Long enough to dodge the <400 char penalty so we isolate the digit rule.
    const longTextNoDigits = "a ".repeat(250).trim();
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: { summary: longTextNoDigits },
    });

    const formatting = result.criteria.find((c) => c.key === "formatting");
    expect(formatting?.notes.some((n) => /quantified|numbers/i.test(n))).toBe(true);
  });

  it("handles a resume with no extractable text by returning a valid (low) score", async () => {
    const emptyResume = { meta: null };
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: emptyResume,
    });

    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
    expect(result.criteria.length).toBe(4);
    expect(result.matchScore).toBeNull();
  });

  it("truncates resume text walk to 20_000 chars (no length-bomb explosion)", async () => {
    // A pathological payload that, if untruncated, would balloon the rubric
    // computation. The internal walk caps at 20k chars — we just verify the
    // call returns cleanly with a valid envelope.
    const huge = { summary: "a ".repeat(50_000) };
    const result = await scoreAtsRubric({
      userId: TEST_USER_ID,
      resumeContent: huge,
    });

    const parsed = atsRubricResponseSchema.safeParse(result);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
