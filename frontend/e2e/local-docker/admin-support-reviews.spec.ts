/**
 * Admin console, customer support and company-review journeys against the
 * local Docker stack (project "afritalent-local"; see docs/LOCAL_DOCKER_E2E.md).
 *
 *   APP_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:4000 \
 *     npx playwright test -c playwright.local-docker.config.ts admin-support-reviews
 *
 * Signs in as the seeded admin (admin@example.com, TOTP pre-enrolled by the
 * seed), creates a throwaway candidate + employer per run, and drives:
 *   - find users, message them, suspend (login blocked) -> reactivate (login ok),
 *     revoke sessions (existing session rejected), audit log entries, job actions;
 *   - contact form -> ticket in admin support -> admin reply;
 *   - company review -> moderation -> public with aggregates, helpful-vote dedupe;
 *   - crawler metrics endpoints + the Operations page panel.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

const API = process.env.API_BASE_URL ?? "http://localhost:4000";
const SEEDED_PASSWORD = "Password123!";
const PASSWORD = "Password123!x";
const stamp = Date.now();
// Reserved "e2e-" prefix: global-teardown.ts purges these accounts afterwards.
const candidateEmail = `e2e-admin-cand${stamp}@example.com`;
const candidateName = `Kofi Reviewer ${stamp}`;
const companyDomain = `adm${stamp}.com`;
const employerEmail = `e2e-hr@${companyDomain}`;
const companyName = `Admin E2E Co ${stamp}`;

test.describe.configure({ mode: "serial" });

let adminCtx: BrowserContext;
let candidateCtx: BrowserContext;
let employerCtx: BrowserContext;
let admin: Page;
let candidate: Page;
let employer: Page;

/** Same-origin-credentialed API call from inside the page, with the CSRF header the app sends. */
async function api<T = unknown>(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  return page.evaluate(
    async ({ base, method, path, body }) => {
      const readCsrf = () => document.cookie.match(/(?:^|;\s*)afri_csrf=([^;]*)/)?.[1];
      // /me (re)issues the session-bound CSRF cookie, as the app does before writes.
      if (method !== "GET") await fetch(`${base}/api/auth/me`, { credentials: "include" });
      const csrf = readCsrf();
      const res = await fetch(`${base}${path}`, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* non-JSON body */
      }
      return { status: res.status, data };
    },
    { base: API, method, path, body },
  ) as Promise<{ status: number; data: T }>;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/en/login");
  await page.waitForTimeout(3500); // bot shield rejects instant submissions
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function register(page: Page, opts: { role: "candidate" | "employer"; name: string; email: string }) {
  await page.goto(opts.role === "employer" ? "/en/register?role=employer" : "/en/register");
  await page.waitForTimeout(3500);
  await page.getByLabel("Full Name").fill(opts.name);
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill(PASSWORD);
  if (opts.role === "employer") {
    await page.getByLabel(/Company Name/i).fill(companyName);
    await page.getByLabel(/Company Location/i).fill("Accra, Ghana");
  }
  await page.getByRole("button", { name: "Create Account" }).click();
  await page.waitForURL(new RegExp(`/en/${opts.role}`));
}

async function openUser(email: string) {
  await admin.goto(`/en/admin/users`);
  await admin.locator("#users-search").fill(email);
  await admin.locator("#users-search").press("Enter");
  const row = admin.getByRole("row").filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.click();
  const drawer = admin.getByRole("dialog").filter({ hasText: email });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function confirmWithReason(reason: string) {
  const modals = admin.locator("[role=dialog][aria-modal=true]");
  const open = await modals.count();
  const dialog = modals.last();
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button").last().click();
  await expect(modals).toHaveCount(open - 1);
}

async function lifecycle(email: string, actionLabel: string, reason: string) {
  const drawer = await openUser(email);
  await drawer.getByRole("button", { name: actionLabel, exact: true }).click();
  await confirmWithReason(reason);
  await expect(admin.getByText(`${actionLabel} applied.`)).toBeVisible();
}

async function newContext(browser: Browser) {
  return browser.newContext();
}

test.beforeAll(async ({ browser }) => {
  adminCtx = await newContext(browser);
  candidateCtx = await newContext(browser);
  employerCtx = await newContext(browser);
  admin = await adminCtx.newPage();
  candidate = await candidateCtx.newPage();
  employer = await employerCtx.newPage();
  await register(candidate, { role: "candidate", name: candidateName, email: candidateEmail });
  await register(employer, { role: "employer", name: "Ama Employer", email: employerEmail });
});

test.afterAll(async () => {
  await adminCtx?.close();
  await candidateCtx?.close();
  await employerCtx?.close();
});

test("admin signs in and lands on the console", async () => {
  await signIn(admin, "admin@example.com", SEEDED_PASSWORD);
  await admin.waitForURL(/\/admin(\/|$)/);
  await admin.goto("/en/admin");
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(admin.locator("body")).not.toContainText(/Something went wrong/i);
});

test("admin finds a candidate and an employer and messages both", async () => {
  for (const email of [candidateEmail, employerEmail]) {
    const drawer = await openUser(email);
    await drawer.getByLabel("Subject").fill(`Welcome to AfriTalent ${stamp}`);
    await drawer.getByLabel("Message").fill("Hello from the AfriTalent team — reach out any time.");
    await drawer.getByRole("button", { name: "Send message" }).click();
    await expect(drawer.getByText(/Message delivered in-app/)).toBeVisible();
    await admin.keyboard.press("Escape");
  }
  // The candidate receives the admin message in-app.
  await candidate.goto("/en/candidate");
  await candidate.getByRole("banner").getByRole("link", { name: /^Messages/ }).click();
  await expect(candidate.locator("body")).toContainText(`Welcome to AfriTalent ${stamp}`);
});

test("suspend blocks login and the live session; reactivate restores access", async ({ browser }) => {
  await lifecycle(candidateEmail, "Suspend", "E2E suspension check");

  // Existing session: /me reports signed-out and protected routes refuse it.
  expect((await api<{ authenticated: boolean }>(candidate, "GET", "/api/auth/me")).data.authenticated).toBe(false);
  const blocked = await api<{ code: string }>(candidate, "GET", "/api/support/tickets/mine");
  expect(blocked.status).toBe(403);
  expect(blocked.data.code).toBe("ACCOUNT_SUSPENDED");

  // Fresh login is refused with the suspension message.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, candidateEmail, PASSWORD);
  await expect(page.getByText(/suspended/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/en\/login/);

  await lifecycle(candidateEmail, "Reactivate", "E2E reactivation");
  await signIn(page, candidateEmail, PASSWORD);
  await page.waitForURL(/\/en\/candidate/);
  await ctx.close();
});

test("revoke sessions signs the user out everywhere", async () => {
  // Reactivation restores the candidate's existing session (suspension blocks
  // the token while it lasts; it does not invalidate it).
  expect((await api(candidate, "GET", "/api/support/tickets/mine")).status).toBe(200);
  await candidate.waitForTimeout(1100); // JWT iat has 1s resolution

  await lifecycle(candidateEmail, "Revoke sessions", "E2E revoke sessions");
  const revoked = await api<{ code: string }>(candidate, "GET", "/api/support/tickets/mine");
  expect(revoked.status).toBe(401);
  expect(revoked.data.code).toBe("SESSION_REVOKED");
  expect((await api<{ authenticated: boolean }>(candidate, "GET", "/api/auth/me")).data.authenticated).toBe(false);

  await signIn(candidate, candidateEmail, PASSWORD);
  await candidate.waitForURL(/\/en\/candidate/);
  expect((await api(candidate, "GET", "/api/support/tickets/mine")).status).toBe(200);
});

test("audit trail records the lifecycle actions", async () => {
  const drawer = await openUser(candidateEmail);
  await expect(drawer).toContainText("E2E suspension check");
  await expect(drawer).toContainText("E2E reactivation");
  await expect(drawer).toContainText("E2E revoke sessions");
  await admin.keyboard.press("Escape");

  await admin.goto("/en/admin/audit-logs");
  await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(admin.locator("body")).toContainText("E2E revoke sessions");
});

test("admin manages a job (feature, then unfeature)", async () => {
  const jobs = await api<{ jobs: Array<{ id: string; title: string; status: string; isFeatured: boolean }> }>(
    admin,
    "GET",
    "/api/admin/console/jobs?status=PUBLISHED&limit=5",
  );
  expect(jobs.status).toBe(200);
  const job = jobs.data.jobs.find((j) => !j.isFeatured);
  expect(job, "a published, unfeatured job").toBeTruthy();

  await admin.goto(`/en/admin/jobs`);
  await admin.locator("#jobs-search").fill(job!.title);
  await admin.locator("#jobs-search").press("Enter");
  const row = admin.getByRole("row").filter({ hasText: job!.title }).first();
  await row.getByRole("button", { name: "Feature", exact: true }).click();
  await confirmWithReason("E2E feature job");
  await expect(admin.getByText("Feature applied.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Unfeature", exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Unfeature", exact: true }).click();
  await confirmWithReason("E2E unfeature job");
  await expect(admin.getByText("Unfeature applied.")).toBeVisible();
});

test("contact form creates a ticket; admin finds it and replies", async () => {
  const contact = await candidateCtx.newPage();
  await contact.goto("/en/contact");
  await contact.waitForTimeout(3500);
  await contact.getByLabel("Full name").fill(candidateName);
  await contact.getByLabel("Email address").fill(candidateEmail);
  await contact.getByLabel("Subject (optional)").fill(`E2E help ${stamp}`);
  await contact.locator("#contact-message").fill("I would like help updating my profile headline and skills, please.");
  const created = contact.waitForResponse((r) => r.url().includes("/api/support/tickets") && r.request().method() === "POST");
  await contact.getByRole("button", { name: "Send message" }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const reference: string = (await response.json()).ticket.reference;
  await expect(contact.getByRole("heading", { name: "Message received" })).toBeVisible();
  await expect(contact.locator("body")).toContainText(reference);
  await contact.close();

  await admin.goto("/en/admin/support");
  await admin.getByLabel("Search tickets").fill(reference);
  await admin.getByLabel("Search tickets").press("Enter");
  await admin.getByRole("button").filter({ hasText: reference }).first().click();
  await admin.getByLabel(`Reply to ${candidateName}`).fill("Thanks for reaching out — we have updated your profile guidance.");
  await admin.getByRole("button", { name: "Send reply" }).click();
  await expect(admin.locator("p[role=status]").filter({ hasText: /\S/ })).toBeVisible();

  const mine = await api<{ tickets: Array<{ reference: string; replies?: unknown[] }> }>(candidate, "GET", "/api/support/tickets/mine");
  expect(mine.status).toBe(200);
  const ticket = mine.data.tickets.find((t) => t.reference === reference);
  expect(ticket?.replies?.length ?? 0).toBeGreaterThan(0);
});

test("review: submit -> moderate -> public with aggregates; helpful vote is deduped", async ({ browser }) => {
  const list = await api<{ companies: Array<{ id: string; companyName?: string; name?: string }> }>(
    candidate,
    "GET",
    `/api/companies?search=${encodeURIComponent(companyName)}&limit=10`,
  );
  const company = list.data.companies.find((c) => (c.companyName ?? c.name) === companyName);
  expect(company, "new employer appears in the company directory").toBeTruthy();

  await candidate.goto(`/en/companies/${company!.id}`);
  await candidate.getByRole("button", { name: "Write a review" }).click();
  const form = candidate.locator("form[aria-labelledby=review-form-title]");
  await form.getByRole("radiogroup").first().getByRole("radio").nth(3).click();
  await form.locator("#review-title").fill(`Great place to grow ${stamp}`);
  await form.locator("#review-pros").fill("Supportive managers, remote-first culture and clear growth paths.");
  await form.locator("#review-cons").fill("Meetings across time zones can run late in the evening.");
  await form.getByRole("button", { name: /submit/i }).click();
  await expect(candidate.getByRole("status").filter({ hasText: /thank/i })).toBeVisible();

  // Pending reviews are not public.
  const before = await api<{ reviews: Array<{ title: string }> }>(candidate, "GET", `/api/companies/${company!.id}/reviews`);
  expect(before.data.reviews.some((r) => r.title === `Great place to grow ${stamp}`)).toBe(false);

  await admin.goto("/en/admin/reviews");
  const item = admin.getByRole("listitem").filter({ hasText: `Great place to grow ${stamp}` });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(item.getByRole("button", { name: "Approve" })).toBeHidden();

  // Visible publicly with aggregates.
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(`/en/companies/${company!.id}`);
  await expect(pub.locator("body")).toContainText(`Great place to grow ${stamp}`);
  await expect(pub.locator("body")).toContainText(/4\.0/);
  await expect(pub.locator("body")).toContainText(/1 review/i);
  await anon.close();

  // Helpful vote from another user: second vote is a no-op.
  const voterCtx = await browser.newContext();
  const voter = await voterCtx.newPage();
  await signIn(voter, "candidate@example.com", SEEDED_PASSWORD);
  await voter.waitForURL(/\/en\/candidate/);
  const reviews = await api<{ reviews: Array<{ id: string; title: string }> }>(voter, "GET", `/api/companies/${company!.id}/reviews`);
  const review = reviews.data.reviews.find((r) => r.title === `Great place to grow ${stamp}`)!;
  const first = await api<{ helpfulCount: number; alreadyVoted: boolean }>(voter, "POST", `/api/companies/${company!.id}/reviews/${review.id}/helpful`);
  const second = await api<{ helpfulCount: number; alreadyVoted: boolean }>(voter, "POST", `/api/companies/${company!.id}/reviews/${review.id}/helpful`);
  expect(first.status, JSON.stringify(first.data)).toBe(200);
  expect(first.data.helpfulCount).toBe(1);
  expect(second.data.alreadyVoted).toBe(true);
  expect(second.data.helpfulCount).toBe(1);
  // The UI reflects the vote as pressed with the deduped count.
  await voter.goto(`/en/companies/${company!.id}`);
  await expect(voter.getByRole("button", { name: /Helpful · 1/ })).toHaveAttribute("aria-pressed", "true");
  // The author cannot vote on their own review.
  const own = await api(candidate, "POST", `/api/companies/${company!.id}/reviews/${review.id}/helpful`);
  expect(own.status).toBe(400);
  await voterCtx.close();
});

test("crawler metrics endpoints and Operations panel render", async () => {
  const health = await api<{ engine: string; feeds: unknown[]; atsCompanies: number }>(admin, "GET", "/api/aggregator/health");
  expect(health.status).toBe(200);
  expect(health.data.feeds.length).toBeGreaterThan(5);
  expect(health.data.atsCompanies).toBeGreaterThan(0);
  expect((await api(admin, "GET", "/api/aggregator/runs?limit=5")).status).toBe(200);
  // Not for non-admins.
  expect((await api(candidate, "GET", "/api/aggregator/runs")).status).toBe(403);

  await admin.goto("/en/admin/ops");
  const panel = admin.getByTestId("crawler-panel");
  await expect(panel.getByRole("heading", { name: "Job crawler" })).toBeVisible();
  await expect(panel).toContainText("Feeds");
  await expect(panel.locator("[role=alert]")).toHaveCount(0);

  // A real ingestion run has been recorded with per-feed metrics.
  const latest = await api<{ run: { status: string; sources: Array<{ source: string; fetched: number }> } | null }>(
    admin,
    "GET",
    "/api/aggregator/runs/latest",
  );
  expect(latest.status).toBe(200);
  expect(latest.data.run, "an AggregatorRun row (run POST /api/aggregator/sync first)").toBeTruthy();
  expect(latest.data.run!.sources.filter((s) => s.fetched > 0).length).toBeGreaterThanOrEqual(6);

  // Crawled jobs reach the public board with their source attribution.
  await admin.goto("/en/jobs");
  const source = admin.getByTestId("job-source-badge").first();
  await expect(source).toBeVisible();
  await expect(source).toHaveText(/^via \S/);
});
