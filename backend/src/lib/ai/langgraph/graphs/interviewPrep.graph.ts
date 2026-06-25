// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — interview prep graph (Phase 8)
//
// Turns a job match / recruiter reply into an interview-prep pack: load context
// → generate role-specific questions (company-specific when data exists) →
// compute a deterministic readiness score. No external side effects, no HITL.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "interview_prep" as const;

export interface InterviewPrepDeps {
  loadContext: (candidateId: string, jobId: string) => Promise<{
    profileCompleteness: number; // 0–100
    hasApplicationMaterials: boolean;
    companyDataAvailable: boolean;
  }>;
  generateQuestions: (candidateId: string, jobId: string, companySpecific: boolean) => Promise<{ questionsRef: string; count: number }>;
  recordEvent: (candidateId: string, type: string, details: Record<string, string | number | boolean>) => Promise<void>;
}

const PrepState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  questionsRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  questionCount: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  readinessScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  companySpecific: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
});

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Deterministic readiness: profile drives 60%, materials +20, company prep +20. */
export function readiness(profileCompleteness: number, hasMaterials: boolean, companySpecific: boolean): number {
  return clamp(profileCompleteness * 0.6 + (hasMaterials ? 20 : 0) + (companySpecific ? 20 : 0));
}

interface Ctx { graphRunId: string; threadId: string; candidateId: string; jobId: string }

function buildGraph(deps: InterviewPrepDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(PrepState)
    .addNode("loadContext", async () => {
      const c = await deps.loadContext(ctx.candidateId, ctx.jobId);
      return {
        companySpecific: c.companyDataAvailable,
        currentStep: "generate",
        readinessScore: readiness(c.profileCompleteness, c.hasApplicationMaterials, c.companyDataAvailable),
      };
    })
    .addNode("generate", async (s) => {
      const { questionsRef, count } = await deps.generateQuestions(ctx.candidateId, ctx.jobId, s.companySpecific);
      return { questionsRef, questionCount: count, currentStep: "finalize" };
    })
    .addNode("finalize", async (s) => {
      await deps.recordEvent(ctx.candidateId, "interview_prep_ready", { readiness: s.readinessScore, questions: s.questionCount });
      await updateGraphRun(ctx.graphRunId, { status: "COMPLETE", currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, "COMPLETE");
      evt("graph_completed", "finalize", { readiness: s.readinessScore, questions: s.questionCount });
      return { status: "COMPLETE" as GraphRunStatus };
    })
    .addEdge(START, "loadContext")
    .addEdge("loadContext", "generate")
    .addEdge("generate", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export interface InterviewPrepResult {
  status: "COMPLETE";
  graphRunId: string;
  questionsRef?: string;
  questionCount: number;
  readinessScore: number;
}

export async function runInterviewPrep(
  candidateId: string,
  jobId: string,
  deps: InterviewPrepDeps,
  graphRunId?: string,
): Promise<InterviewPrepResult> {
  const gid = graphRunId ?? `interview-prep:${candidateId}:${jobId}`;
  const threadId = `candidate:${candidateId}:interview-prep:${jobId}`;
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId, candidateId, jobId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, candidateId, jobId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, candidateId, jobId, status: "RUNNING" }, config)) as typeof PrepState.State;

  return {
    status: "COMPLETE",
    graphRunId: gid,
    questionsRef: final.questionsRef,
    questionCount: final.questionCount,
    readinessScore: final.readinessScore,
  };
}
