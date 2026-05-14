/**
 * Wave 5 PR #4 — Playwright coverage for the in-place resume builder UX
 * (FE PR #95) + the ATS rubric route surface (BE PR #92).
 *
 * Backend must be running with MOCK_AI=1 so /generate, /save and
 * /ats-rubric/score return deterministic stubs without an Anthropic key.
 *
 * Path coverage (8 cases across 6 paths):
 *  1.  Step-flow happy path (sign in → fill steps 1..5 → generate → save badge)
 *  2.  Step-3 skills gate (next disabled when empty; enabled after typing)
 *  3.  Template flip (data-selected toggles; preview re-renders)
 *  4.  Rubric happy path (post-gen JD → score + 4 criterion cards)
 *  5a. Rubric 413 with limit_bytes=524288 (assert "512 KB" copy)
 *  5b. Rubric 404 (generic "Not found" copy from friendly-error.ts:107)
 *  5c. Rubric network abort (isNetworkError → "No internet connection" copy)
 *  6.  PremiumGate render for FREE candidate (gate visible, step indicator absent)
 *
 * Filename matches playwright.config.ts testMatch /ui-.*\.spec\.ts$/ so
 * the suite runs on both desktop-web AND mobile-web projects.
 */

import { test, expect, type Page } from "@playwright/test";
import { TEST_CANDIDATE_PRO } from "./fixtures/auth";
import {
  TEST_CANDIDATE_STORAGE,
  TEST_CANDIDATE_PRO_STORAGE,
} from "./global.setup";

const RESUME_BUILDER_URL = "/candidate/resume-builder";
const ATS_RUBRIC_URL_GLOB = "**/api/skills/resume-builder/ats-rubric/score";

async function fillStepsThroughSummary(page: Page) {
  await page.getByPlaceholder("Jane Doe").fill("Ada Okonkwo");
  await page.getByPlaceholder("jane@example.com").fill(TEST_CANDIDATE_PRO.email);
  await page.getByPlaceholder("Senior Software Engineer").fill("Senior Backend Engineer");
  await page.getByLabel("Years of Experience *").fill("6");
  await expect(page.getByTestId("resume-step-next")).toBeEnabled();
  await page.getByTestId("resume-step-next").click();

  await expect(page.getByTestId("resume-step-2")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("resume-step-next").click();

  await expect(page.getByTestId("resume-step-3")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("resume-skills-input").fill("TypeScript, Node.js, PostgreSQL, AWS");
  await expect(page.getByTestId("resume-step-next")).toBeEnabled();
  await page.getByTestId("resume-step-next").click();

  await expect(page.getByTestId("resume-step-4")).toHaveAttribute("aria-current", "step");
  await page.getByTestId("resume-step-next").click();

  await expect(page.getByTestId("resume-step-5")).toHaveAttribute("aria-current", "step");
}

test.describe.configure({ mode: "serial" });

test.describe("Wave 5 — Resume Builder (multi-step UX + ATS rubric)", () => {
  test.use({ storageState: TEST_CANDIDATE_PRO_STORAGE });

  test("1. Step-flow happy path: fill steps 1..5 → generate → Saved badge appears", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await expect(page.getByRole("heading", { name: "AI Resume Builder" })).toBeVisible();
    await expect(page.getByTestId("resume-step-1")).toHaveAttribute("aria-current", "step");

    await fillStepsThroughSummary(page);

    await expect(page.getByTestId("resume-template-classic")).toHaveAttribute("data-selected", "true");
    await page.getByTestId("resume-generate-trigger").click();

    await expect(page.getByTestId("resume-preview-textarea")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("resume-step-1")).toHaveCount(0);

    await page.getByRole("button", { name: "Save Resume" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Resume saved. Job Matcher will now use this for similarity scoring."),
    ).toBeVisible();
  });

  test("2. Step-3 skills gate: next disabled when empty, enabled after typing a skill", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);

    await page.getByPlaceholder("Jane Doe").fill("Ada Okonkwo");
    await page.getByPlaceholder("jane@example.com").fill(TEST_CANDIDATE_PRO.email);
    await page.getByPlaceholder("Senior Software Engineer").fill("Senior Backend Engineer");
    await page.getByLabel("Years of Experience *").fill("6");
    await page.getByTestId("resume-step-next").click();
    await page.getByTestId("resume-step-next").click();

    await expect(page.getByTestId("resume-step-3")).toHaveAttribute("aria-current", "step");
    await page.getByTestId("resume-skills-input").fill("");
    await expect(page.getByTestId("resume-step-next")).toBeDisabled();

    await page.getByTestId("resume-skills-input").fill("TypeScript");
    await expect(page.getByTestId("resume-step-next")).toBeEnabled();
  });

  test("3. Template flip: data-selected toggles between cards; persistence across step nav", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await fillStepsThroughSummary(page);

    await expect(page.getByTestId("resume-template-classic")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("resume-template-modern")).not.toHaveAttribute("data-selected", "true");

    await page.getByTestId("resume-template-modern").click();
    await expect(page.getByTestId("resume-template-modern")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("resume-template-classic")).not.toHaveAttribute("data-selected", "true");

    await page.getByTestId("resume-template-minimal").click();
    await expect(page.getByTestId("resume-template-minimal")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("resume-template-modern")).not.toHaveAttribute("data-selected", "true");

    await page.getByTestId("resume-step-back").click();
    await expect(page.getByTestId("resume-step-4")).toHaveAttribute("aria-current", "step");
    await page.getByTestId("resume-step-next").click();
    await expect(page.getByTestId("resume-step-5")).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("resume-template-minimal")).toHaveAttribute("data-selected", "true");
  });

  test("4. Rubric happy path: post-gen JD → score + 4 criterion cards", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await fillStepsThroughSummary(page);
    await page.getByTestId("resume-generate-trigger").click();
    await expect(page.getByTestId("resume-preview-textarea")).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(/job description/i).fill(
      "Senior Backend Engineer building distributed payments systems on AWS using TypeScript and PostgreSQL. Strong Kubernetes and Redis experience required.",
    );
    await page.getByTestId("resume-rubric-trigger").click();

    await expect(page.getByTestId("resume-rubric-score")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("resume-rubric-criterion-keywords")).toBeVisible();
    await expect(page.getByTestId("resume-rubric-criterion-formatting")).toBeVisible();
    await expect(page.getByTestId("resume-rubric-criterion-experience")).toBeVisible();
    await expect(page.getByTestId("resume-rubric-criterion-skills")).toBeVisible();
  });

  test("5a. Rubric 413 with limit_bytes=524288 → size-aware copy says '512 KB'", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await fillStepsThroughSummary(page);
    await page.getByTestId("resume-generate-trigger").click();
    await expect(page.getByTestId("resume-preview-textarea")).toBeVisible({ timeout: 15_000 });

    await page.route(ATS_RUBRIC_URL_GLOB, async (route) => {
      const req = route.request();
      expect(req.method(), `expected POST, got ${req.method()}`).toBe("POST");
      await route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({ code: "RESUME_TOO_LARGE", limit_bytes: 524288 }),
      });
    });

    await page.getByTestId("resume-rubric-trigger").click();
    const errorBox = page.getByTestId("resume-rubric-error");
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("Resume is too large to score");
    await expect(errorBox).toContainText("512 KB");
  });

  test("5b. Rubric 404 → generic 'Not found' copy from friendly-error.ts", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await fillStepsThroughSummary(page);
    await page.getByTestId("resume-generate-trigger").click();
    await expect(page.getByTestId("resume-preview-textarea")).toBeVisible({ timeout: 15_000 });

    await page.route(ATS_RUBRIC_URL_GLOB, async (route) => {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not Found" });
    });

    await page.getByTestId("resume-rubric-trigger").click();
    const errorBox = page.getByTestId("resume-rubric-error");
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("Not found");
    await expect(errorBox).not.toContainText("512 KB");
    await expect(errorBox).not.toContainText("256 KB");
  });

  test("5c. Rubric network abort → 'No internet connection' copy", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);
    await fillStepsThroughSummary(page);
    await page.getByTestId("resume-generate-trigger").click();
    await expect(page.getByTestId("resume-preview-textarea")).toBeVisible({ timeout: 15_000 });

    await page.route(ATS_RUBRIC_URL_GLOB, async (route) => {
      await route.abort();
    });

    await page.getByTestId("resume-rubric-trigger").click();
    const errorBox = page.getByTestId("resume-rubric-error");
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("No internet connection");
  });
});

test.describe("Wave 5 — Resume Builder PremiumGate (FREE plan)", () => {
  test.use({ storageState: TEST_CANDIDATE_STORAGE });

  test("6. PremiumGate renders for FREE candidate; step indicator absent", async ({ page }) => {
    await page.goto(RESUME_BUILDER_URL);

    await expect(page.getByText("AI Resume Builder & Templates")).toBeVisible();
    await expect(page.getByText("Professional", { exact: false })).toBeVisible();

    await expect(page.getByTestId("resume-step-1")).toHaveCount(0);
    await expect(page.getByTestId("resume-step-5")).toHaveCount(0);
    await expect(page.getByTestId("resume-generate-trigger")).toHaveCount(0);
  });
});
