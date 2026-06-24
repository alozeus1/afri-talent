// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — candidate autopilot graph (Phase 4)
//
// Lets Professional-tier candidates automate parts of the job search SAFELY.
// The graph is a sequence of deterministic safety gates; only if ALL pass does it
// generate apply packs (NEVER submissions). Any submission must still go through
// the Phase 3 human-approval graph — by construction, this module has no path to
// a submit side effect (its deps interface has no submit method).
//
// Gates (first failure stops the run):
//   1. opted in            2. subscription entitled + billing valid
//   3. profile complete     4. trust/risk allows automation
//   5. apply capacity remaining
//
// All data access + side effects are INJECTED, so the graph is fully testable and
// reuses existing entitlements/trust/caps logic via the adapter (autopilotTools).
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins, appendReducer } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import { runOnce } from "../tools/idempotency.js";
import { riskTierForScore, isAutomationAllowed } from "../policies/riskPolicy.js";
import type { GraphRunStatus, RiskFlag, RiskTier } from "../state/schemas.js";

const WORKFLOW = "candidate_autopilot" as const;

export interface AutopilotConfig {
  /** Minimum match score eligible for a generated pack. */
  minMatchScore: number;
  /** Minimum profile completeness (0–100) required to automate. */
  minProfileCompleteness: number;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  minMatchScore: 75,
  minProfileCompleteness: 70,
};

/** All external reads + side effects the graph needs. Injected for testability. */
export interface AutopilotDeps {
  getOptIn: (candidateId: string) => Promise<{ enabled: boolean; userId: string }>;
  getEntitlements: (userId: string) => Promise<{ autopilot: boolean; billingValid: boolean; applyPacksRemaining: number }>;
  getProfileCompleteness: (candidateId: string) => Promise<number>;
  /** Candidate fraud/risk score 0–100 (higher = riskier). */
  getCandidateRisk: (candidateId: string) => Promise<number>;
  /** How many more applies the candidate may make right now (caps). */
  getRemainingCapacity: (candidateId: string) => Promise<number>;
  findStrongMatches: (candidateId: string, minScore: number) => Promise<Array<{ jobId: string; score: number }>>;
  /** Generate an apply pack — MUST NOT submit. Returns a pack ref. */
  generateApplyPack: (candidateId: string, jobId: string) => Promise<{ packRef: string }>;
  /** Notify the candidate of generated packs. Returns a notification ref. */
  notifyCandidate: (candidateId: string, packRefs: string[]) => Promise<string>;
  scheduleFollowUps: (candidateId: string, jobIds: string[]) => Promise<void>;
}

export type AutopilotBlockReason =
  | "not_opted_in"
  | "plan_not_entitled"
  | "billing_invalid"
  | "profile_incomplete"
  | "trust_blocked"
  | "apply_cap_reached";

const AutopilotState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  blockedReason: Annotation<AutopilotBlockReason | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  remainingCapacity: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  applyPacksRemaining: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  generatedPackRefs: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
  generatedPackCount: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  notificationRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
});

interface BuildCtx {
  graphRunId: string;
  threadId: string;
  candidateId: string;
}

function buildAutopilotGraph(deps: AutopilotDeps, cfg: AutopilotConfig, ctx: BuildCtx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const blocked = (reason: AutopilotBlockReason, riskFlags?: RiskFlag[]) => {
    evt("quota_blocked", "preflight", { reason });
    return {
      status: "BLOCKED" as GraphRunStatus,
      blockedReason: reason,
      currentStep: "blocked",
      ...(riskFlags ? { riskFlags } : {}),
    };
  };

  const graph = new StateGraph(AutopilotState)
    .addNode("preflight", async (s) => {
      // 1. Opted in?
      const optIn = await deps.getOptIn(ctx.candidateId);
      if (!optIn.enabled) return blocked("not_opted_in");

      // 2. Entitled + billing valid?
      const ent = await deps.getEntitlements(optIn.userId);
      if (!ent.autopilot) return blocked("plan_not_entitled");
      if (!ent.billingValid) return blocked("billing_invalid");

      // 3. Profile complete enough?
      const completeness = await deps.getProfileCompleteness(ctx.candidateId);
      if (completeness < cfg.minProfileCompleteness) return blocked("profile_incomplete");

      // 4. Trust/risk allows automation?
      const riskScore = await deps.getCandidateRisk(ctx.candidateId);
      const tier: RiskTier = riskTierForScore(riskScore);
      if (!isAutomationAllowed(tier)) {
        evt("risk_threshold_triggered", "preflight", { tier, risk_score: riskScore });
        return blocked("trust_blocked", [
          { code: "autopilot_risk_block", tier, detail: "risk tier disallows automation", at: new Date().toISOString() },
        ]);
      }

      // 5. Apply capacity remaining?
      const remainingCapacity = await deps.getRemainingCapacity(ctx.candidateId);
      if (remainingCapacity <= 0) return blocked("apply_cap_reached");

      return {
        status: "RUNNING" as GraphRunStatus,
        currentStep: "generate",
        remainingCapacity,
        applyPacksRemaining: ent.applyPacksRemaining,
        userId: optIn.userId,
      };
    })
    .addNode("generate", async (s) => {
      const matches = await deps.findStrongMatches(ctx.candidateId, cfg.minMatchScore);
      // Respect BOTH the apply caps and the AI apply-pack quota.
      const budget = Math.max(0, Math.min(s.remainingCapacity, s.applyPacksRemaining, matches.length));
      const selected = matches.slice(0, budget);

      const packRefs: string[] = [];
      for (const m of selected) {
        const { packRef } = await deps.generateApplyPack(ctx.candidateId, m.jobId);
        packRefs.push(packRef);
      }

      let notificationRef: string | undefined;
      if (packRefs.length > 0) {
        // Idempotent: one notification per run identity.
        const once = await runOnce("autopilot_notify", ctx.graphRunId, () =>
          deps.notifyCandidate(ctx.candidateId, packRefs),
        );
        notificationRef = once.ref;
        await deps.scheduleFollowUps(ctx.candidateId, selected.map((m) => m.jobId));
      }

      evt("graph_completed", "generate", { generated: packRefs.length, budget });
      return {
        status: "COMPLETE" as GraphRunStatus,
        currentStep: "done",
        generatedPackRefs: packRefs,
        generatedPackCount: packRefs.length,
        notificationRef,
      };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, {
        status: s.status,
        currentStep: s.currentStep,
        riskFlags: s.riskFlags.length ? s.riskFlags : undefined,
      });
      recordGraphRunOutcome(WORKFLOW, s.status);
      return {};
    })
    .addEdge(START, "preflight")
    .addConditionalEdges("preflight", (s) => (s.status === "BLOCKED" ? "finalize" : "generate"), {
      generate: "generate",
      finalize: "finalize",
    })
    .addEdge("generate", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export interface AutopilotResult {
  status: "COMPLETE" | "BLOCKED";
  graphRunId: string;
  generatedPackCount: number;
  blockedReason?: AutopilotBlockReason;
}

/**
 * Run candidate autopilot. Generates apply packs only — never submits. Returns a
 * summary; BLOCKED with a reason if any safety gate fails.
 */
export async function runCandidateAutopilot(
  candidateId: string,
  deps: AutopilotDeps,
  opts?: { config?: Partial<AutopilotConfig>; graphRunId?: string },
): Promise<AutopilotResult> {
  const cfg: AutopilotConfig = { ...DEFAULT_AUTOPILOT_CONFIG, ...(opts?.config ?? {}) };
  const graphRunId = opts?.graphRunId ?? `autopilot:${candidateId}:${Date.now()}`;
  const threadId = `candidate:${candidateId}:autopilot`;

  await createGraphRun({ graphRunId, workflowType: WORKFLOW, threadId, candidateId });
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildAutopilotGraph(deps, cfg, { graphRunId, threadId, candidateId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(
    { graphRunId, workflowType: WORKFLOW, candidateId, status: "RUNNING" },
    config,
  )) as typeof AutopilotState.State;

  return {
    status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED",
    graphRunId,
    generatedPackCount: final.generatedPackCount,
    blockedReason: final.blockedReason,
  };
}
