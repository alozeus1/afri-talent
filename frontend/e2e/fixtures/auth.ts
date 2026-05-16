import { APIRequestContext, Page, expect } from "@playwright/test";

/** Shared test credentials — seeded by backend/prisma/seed.ts */
export const TEST_CANDIDATE = {
  email: "candidate@example.com",
  password: "Password123!",
};

/**
 * PROFESSIONAL-plan candidate used by tests that need to pass the
 * `requirePlan(SubscriptionPlan.PROFESSIONAL)` gate on resume-builder
 * routes. Seeded by backend/prisma/seed.ts (Wave 5 PR #96).
 */
export const TEST_CANDIDATE_PRO = {
  email: "candidate-pro@example.com",
  password: "Password123!",
};

export const TEST_EMPLOYER = {
  email: "employer@example.com",
  password: "Password123!",
};

export const TEST_ADMIN = {
  email: "admin@example.com",
  password: "Password123!",
};

/** Base URL for the backend API (matches playwright.config.ts baseURL) */
export const API = process.env.API_BASE_URL ?? "http://localhost:4000";

/**
 * Persisted browser-state paths written by `global.setup.ts` and consumed by
 * UI specs via `test.use({ storageState: ... })`. Defined here (not in
 * `global.setup.ts`) so spec files don't have to import another test file —
 * Playwright forbids one test file importing another.
 */
export const TEST_CANDIDATE_STORAGE = "frontend/e2e/.auth/candidate.json";
export const TEST_CANDIDATE_PRO_STORAGE = "frontend/e2e/.auth/candidate-pro.json";

/**
 * Login and return the Set-Cookie header string.
 * Playwright's APIRequestContext stores cookies automatically when
 * `storeCookies` is true (the default), so subsequent requests in the same
 * context will include the auth_token cookie automatically.
 */
export async function loginAs(
  request: APIRequestContext,
  creds: { email: string; password: string }
): Promise<void> {
  const maxRetries = 5;
  const backoffMs = 3000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await request.post(`${API}/api/auth/login`, {
      data: creds,
    });

    if (res.ok()) return;

    const status = res.status();
    const body = await res.text();

    if (status === 429 && attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }

    throw new Error(`Login failed (${status}): ${body}`);
  }
}

/**
 * Login via the browser page (form submit), so the auth_token cookie lands
 * in the browser cookie jar — distinct from `loginAs`, which only populates
 * the Playwright `APIRequestContext` cookies. Use this when subsequent
 * `page.goto()` calls need to access authenticated routes.
 *
 * Mirrors the helper in `ui-agent3-browser-qa.spec.ts` so the pattern stays
 * consistent across UI suites that need authenticated-page access.
 */
export async function loginViaUi(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // Backend `validateHumanAuthSubmission` (backend/src/middleware/bot-protection.ts)
  // rejects POST /api/auth/login when `botShield.startedAt` shows the form was
  // completed in < FORM_MIN_COMPLETION_MS (1.2s). Two 1.3s pauses split across
  // load/fill/submit keep the elapsed time safely above that floor — same
  // pattern as the local helper in `ui-agent3-browser-qa.spec.ts:37-45`.
  await page.waitForTimeout(1_300);
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.waitForTimeout(1_300);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login"),
  );
  await page.locator("form button[type='submit']").click();
  expect((await loginResponse).ok()).toBeTruthy();
}

/** Register a fresh user and return their ID (for isolation tests). */
export async function registerUser(
  request: APIRequestContext,
  opts: {
    email: string;
    password: string;
    name: string;
    role?: "CANDIDATE" | "EMPLOYER";
  }
): Promise<string> {
  const res = await request.post(`${API}/api/auth/register`, {
    data: {
      email: opts.email,
      password: opts.password,
      name: opts.name,
      role: opts.role ?? "CANDIDATE",
    },
  });
  if (!res.ok()) {
    throw new Error(
      `Register failed (${res.status()}): ${await res.text()}`
    );
  }
  const body = await res.json();
  return body.user?.id as string;
}
