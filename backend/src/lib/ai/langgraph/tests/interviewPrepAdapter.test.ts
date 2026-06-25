import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the existing pack builder (it writes a CandidateAgentTask to the DB).
vi.mock("../../../autopilot/framework.js", () => ({
  buildInterviewPrepPack: vi.fn(async () => ({
    taskId: "task-1",
    focusAreas: ["backend"],
    likelyQuestions: ["q1", "q2", "q3"],
    candidateStories: [],
    recruiterReplyDraft: "",
    schedulingNotes: [],
  })),
}));

import {
  computeProfileCompleteness,
  runInterviewPrepRollout,
} from "../integration/interviewPrepAdapter.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
});

describe("computeProfileCompleteness", () => {
  it("is 100 for a full profile and 0 for an empty one", () => {
    expect(
      computeProfileCompleteness({ headline: "x", bio: "y", skills: ["a"], yearsExperience: 3, resumes: [{}] } as never),
    ).toBe(100);
    expect(computeProfileCompleteness({} as never)).toBe(0);
  });
  it("is proportional for a partial profile", () => {
    // 2 of 5 signals → 40
    expect(computeProfileCompleteness({ headline: "x", skills: ["a"] } as never)).toBe(40);
  });
});

describe("runInterviewPrepRollout", () => {
  it("returns the pack plus a deterministic readiness score", async () => {
    const input = {
      user: {},
      profile: { headline: "x", bio: "y", skills: ["a"], yearsExperience: 3, resumes: [{}] },
      application: { id: "app-1" },
      job: { id: "job-1", title: "Engineer", description: "d", tags: ["ts"], sourceName: "Acme" },
    } as never;
    const out = await runInterviewPrepRollout(input, "cand-1");
    expect(out.pack.likelyQuestions).toHaveLength(3);
    // completeness 100, materials true (+20), company true (+20) → clamp(60+20+20)=100
    expect(out.readinessScore).toBe(100);
  });

  it("reflects missing company data + materials in readiness", async () => {
    const input = {
      user: {},
      profile: { headline: "x", skills: ["a"] }, // completeness 40
      application: { id: "app-1" },
      job: { id: "job-1", title: "Engineer", description: "d", tags: [], sourceName: null },
    } as never;
    const out = await runInterviewPrepRollout(input, "cand-2");
    // 40*0.6=24 + materials 20 + company 0 = 44
    expect(out.readinessScore).toBe(44);
  });
});
