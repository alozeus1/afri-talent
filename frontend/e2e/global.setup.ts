/**
 * Playwright setup project — logs in test users ONCE per CI run and writes
 * their authenticated browser state to JSON files under `.auth/`. Other
 * suites (currently just `ui-wave5-resume-builder-ats.spec.ts`) consume
 * these state files via `test.use({ storageState: ... })` so individual
 * tests skip the login step entirely.
 *
 * Why: the per-test `loginViaUi(page, ...)` pattern drowns the
 * `/api/auth/login` rate-limiter when a suite has many tests across
 * multiple projects with CI retries. See
 * `feedback_playwright-auth-storagestate.md` in user memory for the full
 * rationale.
 *
 * Wired up in `playwright.config.ts` via a `setup` project + `dependencies`
 * on desktop-web / mobile-web.
 */

import { test as setup } from "@playwright/test";
import { loginViaUi, TEST_CANDIDATE, TEST_CANDIDATE_PRO } from "./fixtures/auth";

export const TEST_CANDIDATE_STORAGE = "frontend/e2e/.auth/candidate.json";
export const TEST_CANDIDATE_PRO_STORAGE = "frontend/e2e/.auth/candidate-pro.json";

setup("authenticate FREE candidate", async ({ page }) => {
  await loginViaUi(page, TEST_CANDIDATE);
  await page.context().storageState({ path: TEST_CANDIDATE_STORAGE });
});

setup("authenticate PRO candidate", async ({ page }) => {
  await loginViaUi(page, TEST_CANDIDATE_PRO);
  await page.context().storageState({ path: TEST_CANDIDATE_PRO_STORAGE });
});
