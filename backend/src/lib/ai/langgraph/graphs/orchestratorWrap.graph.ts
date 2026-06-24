// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — orchestrator wrap graph (Phase 2)
//
// Wraps the EXISTING orchestrator core (resume_review / job_match / apply_pack)
// in a LangGraph state machine that adds: durable graph state + checkpointing,
// a GraphRun audit row, structured events, and run-level metrics — WITHOUT
// changing any agent behavior. The orchestrator core is injected, so this module
// has no dependency cycle with the orchestrator.
//
// PII safety: the orchestrator output (which contains resume/job text) is held in
// memory and returned to the caller. It is NEVER written to a checkpointed graph
// channel — only refs/statuses/token counts are.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, START, END } from "@langchain/langgraph";
import { randomUUID } from "crypto";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { tracedNode } from "../observability/graphTracing.js";
import {
  recordGraphRunDuration,
  recordGraphRunTokens,
  recordGraphRunOutcome,
} from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import type { GraphRunStatus, WorkflowType } from "../state/schemas.js";
import type { OrchestratorInput, OrchestratorOutput } from "../../orchestrator/types.js";

export type OrchestratorCore = (input: OrchestratorInput) => Promise<OrchestratorOutput>;

const RUN_TYPE_TO_WORKFLOW: Record<string, WorkflowType> = {
  resume_review: "resume_review",
  job_match: "job_match",
  apply_pack: "apply_pack",
};

export function workflowForRunType(runType: string): WorkflowType {
  return RUN_TYPE_TO_WORKFLOW[runType] ?? "resume_review";
}

function mapStatus(s: OrchestratorOutput["status"]): GraphRunStatus {
  if (s === "partial") return "PARTIAL";
  if (s === "blocked") return "BLOCKED";
  return "COMPLETE";
}

/**
 * Run an orchestrator request through the wrap graph. Returns the identical
 * OrchestratorOutput the legacy path would return (parity), with graph state,
 * persistence, and events added around it.
 */
export async function runOrchestratorViaGraph(
  input: OrchestratorInput,
  core: OrchestratorCore,
): Promise<OrchestratorOutput> {
  const workflowType = workflowForRunType(input.run_type);
  const graphRunId = input.run_id ?? randomUUID();
  const threadId = `orchestrator:${graphRunId}:${input.run_type}`;
  const ctx = { graphRunId, workflowType, threadId };
  const startedAt = Date.now();

  let captured: OrchestratorOutput | undefined;
  let coreError: unknown;

  const graph = new StateGraph(BaseGraphAnnotation)
    .addNode("init", async () => {
      emitGraphEvent({ graphRunId, workflowType, threadId, type: "graph_started" });
      await createGraphRun({ graphRunId, workflowType, threadId, userId: input.user_id });
      return { graphRunId, workflowType, status: "RUNNING" as GraphRunStatus, currentStep: "execute" };
    })
    .addNode("execute", async () => {
      let out: OrchestratorOutput;
      try {
        out = await tracedNode(ctx, "execute", () => core(input), (o) => ({
          run_status: o.status,
          ranked_jobs: o.ranked_jobs.length,
          tailored_outputs: o.tailored_outputs.length,
        }));
      } catch (e) {
        coreError = e;
        throw e;
      }
      captured = out;
      const tokens = out.budget.token_used_estimate ?? 0;
      return {
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: tokens },
        outputRefs: [{ kind: "orchestrator_run", ref: out.run_id }],
        status: mapStatus(out.status),
        currentStep: "finalize",
      };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(graphRunId, {
        status: s.status,
        currentStep: "done",
        tokenUsage: s.tokenUsage.totalTokens,
      });
      recordGraphRunDuration(workflowType, Date.now() - startedAt);
      recordGraphRunTokens(workflowType, s.tokenUsage.totalTokens);
      recordGraphRunOutcome(workflowType, s.status);
      emitGraphEvent({
        graphRunId,
        workflowType,
        threadId,
        type: "graph_completed",
        details: { status: s.status, tokens: s.tokenUsage.totalTokens },
      });
      return {};
    })
    .addEdge(START, "init")
    .addEdge("init", "execute")
    .addEdge("execute", "finalize")
    .addEdge("finalize", END);

  const compiled = graph.compile({ checkpointer: getCheckpointer() });

  try {
    await compiled.invoke(
      { graphRunId, workflowType, userId: input.user_id },
      { configurable: { thread_id: threadId } },
    );
  } catch (err) {
    emitGraphEvent({
      graphRunId,
      workflowType,
      threadId,
      type: "graph_failed",
      details: { error: err instanceof Error ? err.message : String(err) },
    });
    await updateGraphRun(graphRunId, { status: "FAILED" });
    // If the core itself failed, propagate (parity with the legacy throw).
    if (coreError !== undefined) throw coreError;
    // The graph machinery failed but core never ran — fall back to legacy path.
    if (captured === undefined) captured = await core(input);
  }

  return captured as OrchestratorOutput;
}
