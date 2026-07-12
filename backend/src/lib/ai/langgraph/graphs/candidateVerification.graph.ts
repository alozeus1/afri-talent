// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — candidate verification graph (Phase 5)
//
// Computes a deterministic candidate verification score from verification
// signals (email / phone / LinkedIn / partner badge / document). Sensitive
// DOCUMENT verification requires an admin-review interrupt + TOTP. Document
// content is NEVER placed in graph state — only a document REFERENCE is, so
// sensitive files are never exposed via checkpoints or traces.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END, interrupt } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun, assertGraphRunNotDenied } from "../tools/prismaTools.js";
import { evaluateAdminDecision, type AdminDecision } from "../tools/trustTools.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "candidate_verification" as const;

// Deterministic, explainable score components (anti-inflation: fixed rubric).
const POINTS = { email: 20, phone: 20, linkedin: 15, partner: 15, document: 30 } as const;

export interface CandidateSignals {
  emailVerified: boolean;
  phoneVerified: boolean;
  linkedinVerified: boolean;
  partnerBadge: boolean;
  /** A reference (id / S3 key) to a submitted document — NEVER its content. */
  documentRef?: string;
}

export interface CandidateVerificationDeps {
  getSignals: (candidateId: string) => Promise<CandidateSignals>;
  setVerification: (candidateId: string, score: number, documentVerified: boolean) => Promise<void>;
  recordEvent: (candidateId: string, type: string, details: Record<string, string | number | boolean>) => Promise<void>;
}

export interface DocumentReview {
  kind: "candidate_document_review";
  candidateId: string;
  documentRef: string;
}

const CandidateState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  emailVerified: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  phoneVerified: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  linkedinVerified: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  partnerBadge: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  documentRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  documentVerified: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  verificationScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
});

function computeScore(s: {
  emailVerified: boolean;
  phoneVerified: boolean;
  linkedinVerified: boolean;
  partnerBadge: boolean;
  documentVerified: boolean;
}): number {
  return (
    (s.emailVerified ? POINTS.email : 0) +
    (s.phoneVerified ? POINTS.phone : 0) +
    (s.linkedinVerified ? POINTS.linkedin : 0) +
    (s.partnerBadge ? POINTS.partner : 0) +
    (s.documentVerified ? POINTS.document : 0)
  );
}

interface Ctx {
  graphRunId: string;
  threadId: string;
  candidateId: string;
}

function buildGraph(deps: CandidateVerificationDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(CandidateState)
    .addNode("collect", async () => {
      const sig = await deps.getSignals(ctx.candidateId);
      return {
        emailVerified: sig.emailVerified,
        phoneVerified: sig.phoneVerified,
        linkedinVerified: sig.linkedinVerified,
        partnerBadge: sig.partnerBadge,
        documentRef: sig.documentRef, // a ref only — never content
      };
    })
    .addNode("documentReview", async (s) => {
      evt("human_approval_requested", "documentReview", { has_document: true });
      const decision = interrupt({
        kind: "candidate_document_review",
        candidateId: ctx.candidateId,
        documentRef: s.documentRef as string,
      } as DocumentReview) as AdminDecision;

      const o = evaluateAdminDecision(decision);
      if (!o.ok) {
        evt("human_approval_denied", "documentReview", { reason: o.reason });
        // Cannot verify the document without TOTP — proceed without doc credit.
        return { documentVerified: false };
      }
      evt(o.approved ? "human_approval_granted" : "human_approval_denied", "documentReview", { admin: decision.adminId });
      return { documentVerified: o.approved };
    })
    .addNode("finalize", async (s) => {
      const score = computeScore({
        emailVerified: s.emailVerified,
        phoneVerified: s.phoneVerified,
        linkedinVerified: s.linkedinVerified,
        partnerBadge: s.partnerBadge,
        documentVerified: s.documentVerified,
      });
      await deps.setVerification(ctx.candidateId, score, s.documentVerified);
      await deps.recordEvent(ctx.candidateId, "candidate_verification_scored", {
        score,
        document_verified: s.documentVerified,
      });
      await updateGraphRun(ctx.graphRunId, { status: "COMPLETE", currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, "COMPLETE");
      evt("graph_completed", "finalize", { score, document_verified: s.documentVerified });
      return { verificationScore: score, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
    })
    .addEdge(START, "collect")
    .addConditionalEdges("collect", (s) => (s.documentRef ? "documentReview" : "finalize"), {
      documentReview: "documentReview",
      finalize: "finalize",
    })
    .addEdge("documentReview", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export type CandidateVerificationResult =
  | { status: "COMPLETE"; graphRunId: string; score: number; documentVerified: boolean }
  | { status: "AWAITING_ADMIN"; graphRunId: string; threadId: string; review: DocumentReview };

function ids(candidateId: string, graphRunId?: string) {
  return { graphRunId: graphRunId ?? `candidate-verify:${candidateId}`, threadId: `candidate:${candidateId}:verification` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pendingReview(state: any): DocumentReview | undefined {
  for (const t of state?.tasks ?? []) {
    const its = t?.interrupts ?? [];
    if (its.length) return its[0].value as DocumentReview;
  }
  return undefined;
}

export async function startCandidateVerification(
  candidateId: string,
  deps: CandidateVerificationDeps,
  graphRunId?: string,
): Promise<CandidateVerificationResult> {
  const { graphRunId: gid, threadId } = ids(candidateId, graphRunId);
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId, candidateId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, candidateId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, candidateId, status: "RUNNING" }, config)) as typeof CandidateState.State;

  const state = await app.getState(config);
  const review = pendingReview(state);
  if (review) {
    await updateGraphRun(gid, { status: "AWAITING_APPROVAL", approvalState: "REQUESTED" });
    return { status: "AWAITING_ADMIN", graphRunId: gid, threadId, review };
  }
  return { status: "COMPLETE", graphRunId: gid, score: final.verificationScore, documentVerified: final.documentVerified };
}

export async function resumeCandidateVerification(
  candidateId: string,
  decision: AdminDecision,
  deps: CandidateVerificationDeps,
  graphRunId?: string,
): Promise<CandidateVerificationResult> {
  const { graphRunId: gid, threadId } = ids(candidateId, graphRunId);
  await assertGraphRunNotDenied(gid);
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_resumed" });
  const { Command } = await import("@langchain/langgraph");

  const app = buildGraph(deps, { graphRunId: gid, threadId, candidateId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(new Command({ resume: decision }), config)) as typeof CandidateState.State;
  return { status: "COMPLETE", graphRunId: gid, score: final.verificationScore, documentVerified: final.documentVerified };
}
