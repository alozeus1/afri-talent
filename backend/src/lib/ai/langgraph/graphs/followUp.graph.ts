// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — follow-up graph (Phase 8)
//
// Generates a professional follow-up draft for an application at the right
// cadence (3/7/14 days), then PAUSES for user approval before sending. The send
// is idempotent (one follow-up per application+cadence). No email leaves without
// the user's approval — the send node is only reachable through the interrupt.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END, interrupt } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun, assertGraphRunNotDenied } from "../tools/prismaTools.js";
import { runOnce } from "../tools/idempotency.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "follow_up" as const;
const ALLOWED_CADENCE_DAYS = [3, 7, 14];

export type FollowUpOutcome = "sent" | "declined" | "not_due";

export interface FollowUpDeps {
  /** Days since the application reached the current stage. */
  daysSinceStage: (applicationId: string) => Promise<number>;
  generateDraft: (applicationId: string, cadenceDay: number) => Promise<{ draftRef: string }>;
  send: (applicationId: string, draftRef: string) => Promise<string>; // returns message ref
  recordEvent: (applicationId: string, type: string, details: Record<string, string | number | boolean>) => Promise<void>;
}

export interface FollowUpApproval {
  approved: boolean;
  userId?: string;
}

export interface FollowUpReview {
  kind: "follow_up_approval";
  applicationId: string;
  cadenceDay: number;
  draftRef: string;
}

const FollowUpState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  cadenceDay: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  draftRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  outcome: Annotation<FollowUpOutcome | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  messageRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
});

interface Ctx { graphRunId: string; threadId: string; applicationId: string }

function buildGraph(deps: FollowUpDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(FollowUpState)
    .addNode("checkCadence", async () => {
      const days = await deps.daysSinceStage(ctx.applicationId);
      const cadenceDay = ALLOWED_CADENCE_DAYS.includes(days) ? days : 0;
      if (cadenceDay === 0) return { outcome: "not_due" as FollowUpOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "finalize" };
      return { cadenceDay, currentStep: "draft" };
    })
    .addNode("draft", async (s) => {
      const { draftRef } = await deps.generateDraft(ctx.applicationId, s.cadenceDay);
      return { draftRef, currentStep: "approval" };
    })
    .addNode("approval", async (s) => {
      evt("human_approval_requested", "approval", { cadence_day: s.cadenceDay });
      const decision = interrupt({
        kind: "follow_up_approval",
        applicationId: ctx.applicationId,
        cadenceDay: s.cadenceDay,
        draftRef: s.draftRef as string,
      } as FollowUpReview) as FollowUpApproval;

      if (!decision.approved) {
        evt("human_approval_denied", "approval");
        return { outcome: "declined" as FollowUpOutcome, status: "BLOCKED" as GraphRunStatus, currentStep: "finalize" };
      }
      // Idempotent send: one follow-up per application + cadence day.
      const { ref } = await runOnce(`followup_send:${s.cadenceDay}`, ctx.applicationId, () =>
        deps.send(ctx.applicationId, s.draftRef as string),
      );
      await deps.recordEvent(ctx.applicationId, "follow_up_sent", { cadence_day: s.cadenceDay });
      evt("human_approval_granted", "approval");
      evt("side_effect_executed", "approval", { cadence_day: s.cadenceDay });
      return { outcome: "sent" as FollowUpOutcome, messageRef: ref, status: "COMPLETE" as GraphRunStatus, currentStep: "finalize" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, { status: s.status, currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { outcome: s.outcome ?? null });
      return {};
    })
    .addEdge(START, "checkCadence")
    .addConditionalEdges("checkCadence", (s) => (s.outcome === "not_due" ? "finalize" : "draft"), { finalize: "finalize", draft: "draft" })
    .addEdge("draft", "approval")
    .addEdge("approval", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export type FollowUpResult =
  | { status: "COMPLETE" | "BLOCKED"; graphRunId: string; outcome?: FollowUpOutcome; messageRef?: string }
  | { status: "AWAITING_APPROVAL"; graphRunId: string; threadId: string; review: FollowUpReview };

function ids(applicationId: string, graphRunId?: string) {
  return { graphRunId: graphRunId ?? `followup:${applicationId}`, threadId: `application:${applicationId}:follow-up` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pending(state: any): FollowUpReview | undefined {
  for (const t of state?.tasks ?? []) {
    const its = t?.interrupts ?? [];
    if (its.length) return its[0].value as FollowUpReview;
  }
  return undefined;
}

export async function startFollowUp(applicationId: string, deps: FollowUpDeps, graphRunId?: string): Promise<FollowUpResult> {
  const { graphRunId: gid, threadId } = ids(applicationId, graphRunId);
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId, applicationId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, applicationId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, applicationId, status: "RUNNING" }, config)) as typeof FollowUpState.State;

  const review = pending(await app.getState(config));
  if (review) {
    await updateGraphRun(gid, { status: "AWAITING_APPROVAL", approvalState: "REQUESTED" });
    return { status: "AWAITING_APPROVAL", graphRunId: gid, threadId, review };
  }
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, outcome: final.outcome, messageRef: final.messageRef };
}

export async function resumeFollowUp(applicationId: string, decision: FollowUpApproval, deps: FollowUpDeps, graphRunId?: string): Promise<FollowUpResult> {
  const { graphRunId: gid, threadId } = ids(applicationId, graphRunId);
  await assertGraphRunNotDenied(gid);
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_resumed" });
  const { Command } = await import("@langchain/langgraph");
  const app = buildGraph(deps, { graphRunId: gid, threadId, applicationId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(new Command({ resume: decision }), config)) as typeof FollowUpState.State;
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, outcome: final.outcome, messageRef: final.messageRef };
}
