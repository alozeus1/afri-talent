import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AfriTalent E2E tests.
 *
 * Tests are split into API and UI suites:
 *   gate-a-security / gate-b-schema / phase*-api* / phase*-security*
 *      -> API project (request + API-centric flows)
 *   ui-*.spec.ts
 *      -> desktop-web + mobile-web projects
 *
 * The backend must be running on http://localhost:4000 (or API_BASE_URL).
 * The frontend (Next.js) must be running on http://localhost:3000.
 *
 * Run:
 *   npx playwright test                   # all suites
 *   npx playwright test gate-a-security   # single suite
 *   npx playwright test --reporter=line   # compact output
 */

const API_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: APP_URL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "api",
      testMatch: /(gate-.*|phase1-foundation-smoke|phase2-.*api.*|phase2-.*security.*|skills-ai-features|agentic-.*)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: API_URL },
    },
    // Setup project: logs in test users once per CI run and persists
    // their authenticated browser state to `frontend/e2e/.auth/*.json`.
    // Spec files consume the state via `test.use({ storageState: ... })`
    // to skip per-test login (avoids /api/auth/login rate-limit).
    {
      name: "setup",
      testMatch: /global\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "desktop-web",
      testMatch: /ui-.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "mobile-web",
      testMatch: /ui-.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 5"], baseURL: APP_URL },
    },
  ],
});

export { API_URL, APP_URL };
