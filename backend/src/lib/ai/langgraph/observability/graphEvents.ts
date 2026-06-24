// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — structured graph events
//
// Every graph run emits typed events. Events always go to the structured logger
// and ops metrics (CloudWatch via the existing pipeline). A pluggable sink lets
// the app persist events to GraphRunEvent without making this module depend on
// Prisma (so unit tests stay DB-free).
//
// PII safety: `details` is a FLAT map of scalars and must never contain raw
// resume text, contact info, or document contents — only refs / hashes / codes.
// ─────────────────────────────────────────────────────────────────────────────

import logger from "../../../logger.js";
import { recordOpsEvent } from "../../../ops/events.js";
import type { WorkflowType } from "../state/schemas.js";

export const GRAPH_EVENT_TYPES = [
  "graph_started",
  "graph_completed",
  "graph_failed",
  "graph_interrupted",
  "graph_resumed",
  "node_started",
  "node_completed",
  "node_failed",
  "tool_called",
  "model_called",
  "human_approval_requested",
  "human_approval_granted",
  "human_approval_denied",
  "side_effect_executed",
  "truth_guard_failed",
  "risk_threshold_triggered",
  "quota_blocked",
] as const;

export type GraphEventType = (typeof GRAPH_EVENT_TYPES)[number];

/** Flat, PII-free scalar map. */
export type EventDetails = Record<string, string | number | boolean | null | undefined>;

export interface GraphEvent {
  graphRunId: string;
  workflowType: WorkflowType;
  type: GraphEventType;
  node?: string;
  threadId?: string;
  details?: EventDetails;
  at: string;
}

export type GraphEventSink = (event: GraphEvent) => void | Promise<void>;

const sinks: GraphEventSink[] = [];

/** Register an additional sink (e.g. Prisma persistence). Best-effort, never throws. */
export function registerGraphEventSink(sink: GraphEventSink): void {
  sinks.push(sink);
}

/** For tests: clear registered sinks. */
export function _resetGraphEventSinks(): void {
  sinks.length = 0;
}

const FAILURE_EVENTS = new Set<GraphEventType>([
  "graph_failed",
  "node_failed",
  "truth_guard_failed",
]);
const WARNING_EVENTS = new Set<GraphEventType>([
  "graph_interrupted",
  "human_approval_requested",
  "human_approval_denied",
  "risk_threshold_triggered",
  "quota_blocked",
]);

/**
 * Emit a graph event. Always logs + records an ops metric; then fans out to any
 * registered sinks. Never throws (observability must not break a workflow).
 */
export function emitGraphEvent(input: Omit<GraphEvent, "at"> & { at?: string }): GraphEvent {
  const event: GraphEvent = { ...input, at: input.at ?? new Date().toISOString() };

  const logPayload = {
    event_type: "graph_event",
    graph_event: event.type,
    graph_run_id: event.graphRunId,
    workflow: event.workflowType,
    node: event.node,
    thread_id: event.threadId,
    details: event.details,
  };

  if (FAILURE_EVENTS.has(event.type)) logger.error(logPayload, `[graph] ${event.type}`);
  else if (WARNING_EVENTS.has(event.type)) logger.warn(logPayload, `[graph] ${event.type}`);
  else logger.info(logPayload, `[graph] ${event.type}`);

  try {
    recordOpsEvent({
      metricName: `langgraph_${event.type}`,
      category: "langgraph",
      outcome: FAILURE_EVENTS.has(event.type) ? "failure" : "success",
      severity: FAILURE_EVENTS.has(event.type) ? "warning" : "info",
      owner: "ai-platform",
      details: {
        workflow: event.workflowType,
        node: event.node,
        graph_run_id: event.graphRunId,
      },
    });
  } catch {
    /* ops emission must never break the graph */
  }

  for (const sink of sinks) {
    try {
      void Promise.resolve(sink(event)).catch((err) =>
        logger.warn({ err: String(err) }, "[graph] event sink failed"),
      );
    } catch (err) {
      logger.warn({ err: String(err) }, "[graph] event sink threw");
    }
  }

  return event;
}
