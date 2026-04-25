import type { AggregationDiagnostics, JobSource } from "../lib/jobs/aggregator/types.js";
export interface IngestionCycleEvaluation {
    cycleStatus: "success" | "failure";
    sourcesAttempted: number;
    sourcesSucceeded: number;
    sourcesFailed: number;
    jobsIngested: number;
    hadErrors: boolean;
    allCriticalSourcesFailed: boolean;
    zeroResultWithErrors: boolean;
    successCheckpointEligible: boolean;
    criticalSourcesAttempted: JobSource[];
    reasons: string[];
}
export interface IngestionReliabilityState {
    lastSuccessfulIngestionAt: Date | null;
    lastCycleAt: Date | null;
    lastCycleStatus: "success" | "failure" | "unknown";
    consecutiveFailureCount: number;
    consecutiveZeroResultCount: number;
    lastJobsIngested: number;
}
export declare function evaluateIngestionCycle(input: {
    jobsIngested: number;
    diagnostics: AggregationDiagnostics;
    criticalSources: JobSource[];
}): IngestionCycleEvaluation;
export declare function runAggregatorCycle(): Promise<void>;
export declare function getIngestionReliabilityState(): Promise<IngestionReliabilityState>;
export declare function getLastSyncTime(): Promise<Date | null>;
//# sourceMappingURL=aggregator-cron.d.ts.map