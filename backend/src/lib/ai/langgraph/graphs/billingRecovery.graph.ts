// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — billing recovery graph (Phase 8)
//
// Reconciles provider (Stripe/Flutterwave) state with local entitlements:
//   - paid at provider but NOT entitled locally → grant/resume premium automation
//   - NOT paid but entitled locally            → pause premium automation
//   - consistent                                → no-op
// Pausing premium automation when billing is invalid protects against abuse.
// All effects are injected; the reconciliation outcome is recorded for audit.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "billing_recovery" as const;

export type BillingReconcileOutcome = "consistent" | "resumed" | "paused";

export interface BillingRecoveryDeps {
  getProviderActive: (userId: string) => Promise<boolean>;
  getLocalEntitled: (userId: string) => Promise<boolean>;
  resumeAutomation: (userId: string) => Promise<void>;
  pauseAutomation: (userId: string) => Promise<void>;
  notify: (userId: string, kind: BillingReconcileOutcome) => Promise<void>;
  recordReconciliation: (userId: string, outcome: BillingReconcileOutcome) => Promise<void>;
}

const BillingState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  providerActive: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  localEntitled: Annotation<boolean>({ reducer: lastWriteWins, default: () => false }),
  outcome: Annotation<BillingReconcileOutcome | undefined>({ reducer: lastWriteWins, default: () => undefined }),
});

interface Ctx { graphRunId: string; threadId: string; userId: string }

function buildGraph(deps: BillingRecoveryDeps, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(BillingState)
    .addNode("check", async () => {
      const [providerActive, localEntitled] = await Promise.all([
        deps.getProviderActive(ctx.userId),
        deps.getLocalEntitled(ctx.userId),
      ]);
      return { providerActive, localEntitled, currentStep: "reconcile" };
    })
    .addNode("reconcile", async (s) => {
      let outcome: BillingReconcileOutcome;
      if (s.providerActive && !s.localEntitled) {
        await deps.resumeAutomation(ctx.userId);
        outcome = "resumed";
      } else if (!s.providerActive && s.localEntitled) {
        await deps.pauseAutomation(ctx.userId);
        evt("risk_threshold_triggered", "reconcile", { reason: "unpaid_but_entitled" });
        outcome = "paused";
      } else {
        outcome = "consistent";
      }
      if (outcome !== "consistent") {
        await deps.notify(ctx.userId, outcome);
        evt("side_effect_executed", "reconcile", { outcome });
      }
      await deps.recordReconciliation(ctx.userId, outcome);
      return { outcome, currentStep: "finalize" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, { status: "COMPLETE", currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, "COMPLETE");
      evt("graph_completed", "finalize", { outcome: s.outcome ?? null });
      return { status: "COMPLETE" as GraphRunStatus };
    })
    .addEdge(START, "check")
    .addEdge("check", "reconcile")
    .addEdge("reconcile", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export interface BillingRecoveryResult {
  status: "COMPLETE";
  graphRunId: string;
  outcome: BillingReconcileOutcome;
}

export async function runBillingRecovery(userId: string, deps: BillingRecoveryDeps, graphRunId?: string): Promise<BillingRecoveryResult> {
  const gid = graphRunId ?? `billing-recovery:${userId}:${Date.now()}`;
  const threadId = `user:${userId}:billing-recovery`;
  await createGraphRun({ graphRunId: gid, workflowType: WORKFLOW, threadId, userId });
  emitGraphEvent({ graphRunId: gid, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, { graphRunId: gid, threadId, userId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId: gid, workflowType: WORKFLOW, userId, status: "RUNNING" }, config)) as typeof BillingState.State;

  return { status: "COMPLETE", graphRunId: gid, outcome: final.outcome ?? "consistent" };
}
