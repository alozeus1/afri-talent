// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — graph-level metrics
//
// Thin helpers over the existing ops metrics pipeline for graph-run aggregates
// (duration, token usage, cost). Kept separate from per-event emission so
// dashboards can chart run-level SLOs.
// ─────────────────────────────────────────────────────────────────────────────

import { recordOpsEvent, recordLatencyMetric } from "../../../ops/events.js";
import type { WorkflowType } from "../state/schemas.js";

export function recordGraphRunDuration(workflow: WorkflowType, durationMs: number): void {
  recordLatencyMetric("langgraph_run_duration_ms", durationMs, { workflow });
}

export function recordGraphRunTokens(workflow: WorkflowType, totalTokens: number): void {
  recordOpsEvent({
    metricName: "langgraph_run_tokens",
    category: "langgraph",
    owner: "ai-platform",
    value: totalTokens,
    unit: "Count",
    details: { workflow },
  });
}

export function recordGraphRunCostUsd(workflow: WorkflowType, costUsd: number): void {
  recordOpsEvent({
    metricName: "langgraph_run_cost_usd_milli",
    category: "langgraph",
    owner: "ai-platform",
    value: Math.round(costUsd * 1000), // store as milli-USD to keep an integer metric
    unit: "Count",
    details: { workflow },
  });
}

export function recordGraphRunOutcome(workflow: WorkflowType, status: string): void {
  recordOpsEvent({
    metricName: "langgraph_run_outcome",
    category: "langgraph",
    outcome: status === "FAILED" ? "failure" : status === "BLOCKED" ? "held" : "success",
    owner: "ai-platform",
    details: { workflow, status },
  });
}
