export interface RetryOptions {
    operationName: string;
    attempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
}
export interface DeadLetterInput {
    category: "scheduler" | "email" | "notification" | "webhook";
    source: string;
    reasonCode: string;
    retryable?: boolean;
    error: unknown;
    payload?: Record<string, unknown>;
}
export interface WorkerStateInput {
    status: "success" | "failed";
    startedAt: string;
    completedAt: string;
    durationMs: number;
    errorMessage?: string;
}
export declare function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T>;
export declare function pushDeadLetter(input: DeadLetterInput): Promise<void>;
export declare function listDeadLetters(limitPerSource?: number): Promise<Array<Record<string, unknown>>>;
export declare function summarizeDeadLetters(): Promise<Record<string, number>>;
export declare function recordWorkerState(workerName: string, input: WorkerStateInput): Promise<void>;
export declare function getWorkerStates(): Promise<Array<Record<string, unknown>>>;
//# sourceMappingURL=resilience.d.ts.map