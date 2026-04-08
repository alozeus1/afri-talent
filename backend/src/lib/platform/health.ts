export type BillingHealthStatus = "configured" | "not_configured";

export function billingIsRequiredForHealth(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HEALTHCHECK_REQUIRE_BILLING === "1") {
    return true;
  }

  if (env.HEALTHCHECK_REQUIRE_BILLING === "0") {
    return false;
  }

  const appEnv = (env.APP_ENV || env.NODE_ENV || "").toLowerCase();
  return !["development", "test", "staging"].includes(appEnv);
}

export function buildDegradedState(input: {
  redis: string;
  billing: BillingHealthStatus;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const billingDegraded = input.billing !== "configured" && billingIsRequiredForHealth(input.env);
  return input.redis === "degraded" || billingDegraded;
}
