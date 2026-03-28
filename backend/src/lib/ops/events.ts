import logger from "../logger.js";

type OpsEventOutcome = "success" | "failure" | "held" | "degraded" | "duplicate" | "retrying";
type OpsEventSeverity = "info" | "warning" | "critical";
type OpsEventUnit = "Count" | "Milliseconds";
type OpsEventValue = string | number | boolean | null | undefined;

export interface OpsEventInput {
  metricName: string;
  category: string;
  outcome?: OpsEventOutcome;
  severity?: OpsEventSeverity;
  owner?: string;
  value?: number;
  unit?: OpsEventUnit;
  durationMs?: number;
  message?: string;
  details?: Record<string, OpsEventValue>;
}

export interface OpsSnapshotMetricInput {
  metricName: string;
  value: number;
  unit?: OpsEventUnit;
  owner?: string;
  message?: string;
  details?: Record<string, OpsEventValue>;
}

function compactDetails(details?: Record<string, OpsEventValue>): Record<string, OpsEventValue> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== null),
  );

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function recordOpsEvent(input: OpsEventInput): void {
  const payload = {
    event_type: "ops_metric",
    metric_name: input.metricName,
    category: input.category,
    outcome: input.outcome ?? "success",
    severity: input.severity ?? "info",
    owner: input.owner ?? "platform",
    value: input.value ?? 1,
    unit: input.unit ?? "Count",
    duration_ms: input.durationMs,
    details: compactDetails(input.details),
  };

  const message = input.message ?? `[ops] ${input.metricName} ${payload.outcome}`;
  if (payload.outcome === "failure" || payload.severity === "critical") {
    logger.error(payload, message);
    return;
  }
  if (payload.severity === "warning" || payload.outcome === "degraded" || payload.outcome === "retrying") {
    logger.warn(payload, message);
    return;
  }
  logger.info(payload, message);
}

export function recordLatencyMetric(metricName: string, durationMs: number, details?: Record<string, OpsEventValue>): void {
  recordOpsEvent({
    metricName,
    category: "latency",
    outcome: "success",
    unit: "Milliseconds",
    value: durationMs,
    durationMs,
    details,
  });
}

export function recordOpsSnapshotMetric(input: OpsSnapshotMetricInput): void {
  logger.info(
    {
      event_type: "ops_snapshot",
      metric_name: input.metricName,
      owner: input.owner ?? "platform",
      value: input.value,
      unit: input.unit ?? "Count",
      details: compactDetails(input.details),
    },
    input.message ?? `[ops] snapshot ${input.metricName}`,
  );
}

