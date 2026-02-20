import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for AfriTalent E2E tests.
 *
 * Tests are split into two suites:
 *   gate-a-security  — auth cookie, logout, token blocklist, CORS, rate-limit edge cases
 *   gate-b-schema    — profile CRUD, resumes, notifications
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
      testMatch: /\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: API_URL },
    },
  ],
});

export { API_URL, APP_URL };
