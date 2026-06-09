const VALID_NODE_ENVS = new Set(["development", "test", "production", "staging"]);

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`${name} must be set`);
  }

  return value;
}

export function validateRuntimeEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (!VALID_NODE_ENVS.has(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${Array.from(VALID_NODE_ENVS).join(", ")}`);
  }

  // Only enforce deployment-critical variables outside tests to keep local unit tests lightweight.
  if (nodeEnv === "test") {
    return;
  }

  requireEnv("DATABASE_URL");
  requireEnv("FRONTEND_URL");

  if (nodeEnv === "production" || nodeEnv === "staging") {
    // §2.1 startup self-test: fail fast on missing critical production env.
    // JWT_SECRET also throws at module load in jwt.ts; this list catches the
    // rest of the production essentials so a misconfigured deploy never serves
    // traffic.
    requireEnv("JWT_SECRET");
    requireEnv("ANTHROPIC_API_KEY");
    requireEnv("SENTRY_DSN");

    // If Flutterwave payments are enabled, the webhook signature secret is
    // mandatory — without it the webhook endpoint cannot authenticate
    // requests and rejects everything (fail closed). Fail the deploy instead.
    if (process.env.FLUTTERWAVE_SECRET_KEY?.trim()) {
      requireEnv("FLUTTERWAVE_SECRET_HASH");
    }
  }
}
