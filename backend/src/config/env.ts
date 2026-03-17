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
    requireEnv("JWT_SECRET");
  }
}
