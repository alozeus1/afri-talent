// ─────────────────────────────────────────────────────────────────────────────
// Wave 9 §10.1 PR-B — Custom CloudWatch metric emission for agent SLOs.
//
// Six metrics in the `AfriTalent/Agents` namespace, one dimension
// `Environment` (dev|staging|prod). Names MUST match exactly what
// `infra/terraform/modules/observability/alarms.tf` references:
//
//   MatchAgentDurationSeconds            (Seconds, p95) — SLO #3
//   ApplyAgentSubmissions                (Count, Sum)  — SLO #4 denominator
//   ApplyAgentConfirmed                  (Count, Sum)  — SLO #4 numerator
//   ClassifierEvaluations                (Count, Sum)  — SLO #5 denominator
//   ClassifierCorrect                    (Count, Sum)  — SLO #5 numerator (proxy*)
//   StaleJobRemovalLatencySeconds        (Seconds, Max)— SLO #6
//
// *Classifier accuracy proxy: we don't have ground-truth labels at
//  classification time (that needs a post-hoc reviewer pipeline,
//  Wave 10+). Until then, "Correct" = "confidence ≥ 0.8". This is honest
//  signal — when LLM confidence drops or keyword fallback fires more, the
//  proxy accuracy drops. Real ground-truth replaces this when the
//  reviewer pipeline ships.
//
// Emission contract:
//   - Fire-and-forget: callers MUST use `void emitMetric(...)`; never await.
//     Per `backend-patterns.md`, observability writes never block request path.
//   - MOCK_AI=1 short-circuits: stubbed runs don't pollute production CW.
//   - PutMetricData errors are logged at warn, never re-thrown.
//   - METRICS_DISABLED=1 hard-kill switch (defense-in-depth for cost incidents).
// ─────────────────────────────────────────────────────────────────────────────

import { CloudWatchClient, PutMetricDataCommand, type MetricDatum, StandardUnit } from "@aws-sdk/client-cloudwatch";
import logger from "../logger.js";

const NAMESPACE = "AfriTalent/Agents";

const ENVIRONMENT = process.env.NODE_ENV === "production" ? "prod" : (process.env.METRICS_ENVIRONMENT || "dev");
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const MOCK_AI = process.env.MOCK_AI === "1";
const METRICS_DISABLED = process.env.METRICS_DISABLED === "1";

let _cw: CloudWatchClient | null = null;

function client(): CloudWatchClient {
  if (!_cw) {
    _cw = new CloudWatchClient({ region: AWS_REGION });
  }
  return _cw;
}

/**
 * The set of CloudWatch metric names this module emits. Exported as a const
 * union so call sites can't typo a metric name silently — TypeScript will
 * catch a string literal that doesn't match the alarm contract.
 */
export const AgentMetric = {
  MatchAgentDurationSeconds: "MatchAgentDurationSeconds",
  ApplyAgentSubmissions: "ApplyAgentSubmissions",
  ApplyAgentConfirmed: "ApplyAgentConfirmed",
  ClassifierEvaluations: "ClassifierEvaluations",
  ClassifierCorrect: "ClassifierCorrect",
  StaleJobRemovalLatencySeconds: "StaleJobRemovalLatencySeconds",
} as const;

export type AgentMetricName = (typeof AgentMetric)[keyof typeof AgentMetric];

interface EmitOptions {
  unit: StandardUnit;
  value: number;
}

/**
 * Internal — emits a single MetricDatum. Fire-and-forget; never throws.
 * Public callers should use the specific helpers below (emitMatchAgentDurationMs,
 * etc.) rather than calling this directly.
 */
function emit(metric: AgentMetricName, opts: EmitOptions): void {
  if (METRICS_DISABLED) return;
  if (MOCK_AI) return;
  if (!Number.isFinite(opts.value)) return;

  const datum: MetricDatum = {
    MetricName: metric,
    Value: opts.value,
    Unit: opts.unit,
    Timestamp: new Date(),
    Dimensions: [{ Name: "Environment", Value: ENVIRONMENT }],
  };

  // Fire-and-forget — caller never awaits this promise. We swallow errors
  // here so an observability outage cannot fail the surrounding request.
  client()
    .send(new PutMetricDataCommand({ Namespace: NAMESPACE, MetricData: [datum] }))
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), metric, value: opts.value },
        "[metrics] PutMetricData failed (non-fatal)",
      );
    });
}

// ── Helpers (one per metric, typed to prevent unit mismatch) ─────────────────

/** SLO #3 — end-to-end Match Agent duration per job. Alarm uses p95 ≤ 6s. */
export function emitMatchAgentDurationMs(durationMs: number): void {
  emit(AgentMetric.MatchAgentDurationSeconds, {
    unit: StandardUnit.Seconds,
    value: durationMs / 1000,
  });
}

/** SLO #4 — denominator (every dispatchApply call counts as a submission). */
export function emitApplyAgentSubmission(): void {
  emit(AgentMetric.ApplyAgentSubmissions, { unit: StandardUnit.Count, value: 1 });
}

/** SLO #4 — numerator (only fires when delivery is *confirmed*, not just submitted). */
export function emitApplyAgentConfirmed(): void {
  emit(AgentMetric.ApplyAgentConfirmed, { unit: StandardUnit.Count, value: 1 });
}

/** SLO #5 — denominator (every classifyJobField call). */
export function emitClassifierEvaluation(): void {
  emit(AgentMetric.ClassifierEvaluations, { unit: StandardUnit.Count, value: 1 });
}

/**
 * SLO #5 — numerator (high-confidence proxy for "correct"). Replace this
 * with ground-truth-driven emission when the post-hoc reviewer pipeline
 * ships (Wave 10+).
 */
export function emitClassifierCorrect(): void {
  emit(AgentMetric.ClassifierCorrect, { unit: StandardUnit.Count, value: 1 });
}

/** SLO #6 — stale-job removal latency in seconds. Alarm uses Max statistic. */
export function emitStaleJobRemovalLatencySeconds(seconds: number): void {
  emit(AgentMetric.StaleJobRemovalLatencySeconds, {
    unit: StandardUnit.Seconds,
    value: seconds,
  });
}
