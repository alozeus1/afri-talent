import logger from "../logger.js";
function compactDetails(details) {
    if (!details) {
        return undefined;
    }
    const sanitized = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined && value !== null));
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
export function recordOpsEvent(input) {
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
export function recordLatencyMetric(metricName, durationMs, details) {
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
export function recordOpsSnapshotMetric(input) {
    logger.info({
        event_type: "ops_snapshot",
        metric_name: input.metricName,
        owner: input.owner ?? "platform",
        value: input.value,
        unit: input.unit ?? "Count",
        details: compactDetails(input.details),
    }, input.message ?? `[ops] snapshot ${input.metricName}`);
}
//# sourceMappingURL=events.js.map