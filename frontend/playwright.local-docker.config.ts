import { defineConfig, devices } from "@playwright/test";

/**
 * Free-launch end-to-end journeys against the local Docker stack
 * (docker compose up --build). See docs/LOCAL_DOCKER_E2E.md.
 *
 *   APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
 *     npx playwright test -c playwright.local-docker.config.ts
 */
export default defineConfig({
  testDir: "./e2e/local-docker",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
