// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — interview prep adapter (rollout wiring)
//
// Wraps the existing buildInterviewPrepPack() in the interviewPrep graph so the
// /autopilot/interview-prep route gains a deterministic readiness score + a
// GraphRun audit trail, without changing the pack it returns. Used only when
// LANGGRAPH_INTERVIEW_PREP (or the global flag) is on — flag off = existing path.
// No external side effects.
// ─────────────────────────────────────────────────────────────────────────────

import { runInterviewPrep, type InterviewPrepResult } from "../graphs/interviewPrep.graph.js";
import { buildInterviewPrepPack, type InterviewPrepPack } from "../../../autopilot/framework.js";

type PrepInput = Parameters<typeof buildInterviewPrepPack>[0];

/** Deterministic profile-completeness proxy (0–100) from commonly-present fields. */
export function computeProfileCompleteness(profile: PrepInput["profile"]): number {
  const p = profile as { headline?: unknown; bio?: unknown; skills?: unknown[]; yearsExperience?: unknown; resumes?: unknown[] };
  const signals = [
    Boolean(p?.headline),
    Boolean(p?.bio),
    Array.isArray(p?.skills) && p.skills.length > 0,
    p?.yearsExperience != null,
    Array.isArray(p?.resumes) && p.resumes.length > 0,
  ];
  const present = signals.filter(Boolean).length;
  return Math.round((present / signals.length) * 100);
}

export interface InterviewPrepRolloutOutput {
  pack: InterviewPrepPack;
  readinessScore: number;
  graphRunId: string;
}

/**
 * Run the interview-prep graph around the existing pack builder. Returns the
 * same pack plus a readiness score. The pack is generated exactly once.
 */
export async function runInterviewPrepRollout(input: PrepInput, candidateId: string): Promise<InterviewPrepRolloutOutput> {
  let pack: InterviewPrepPack | undefined;
  const jobId = input.job.id;

  const result: InterviewPrepResult = await runInterviewPrep(candidateId, jobId, {
    loadContext: async () => ({
      profileCompleteness: computeProfileCompleteness(input.profile),
      hasApplicationMaterials: Boolean(input.application),
      companyDataAvailable: Boolean(input.job.sourceName),
    }),
    generateQuestions: async () => {
      pack = await buildInterviewPrepPack(input);
      return { questionsRef: pack.taskId, count: pack.likelyQuestions.length };
    },
    recordEvent: async () => {},
  });

  return { pack: pack as InterviewPrepPack, readinessScore: result.readinessScore, graphRunId: result.graphRunId };
}
