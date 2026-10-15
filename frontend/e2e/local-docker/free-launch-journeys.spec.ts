/**
 * Free-launch end-to-end journeys against the local Docker stack.
 * Runs against a live `docker compose up --build` (project "afritalent-local");
 * see docs/LOCAL_DOCKER_E2E.md. Not part of CI: it reads email-verification
 * links from `docker compose logs backend` (EMAIL_DEV_LOG_LINKS=1).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { execSync } from "node:child_process";
import path from "node:path";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";
const APP = process.env.APP_BASE_URL ?? "http://localhost:3000";
const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT ?? "afritalent-local";
const REPO_ROOT = path.resolve(__dirname, "../../..");
const PASSWORD = "Password123!x";
const stamp = Date.now();
const jobTitle = `Senior Backend Engineer ${stamp}`;
const candidateName = `Ada Candidate ${stamp}`;
// Unique per run: a domain already used by another employer is held for review.
const companyDomain = `acme${stamp}.com`;
const PAYWALL = /upgrade to|subscribe now|checkout|payment required|choose a plan|start free trial|unlock with/i;

test.describe.configure({ mode: "serial" });

let employerCtx: BrowserContext;
let candidateCtx: BrowserContext;
let employer: Page;
let candidate: Page;

async function register(page: Page, opts: { role: "candidate" | "employer"; name: string; email: string }) {
  await page.goto(opts.role === "employer" ? "/en/register?role=employer" : "/en/register");
  // Bot shield rejects submissions completed faster than a human could.
  await page.waitForTimeout(3500);
  await page.getByLabel("Full Name").fill(opts.name);
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (opts.role === "employer") {
    await page.getByLabel(/Company Name/i).fill(`Acme Hiring ${stamp}`);
    await page.getByLabel(/Company Location/i).fill("Lagos, Nigeria");
  }
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.waitForURL(new RegExp(`/en/${opts.role}`));
}

function latestVerifyLink(): string {
  const logs = execSync(`docker compose -p ${COMPOSE_PROJECT} logs backend --since 5m --no-log-prefix`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const links = [...logs.matchAll(/"verifyUrl":"([^"]+)"/g)].map((m) => m[1]);
  if (links.length === 0) throw new Error("No DEV email verification link in backend logs");
  // FRONTEND_URL is http://localhost:<FRONTEND_HOST_PORT>; keep only the path.
  const url = new URL(links[links.length - 1]);
  return `${url.pathname}${url.search}`;
}

/** Visible error banners, ignoring Next.js' empty route announcer. */
async function expectNoErrorAlert(page: Page) {
  const alerts = page.locator("[role=alert]:not(#__next-route-announcer__)").filter({ hasText: /\S/ });
  const texts = await alerts.allInnerTexts();
  expect(texts, `error alerts on ${page.url()}`).toEqual([]);
}

async function expectNoPaywall(page: Page) {
  await expect(page.locator("body")).not.toContainText(PAYWALL);
}

test.beforeAll(async ({ browser }) => {
  employerCtx = await browser.newContext();
  candidateCtx = await browser.newContext();
  employer = await employerCtx.newPage();
  candidate = await candidateCtx.newPage();
});

test.afterAll(async () => {
  await employerCtx?.close();
  await candidateCtx?.close();
});

test("health: backend and frontend respond", async ({ request }) => {
  expect((await request.get(`${API}/health`)).status()).toBe(200);
  const pricing = await (await request.get(`${API}/api/pricing`)).json();
  expect(pricing.freeMode).toBe(true);
  expect((await request.get(`${APP}/en`)).status()).toBe(200);
});

test("pricing page says free for everyone, no paywall", async ({ page }) => {
  await page.goto("/en/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/free/i);
  await expect(page).toHaveTitle(/Free for everyone/);
  await expectNoPaywall(page);
});

test("employer registers, verifies company domain and posts a job (no payment prompt)", async () => {
  await register(employer, { role: "employer", name: "Grace Employer", email: `hr@${companyDomain}` });
  await expectNoPaywall(employer);

  await employer.goto("/en/employer/onboarding");
  await employer.getByLabel("Company website").fill(`https://${companyDomain}`);
  await employer.getByRole("button", { name: "Save and continue" }).click();
  await expect(employer.locator("body")).toContainText(/verif/i);

  await employer.goto("/en/employer/jobs/new");
  await expect(employer.locator("body")).toContainText(`Domain matched: ${companyDomain}`);
  await employer.getByLabel("Job title").fill(jobTitle);
  await employer
    .locator("#description")
    .fill(
      "We are hiring a senior backend engineer to own Node.js and PostgreSQL services, mentor engineers and ship weekly. Fully remote across Africa with a transparent salary band and a clear interview process.",
    );
  await employer.getByLabel("Location").fill("Remote - Africa");
  await employer.getByRole("button", { name: "Continue" }).click();
  await expect(employer.getByLabel("Min salary")).toBeVisible();
  await employer.getByRole("button", { name: "Continue" }).click();
  // Step 3 must be a real review step (regression: Continue used to submit).
  await expect(employer.getByText("Publish review")).toBeVisible();
  await expectNoPaywall(employer);
  await employer.getByRole("button", { name: "Post job" }).click();
  await expect(employer.getByText("Job published!")).toBeVisible();
});

test("candidate registers, verifies email and completes profile", async () => {
  await register(candidate, { role: "candidate", name: candidateName, email: `cand${stamp}@example.com` });
  await expect(candidate.locator("body")).toContainText("Verify your email");
  await candidate.waitForTimeout(1000);
  await candidate.goto(latestVerifyLink());
  await expect(candidate.getByText(/Email verified/i).first()).toBeVisible();

  await candidate.goto("/en/candidate/profile");
  await candidate.getByLabel("Headline").fill("Senior Backend Engineer");
  await candidate
    .locator("#bio")
    .fill("Backend engineer with 6 years building Node.js and PostgreSQL systems for fintech teams across Africa.");
  await candidate.getByPlaceholder(/React, Node.js/).fill("Node.js, PostgreSQL, TypeScript,");
  await candidate.getByLabel("Years of Experience").fill("6");
  await candidate.getByRole("button", { name: "Save Profile" }).click();
  await expect(candidate.getByRole("button", { name: "Save Profile" })).toBeEnabled();
});

test("candidate searches, views and applies to the job", async () => {
  await candidate.goto("/en/jobs");
  await candidate.getByLabel("Search jobs").fill(jobTitle);
  await candidate.keyboard.press("Enter");
  await candidate.getByRole("link", { name: new RegExp(jobTitle) }).first().click();
  await expect(candidate.getByRole("heading", { name: jobTitle })).toBeVisible();

  await candidate.getByRole("button", { name: "Apply Now" }).click();
  const dialog = candidate.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Submit application" })).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Submit application" }).click();
  await expect(candidate.getByTestId("job-applied-state")).toBeVisible();
  await expectNoPaywall(candidate);

  await candidate.goto("/en/candidate/applications");
  await expect(candidate.locator("body")).toContainText(jobTitle);
});

test("employer sees the applicant", async () => {
  await employer.goto("/en/employer");
  await employer.getByRole("tab", { name: "Jobs" }).click();
  await expect(employer.locator("body")).toContainText(jobTitle);
  await expect(employer.locator("body")).toContainText("1 application(s)");
  await employer.getByRole("button", { name: "View applications" }).first().click();
  await expect(employer.locator("body")).toContainText(candidateName);
  await expectNoPaywall(employer);
});

test("AI: job matches before a resume shows the build-resume empty state", async () => {
  await candidate.goto("/en/candidate/job-matches");
  await expect(candidate.getByTestId("job-matches-empty")).toBeVisible();
  await expectNoErrorAlert(candidate);
  await expectNoPaywall(candidate);
});

test("AI: resume builder generates and saves a resume (MOCK_AI)", async () => {
  await candidate.goto("/en/candidate/resume-builder");
  await candidate.getByRole("button", { name: "Start from profile" }).click();
  for (let i = 0; i < 6; i++) {
    const next = candidate.getByTestId("resume-step-next");
    if (!(await next.isVisible())) break;
    await expect(next).toBeEnabled();
    await next.click();
  }
  await candidate.getByTestId("resume-generate-trigger").click();
  await candidate.getByRole("button", { name: "Save Resume" }).click();
  await expect(candidate.getByText(/Resume saved/)).toBeVisible();
  await expectNoErrorAlert(candidate);
  await expectNoPaywall(candidate);
});

test("AI: job matches render ranked roles (MOCK_AI)", async () => {
  await candidate.goto("/en/candidate/job-matches");
  await expect(candidate.getByTestId("job-match-card").first()).toBeVisible();
  await expectNoErrorAlert(candidate);
  await expectNoPaywall(candidate);
});

test("AI: cover letter generates (MOCK_AI)", async () => {
  await candidate.goto("/en/candidate/cover-letter");
  await candidate.locator("#cover-letter-job-search").fill(String(stamp));
  await candidate.getByRole("button", { name: new RegExp(jobTitle) }).first().click();
  await candidate.getByRole("button", { name: "Generate Cover Letter" }).click();
  await expect(candidate.getByRole("button", { name: "Generate Cover Letter" })).toBeEnabled({ timeout: 30_000 });
  await expectNoErrorAlert(candidate);
  const letter = candidate.getByTestId("cover-letter-textarea");
  await expect(letter).toBeVisible();
  expect((await letter.inputValue()).length).toBeGreaterThan(200);
  await expectNoPaywall(candidate);
});

test("AI: career advisor analyses (MOCK_AI)", async () => {
  await candidate.goto("/en/candidate/career-advisor");
  await candidate.getByPlaceholder(/Senior Software Engineer/).fill("Staff Backend Engineer");
  await candidate.getByRole("button", { name: "Analyse Career" }).click();
  await expect(candidate.getByRole("button", { name: "Re-Analyse" })).toBeVisible({ timeout: 30_000 });
  await expect(candidate.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(candidate.getByRole("heading", { name: "90-Day Action Plan" })).toBeVisible();
  await expectNoErrorAlert(candidate);
  await expectNoPaywall(candidate);
});

test("billing page shows free messaging instead of checkout", async () => {
  await candidate.goto("/en/billing");
  // Free mode: nothing to buy, so /billing redirects to the free-for-everyone page.
  await candidate.waitForURL(/\/en\/pricing/);
  await expect(candidate.getByRole("heading", { level: 1 })).toContainText(/free/i);
  await expectNoPaywall(candidate);
});

for (const seeded of [
  { email: "candidate@example.com", home: /\/en\/candidate/ },
  { email: "employer@example.com", home: /\/en\/employer/ },
]) {
  test(`seeded ${seeded.email} can sign in`, async ({ page }) => {
    await page.goto("/en/login");
    await page.waitForTimeout(3500);
    await page.getByLabel("Email").fill(seeded.email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(seeded.home);
    await expectNoPaywall(page);
  });
}
