import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // These env vars are set before any test module is loaded.
    // MOCK_AI=1  → orchestrator returns deterministic stubs (no Claude API calls)
    // NODE_ENV=test → health/ready endpoints skip DB connectivity checks
    // ORCHESTRATOR_TOKEN_BUDGET_MAX → pin to schema max so tests are
    //   independent of the developer's local .env (which can lower the cap).
    env: {
      NODE_ENV: "test",
      MOCK_AI: "1",
      ORCHESTRATOR_TOKEN_BUDGET_MAX: "120000",
    },
    include: ["src/**/*.test.ts"],
    // Generous timeout for supertest HTTP round-trips; actual suite runs in < 5 s
    testTimeout: 10_000,
  },
});
