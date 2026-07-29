// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — application submission graph (Phase 3, human-in-the-loop)
//
// Models the apply consent gate as a resumable graph:
//
//   requestApproval ──(interrupt: wait for acknowledgements)──┐
//        │ valid acks                                          │ invalid acks
//        ▼                                                     ▼
//     submit (idempotent side effect)                      rejected (BLOCKED)
//        │                                                     │
//        └──────────────► finalize ◄──────────────────────────┘
//
// Reuses the EXISTING apply state machine for acknowledgement validation (exact
// phrases) and an INJECTED side effect (`onApprovedSubmit`) for the actual
// dispatch — so the critical SES/ATS code is not reimplemented here, and the
// graph is fully testable. The submit is wrapped in the idempotency ledger so a
// retry/replay never double-submits.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END, interrupt, Command } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins, appendReducer } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun, assertGraphRunNotDenied } from "../tools/prismaTools.js";
import { runOnce } from "../tools/idempotency.js";
import { validateApplyAcknowledgements, REQUIRED_ACKNOWLEDGEMENTS } from "../tools/applyTools.js";
import type { GraphError, GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "apply_pack" as const;

export interface ApprovalRequest {
  kind: "apply_approval_required";
  applicationId: string;
  required: string[];
}

/** Injected side effect: perform the actual application dispatch. */
export interface SubmissionDeps {
  onApprovedSubmit: (
    applicationId: string,
    acknowledgements: string[],
  ) => Promise<{ proofRef: string; track: string }>;
}

const SubmissionState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  acknowledgements: Annotation<string[]>({ reducer: lastWriteWins, default: () => [] }),
  submissionProofRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  track: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  approvalMissing: Annotation<string[]>({ reducer: lastWriteWins, default: () => [] }),
  submitErrors: Annotation<GraphError[]>({ reducer: appendReducer, default: () => [] }),
});

interface BuildCtx {
  graphRunId: string;
  threadId: string;
  applicationId: string;
}

function buildSubmissionGraph(deps: SubmissionDeps, ctx: BuildCtx) {
  const evt = (type: Parameters<typeof emitGraphEvent>[0]["type"], node?: string, details?: Record<string, string | number | boolean | null | undefined>) =>
    emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(SubmissionState)
    .addNode("requestApproval", async () => {
      evt("human_approval_requested", "requestApproval", { application_id: ctx.applicationId });
      // Pause here until the caller resumes with the candidate's acknowledgements.
      const acks = interrupt({
        kind: "apply_approval_required",
        applicationId: ctx.applicationId,
        required: [...REQUIRED_ACKNOWLEDGEMENTS],
      } as ApprovalRequest) as string[];

      const v = validateApplyAcknowledgements(acks);
      if (v.ok) {
        evt("human_approval_granted", "requestApproval", { application_id: ctx.applicationId });
        return {
          acknowledgements: acks,
          approvalState: "GRANTED" as const,
          status: "RUNNING" as GraphRunStatus,
          currentStep: "submit",
        };
      }
      const missing = v.ok ? [] : v.missing ?? [];
      evt("human_approval_denied", "requestApproval", { missing_count: missing.length });
      return {
        approvalState: "DENIED" as const,
        approvalMissing: missing,
        status: "BLOCKED" as GraphRunStatus,
        currentStep: "rejected",
      };
    })
    .addNode("submit", async (s) => {
      let track: string | undefined;
      try {
        const { ref, deduped } = await runOnce("apply_submit", ctx.applicationId, async () => {
          const r = await deps.onApprovedSubmit(ctx.applicationId, s.acknowledgements);
          track = r.track;
          return r.proofRef;
        });
        evt("side_effect_executed", "submit", { application_id: ctx.applicationId, track: track ?? null, deduped });
        return {
          submissionProofRef: ref,
          track,
          status: "COMPLETE" as GraphRunStatus,
          currentStep: "submitted",
        };
      } catch (err) {
        const ge: GraphError = {
          node: "submit",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
          at: new Date().toISOString(),
        };
        evt("node_failed", "submit", { error: ge.message });
        return { status: "FAILED" as GraphRunStatus, currentStep: "failed", submitErrors: [ge] };
      }
    })
    .addNode("rejected", async () => {
      return { status: "BLOCKED" as GraphRunStatus, currentStep: "rejected" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, {
        status: s.status,
        approvalState: s.approvalState,
        currentStep: s.currentStep,
        errors: s.submitErrors.length ? s.submitErrors : undefined,
      });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { status: s.status });
      return {};
    })
    .addEdge(START, "requestApproval")
    .addConditionalEdges("requestApproval", (s) => (s.approvalState === "GRANTED" ? "submit" : "rejected"), {
      submit: "submit",
      rejected: "rejected",
    })
    .addEdge("submit", "finalize")
    .addEdge("rejected", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

// ── Result types ─────────────────────────────────────────────────────────────
export type ApprovalOutcome =
  | { status: "AWAITING_APPROVAL"; graphRunId: string; threadId: string; request: ApprovalRequest }
  | { status: "SUBMITTED"; graphRunId: string; proofRef?: string; track?: string }
  | { status: "REJECTED"; graphRunId: string; missing: string[] }
  | { status: "FAILED"; graphRunId: string; error?: string };

export interface SubmissionMeta {
  graphRunId?: string;
  userId?: string;
}

function ids(applicationId: string, meta?: SubmissionMeta) {
  return {
    graphRunId: meta?.graphRunId ?? `apply-submit:${applicationId}`,
    threadId: `application:${applicationId}:apply-pack`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readInterrupt(state: any): ApprovalRequest | undefined {
  const tasks = state?.tasks ?? [];
  for (const t of tasks) {
    const its = t?.interrupts ?? [];
    if (its.length > 0) return its[0].value as ApprovalRequest;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function finalize(state: any, graphRunId: string): ApprovalOutcome {
  const v = state?.values ?? {};
  if (v.status === "COMPLETE") return { status: "SUBMITTED", graphRunId, proofRef: v.submissionProofRef, track: v.track };
  if (v.status === "FAILED") return { status: "FAILED", graphRunId, error: v.submitErrors?.[0]?.message };
  return { status: "REJECTED", graphRunId, missing: v.approvalMissing ?? [] };
}

/**
 * Begin an application submission. Runs until the human-approval interrupt and
 * returns AWAITING_APPROVAL with the required acknowledgements. Resume later with
 * resumeApplicationApproval().
 */
export async function startApplicationApproval(
  applicationId: string,
  deps: SubmissionDeps,
  meta?: SubmissionMeta,
): Promise<ApprovalOutcome> {
  const { graphRunId, threadId } = ids(applicationId, meta);
  await createGraphRun({ graphRunId, workflowType: WORKFLOW, threadId, applicationId, userId: meta?.userId });
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildSubmissionGraph(deps, { graphRunId, threadId, applicationId });
  const config = { configurable: { thread_id: threadId } };
  await app.invoke({ graphRunId, workflowType: WORKFLOW, applicationId, status: "RUNNING" }, config);

  const state = await app.getState(config);
  const request = readInterrupt(state);
  if (request) {
    await updateGraphRun(graphRunId, {
      status: "AWAITING_APPROVAL",
      approvalState: "REQUESTED",
      currentStep: "awaitApproval",
    });
    return { status: "AWAITING_APPROVAL", graphRunId, threadId, request };
  }
  return finalize(state, graphRunId);
}

/**
 * Resume a paused application submission with the candidate's acknowledgements.
 * Valid acks → idempotent submit; invalid acks → REJECTED (BLOCKED).
 */
export async function resumeApplicationApproval(
  applicationId: string,
  acknowledgements: string[],
  deps: SubmissionDeps,
  meta?: SubmissionMeta,
): Promise<ApprovalOutcome> {
  const { graphRunId, threadId } = ids(applicationId, meta);
  await assertGraphRunNotDenied(graphRunId);
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_resumed" });

  const app = buildSubmissionGraph(deps, { graphRunId, threadId, applicationId });
  const config = { configurable: { thread_id: threadId } };
  await app.invoke(new Command({ resume: acknowledgements }), config);

  const state = await app.getState(config);
  return finalize(state, graphRunId);
}
