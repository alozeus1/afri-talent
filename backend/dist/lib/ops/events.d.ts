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
export declare function recordOpsEvent(input: OpsEventInput): void;
export declare function recordLatencyMetric(metricName: string, durationMs: number, details?: Record<string, OpsEventValue>): void;
export declare function recordOpsSnapshotMetric(input: OpsSnapshotMetricInput): void;
export {};
//# sourceMappingURL=events.d.ts.map