// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — public entry point + feature flags
//
// The entire LangGraph layer is gated behind LANGGRAPH_ENABLED (default OFF).
// When off, the existing orchestrator path is used unchanged. Per-graph flags
// allow canarying one workflow at a time, e.g. LANGGRAPH_APPLY_PACK=1.
// ─────────────────────────────────────────────────────────────────────────────

import logger from "../../logger.js";
import type { WorkflowType } from "./state/schemas.js";
import { setupCheckpointer } from "./memory/checkpointer.js";

/** Global kill-switch. Off by default so production behavior is unchanged. */
export function isLangGraphEnabled(): boolean {
  return process.env.LANGGRAPH_ENABLED === "1";
}

/** Per-graph canary flag; falls back to the global flag. */
export function isGraphEnabled(workflow: WorkflowType): boolean {
  const perGraph = process.env[`LANGGRAPH_${workflow.toUpperCase()}`];
  if (perGraph === "1") return true;
  if (perGraph === "0") return false;
  return isLangGraphEnabled();
}

let bootstrapped = false;

/**
 * Initialize the LangGraph layer. Safe to call when the flag is off (it becomes
 * a no-op). Idempotent. Call once during server bootstrap.
 */
export async function bootstrapLangGraph(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  if (!isLangGraphEnabled()) {
    logger.info("[graph] LangGraph disabled (LANGGRAPH_ENABLED!=1) — legacy path active");
    return;
  }
  try {
    await setupCheckpointer();
    logger.info("[graph] LangGraph layer bootstrapped");
  } catch (err) {
    // Never let graph bootstrap crash the server; fall back to legacy path.
    logger.error({ err: String(err) }, "[graph] bootstrap failed — continuing on legacy path");
  }
}

// Re-exports (stable public surface for graphs + callers).
export * as schemas from "./state/schemas.js";
export * as reducers from "./state/reducers.js";
export { BaseGraphAnnotation } from "./state/graphState.js";
export * as modelPolicy from "./policies/modelPolicy.js";
export * as riskPolicy from "./policies/riskPolicy.js";
export * as toolPolicy from "./policies/toolPolicy.js";
export * as humanApprovalPolicy from "./policies/humanApprovalPolicy.js";
export * as quotaPolicy from "./policies/quotaPolicy.js";
export * from "./registry/skillRegistry.js";
export * from "./registry/graphRegistry.js";
export * from "./observability/graphEvents.js";
export * from "./observability/graphTracing.js";
export * from "./observability/graphMetrics.js";
export { getCheckpointer, setupCheckpointer } from "./memory/checkpointer.js";
export { getLongTermStore } from "./memory/longTermStore.js";
