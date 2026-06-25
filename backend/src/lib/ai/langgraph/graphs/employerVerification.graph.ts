// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — employer verification graph (Phase 5)
//
// Protects candidates by gating employers before they can publish jobs:
//   assess risk → branch by tier
//     LOW / MEDIUM  → approve (allow publishing)
//     HIGH          → restrict publishing + admin-review interrupt (TOTP-gated)
//     CRITICAL      → auto-suspend (deterministic, no human needed)
//
// All data access + side effects are injected. Admin approval is a real
// interrupt() that resumes only with a TOTP-verified AdminDecision.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END, interrupt } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import { tierFor, evaluateAdminDecision, type AdminDecision } from "../tools/trustTools.js";
import type { GraphRunStatus, RiskTier } from "../state/schemas.js";

const WORKFLOW = "employer_verification" as const;

export type EmployerDecision = "approved" | "restricted" | "suspended" | "totp_required";

export interface EmployerVerificationDeps {
  /** Compute the employer's risk score (0–100). */
  assessEmployer: (employerId: string) => Promise<{ riskScore: number; throwawayDomain?: boolean }>;
  allowPublishing: (employerId: string) => Promise<void>;
  restrictPublishing: (employerId: string) => Promise<void>;
  suspendEmployer: (employerId: string) => Promise<void>;
  recordEvent: (employerId: string, type: string, details: Record<string, string | number | boolean>) => Promise<void>;
}

export interface EmployerAdminReview {
  kind: "employer_admin_review";
  employerId: string;
  riskScore: number;
  riskTier: RiskTier;
}

const EmployerState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  riskScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  riskTier: Annotation<RiskTier>({ reducer: lastWriteWins, default: () => "LOW" }),
  decision: Annotation<EmployerDecision | undefined>({ reducer: lastWriteWins, default: () => undefined }),
});

interface Ctx {
  graphRunId: string;
  threadId: string;
  employerId: string;
}

function buildGraph(deps: EmployerVerificationDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(EmployerState)
    .addNode("assess", async () => {
      const a = await deps.assessEmployer(ctx.employerId);
      const tier = tierFor(a.riskScore);
      evt("node_completed", "assess", { risk_score: a.riskScore, tier, throwaway: a.throwawayDomain ?? false });
      return { riskScore: a.riskScore, riskTier: tier };
    })
    .addNode("approve", async () => {
      await deps.allowPublishing(ctx.employerId);
      await deps.recordEvent(ctx.employerId, "employer_approved", { tier: "LOW" });
      return { decision: "approved" as EmployerDecision, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("suspend", async (s) => {
      await deps.suspendEmployer(ctx.employerId);
      await deps.recordEvent(ctx.employerId, "employer_suspended", { tier: s.riskTier, risk_score: s.riskScore });
      evt("risk_threshold_triggered", "suspend", { tier: s.riskTier });
      return { decision: "suspended" as EmployerDecision, status: "BLOCKED" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("adminReview", async (s) => {
      // Precaution: restrict publishing while awaiting review.
      await deps.restrictPublishing(ctx.employerId);
      evt("human_approval_requested", "adminReview", { risk_score: s.riskScore, tier: s.riskTier });
      const decision = interrupt({
        kind: "employer_admin_review",
        employerId: ctx.employerId,
        riskScore: s.riskScore,
        riskTier: s.riskTier,
      } as EmployerAdminReview) as AdminDecision;

      const outcome = evaluateAdminDecision(decision);
      if (!outcome.ok) {
        evt("human_approval_denied", "adminReview", { reason: outcome.reason });
        return { decision: "totp_required" as EmployerDecision, status: "BLOCKED" as GraphRunStatus, currentStep: "done" };
      }
      if (outcome.approved) {
        await deps.allowPublishing(ctx.employerId);
        await deps.recordEvent(ctx.employerId, "employer_admin_approved", { admin: decision.adminId });
        evt("human_approval_granted", "adminReview", { admin: decision.adminId });
        return { decision: "approved" as EmployerDecision, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
      }
      await deps.recordEvent(ctx.employerId, "employer_admin_rejected", { admin: decision.adminId });
      return { decision: "restricted" as EmployerDecision, status: "BLOCKED" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, { status: s.status, currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { decision: s.decision ?? null, status: s.status });
      return {};
    })
    .addEdge(START, "assess")
    .addConditionalEdges(
      "assess",
      (s) => (s.riskTier === "CRITICAL" ? "suspend" : s.riskTier === "HIGH" ? "adminReview" : "approve"),
      { suspend: "suspend", adminReview: "adminReview", approve: "approve" },
    )
    .addEdge("approve", "finalize")
    .addEdge("suspend", "finalize")
    .addEdge("adminReview", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export type EmployerVerificationOutcome =
  | { status: "COMPLETE" | "BLOCKED"; graphRunId: string; decision?: EmployerDecision; riskTier: RiskTier }
  | { status: "AWAITING_ADMIN"; graphRunId: string; threadId: string; review: EmployerAdminReview };

function ids(employerId: string, graphRunId?: string) {
  return { graphRunId: graphRunId ?? `employer-verify:${employerId}`, threadId: `employer:${employerId}:verification` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pendingReview(state: any): EmployerAdminReview | undefined {
  for (const t of state?.tasks ?? []) {
    const its = t?.interrupts ?? [];
    if (its.length) return its[0].value as EmployerAdminReview;
  }
  return undefined;
}

export async function startEmployerVerification(
  employerId: string,
  deps: EmployerVerificationDeps,
  graphRunId?: string,
): Promise<EmployerVerificationOutcome> {
  const { graphRunId: gid, threadId } = ids(employerId, graphRunId);
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId, employerId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, employerId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, employerId, status: "RUNNING" }, config)) as typeof EmployerState.State;

  const state = await app.getState(config);
  const review = pendingReview(state);
  if (review) {
    await updateGraphRun(gid, { status: "AWAITING_APPROVAL", approvalState: "REQUESTED" });
    return { status: "AWAITING_ADMIN", graphRunId: gid, threadId, review };
  }
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, decision: final.decision, riskTier: final.riskTier };
}

export async function resumeEmployerVerification(
  employerId: string,
  decision: AdminDecision,
  deps: EmployerVerificationDeps,
  graphRunId?: string,
): Promise<EmployerVerificationOutcome> {
  const { graphRunId: gid, threadId } = ids(employerId, graphRunId);
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_resumed" });
  const { Command } = await import("@langchain/langgraph");

  const app = buildGraph(deps, { graphRunId: gid, threadId, employerId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(new Command({ resume: decision }), config)) as typeof EmployerState.State;
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, decision: final.decision, riskTier: final.riskTier };
}
