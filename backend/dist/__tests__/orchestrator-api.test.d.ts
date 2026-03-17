/**
 * Orchestrator HTTP route tests.
 *
 * Environment (set by vitest.config.ts):
 *   MOCK_AI=1      → orchestrator returns deterministic stubs, no Claude calls
 *   NODE_ENV=test  → health/ready endpoints skip DB; rate limiters use in-memory store
 *
 * Auth: signToken() uses the fallback secret ("dev-only-secret-change-in-production")
 * when JWT_SECRET is not set, so test tokens are valid without any env var.
 *
 * Persistence: mocked below so no DB is required.
 */
export {};
//# sourceMappingURL=orchestrator-api.test.d.ts.map