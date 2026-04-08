export type BillingHealthStatus = "configured" | "not_configured";
export declare function billingIsRequiredForHealth(env?: NodeJS.ProcessEnv): boolean;
export declare function buildDegradedState(input: {
    redis: string;
    billing: BillingHealthStatus;
    env?: NodeJS.ProcessEnv;
}): boolean;
//# sourceMappingURL=health.d.ts.map