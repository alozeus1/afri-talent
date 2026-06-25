// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — trust moderation graph (Phase 5)
//
// Centralizes abuse reports and risk events:
//   triage severity → branch by tier
//     LOW       → log
//     MEDIUM    → queue review (open a trust case)
//     HIGH      → restrict actions + open case + admin-review interrupt (TOTP)
//     CRITICAL  → auto-suspend + notify admin
//
// Admin actions are TOTP-gated and audited. Injected deps reuse the existing
// trust service (recordTrustRiskEvent / createTrustCase / addTrustCaseAction).
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

const WORKFLOW = "trust_moderation" as const;

export type ModerationOutcome = "logged" | "queued" | "actioned" | "restricted" | "suspended" | "totp_required";

export interface TrustModerationDeps {
  getSeverity: (caseRef: string) => Promise<{ severityScore: number; subjectType: string; subjectId: string }>;
  logEvent: (caseRef: string, details: Record<string, string | number | boolean>) => Promise<void>;
  openCase: (caseRef: string, tier: RiskTier) => Promise<string>; // returns caseId
  restrictSubject: (subjectId: string) => Promise<void>;
  suspendSubject: (subjectId: string) => Promise<void>;
  notifyAdmin: (caseRef: string, tier: RiskTier) => Promise<void>;
  recordCaseAction: (caseId: string, action: string, adminId: string) => Promise<void>;
}

export interface ModerationAdminReview {
  kind: "trust_admin_review";
  caseRef: string;
  caseId: string;
  severityScore: number;
  tier: RiskTier;
}

const ModerationState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  caseRef: Annotation<string>({ reducer: lastWriteWins, default: () => "" }),
  subjectId: Annotation<string>({ reducer: lastWriteWins, default: () => "" }),
  severityScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  tier: Annotation<RiskTier>({ reducer: lastWriteWins, default: () => "LOW" }),
  caseId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  outcome: Annotation<ModerationOutcome | undefined>({ reducer: lastWriteWins, default: () => undefined }),
});

interface Ctx {
  graphRunId: string;
  threadId: string;
  caseRef: string;
}

function buildGraph(deps: TrustModerationDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(ModerationState)
    .addNode("triage", async () => {
      const c = await deps.getSeverity(ctx.caseRef);
      const tier = tierFor(c.severityScore);
      evt("node_completed", "triage", { severity: c.severityScore, tier });
      return { severityScore: c.severityScore, tier, subjectId: c.subjectId, caseRef: ctx.caseRef };
    })
    .addNode("log", async (s) => {
      await deps.logEvent(ctx.caseRef, { tier: s.tier, severity: s.severityScore });
      return { outcome: "logged" as ModerationOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("queue", async (s) => {
      const caseId = await deps.openCase(ctx.caseRef, s.tier);
      return { caseId, outcome: "queued" as ModerationOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("suspend", async (s) => {
      await deps.suspendSubject(s.subjectId);
      await deps.notifyAdmin(ctx.caseRef, s.tier);
      evt("risk_threshold_triggered", "suspend", { tier: s.tier });
      return { outcome: "suspended" as ModerationOutcome, status: "BLOCKED" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("restrictReview", async (s) => {
      await deps.restrictSubject(s.subjectId);
      const caseId = await deps.openCase(ctx.caseRef, s.tier);
      evt("human_approval_requested", "restrictReview", { severity: s.severityScore, tier: s.tier });
      const decision = interrupt({
        kind: "trust_admin_review",
        caseRef: ctx.caseRef,
        caseId,
        severityScore: s.severityScore,
        tier: s.tier,
      } as ModerationAdminReview) as AdminDecision;

      const o = evaluateAdminDecision(decision);
      if (!o.ok) {
        evt("human_approval_denied", "restrictReview", { reason: o.reason });
        return { caseId, outcome: "totp_required" as ModerationOutcome, status: "BLOCKED" as GraphRunStatus, currentStep: "done" };
      }
      if (o.approved) {
        await deps.suspendSubject(s.subjectId);
        await deps.recordCaseAction(caseId, "SUSPEND", decision.adminId);
        evt("human_approval_granted", "restrictReview", { admin: decision.adminId });
        return { caseId, outcome: "actioned" as ModerationOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
      }
      await deps.recordCaseAction(caseId, "DISMISS", decision.adminId);
      return { caseId, outcome: "restricted" as ModerationOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "done" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, { status: s.status, currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { outcome: s.outcome ?? null, tier: s.tier });
      return {};
    })
    .addEdge(START, "triage")
    .addConditionalEdges(
      "triage",
      (s) =>
        s.tier === "CRITICAL" ? "suspend" : s.tier === "HIGH" ? "restrictReview" : s.tier === "MEDIUM" ? "queue" : "log",
      { suspend: "suspend", restrictReview: "restrictReview", queue: "queue", log: "log" },
    )
    .addEdge("log", "finalize")
    .addEdge("queue", "finalize")
    .addEdge("suspend", "finalize")
    .addEdge("restrictReview", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export type TrustModerationResult =
  | { status: "COMPLETE" | "BLOCKED"; graphRunId: string; outcome?: ModerationOutcome; tier: RiskTier }
  | { status: "AWAITING_ADMIN"; graphRunId: string; threadId: string; review: ModerationAdminReview };

function ids(caseRef: string, graphRunId?: string) {
  return { graphRunId: graphRunId ?? `trust-mod:${caseRef}`, threadId: `trust:${caseRef}:moderation` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pendingReview(state: any): ModerationAdminReview | undefined {
  for (const t of state?.tasks ?? []) {
    const its = t?.interrupts ?? [];
    if (its.length) return its[0].value as ModerationAdminReview;
  }
  return undefined;
}

export async function startTrustModeration(
  caseRef: string,
  deps: TrustModerationDeps,
  graphRunId?: string,
): Promise<TrustModerationResult> {
  const { graphRunId: gid, threadId } = ids(caseRef, graphRunId);
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, caseRef });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, status: "RUNNING" }, config)) as typeof ModerationState.State;

  const state = await app.getState(config);
  const review = pendingReview(state);
  if (review) {
    await updateGraphRun(gid, { status: "AWAITING_APPROVAL", approvalState: "REQUESTED" });
    return { status: "AWAITING_ADMIN", graphRunId: gid, threadId, review };
  }
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, outcome: final.outcome, tier: final.tier };
}

export async function resumeTrustModeration(
  caseRef: string,
  decision: AdminDecision,
  deps: TrustModerationDeps,
  graphRunId?: string,
): Promise<TrustModerationResult> {
  const { graphRunId: gid, threadId } = ids(caseRef, graphRunId);
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_resumed" });
  const { Command } = await import("@langchain/langgraph");

  const app = buildGraph(deps, { graphRunId: gid, threadId, caseRef });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(new Command({ resume: decision }), config)) as typeof ModerationState.State;
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId: gid, outcome: final.outcome, tier: final.tier };
}
