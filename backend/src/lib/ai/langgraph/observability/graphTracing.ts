// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — node tracing helper
//
// Wraps a node implementation so it automatically emits node_started /
// node_completed / node_failed with timing, and records latency. Keeps graph
// definitions clean and guarantees consistent observability across every node.
// ─────────────────────────────────────────────────────────────────────────────

import { emitGraphEvent, type EventDetails } from "./graphEvents.js";
import type { WorkflowType } from "../state/schemas.js";

export interface TraceContext {
  graphRunId: string;
  workflowType: WorkflowType;
  threadId?: string;
}

/**
 * Run `fn` as a traced node. Emits started/completed/failed events with duration.
 * Re-throws on error after emitting node_failed so the graph's own error handling
 * still applies.
 */
export async function tracedNode<T>(
  ctx: TraceContext,
  node: string,
  fn: () => Promise<T>,
  detailsFor?: (result: T) => EventDetails,
): Promise<T> {
  const startedAt = Date.now();
  emitGraphEvent({
    graphRunId: ctx.graphRunId,
    workflowType: ctx.workflowType,
    threadId: ctx.threadId,
    type: "node_started",
    node,
  });
  try {
    const result = await fn();
    emitGraphEvent({
      graphRunId: ctx.graphRunId,
      workflowType: ctx.workflowType,
      threadId: ctx.threadId,
      type: "node_completed",
      node,
      details: { duration_ms: Date.now() - startedAt, ...(detailsFor?.(result) ?? {}) },
    });
    return result;
  } catch (err) {
    emitGraphEvent({
      graphRunId: ctx.graphRunId,
      workflowType: ctx.workflowType,
      threadId: ctx.threadId,
      type: "node_failed",
      node,
      details: {
        duration_ms: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
