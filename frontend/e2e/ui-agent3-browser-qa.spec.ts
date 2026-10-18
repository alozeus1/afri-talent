import { expect, test, type Page } from "@playwright/test";

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const API_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const ADMIN_CREDS = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "Password123!",
};
const CANDIDATE_CREDS = {
  email: process.env.E2E_CANDIDATE_EMAIL ?? "candidate@example.com",
  password: process.env.E2E_CANDIDATE_PASSWORD ?? "Password123!",
};
const EMPLOYER_CREDS = {
  email: process.env.E2E_EMPLOYER_EMAIL ?? "employer@example.com",
  password: process.env.E2E_EMPLOYER_PASSWORD ?? "Password123!",
};

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
});

test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-web", "Agent browser QA runs once on desktop.");
});

async function loginViaUi(
  page: Page,
  creds: { email: string; password: string },
  redirect?: string,
) {
  const target = redirect
    ? `${APP_URL}/login?redirect=${encodeURIComponent(redirect)}`
    : `${APP_URL}/login`;
  await page.goto(target, { waitUntil: "domcontentloaded" });
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

test("public landing, jobs, and companies pages render core browse affordances", async ({
  page,
}) => {
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      name: /Give African talent a higher-signal path to global opportunities/i,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Find Jobs/i }).first()).toBeVisible();

  await page.goto(`${APP_URL}/jobs`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1, name: /Find jobs open to African talent/i }),
  ).toBeVisible();
  // The ranking explanation now sits behind a compact "How ranking works"
  // disclosure in the jobs hero; it must still be reachable and readable.
  const rankingInfo = page.getByRole("button", { name: /How ranking works/i });
  await expect(rankingInfo).toBeVisible();
  // Retry the click until hydration has attached the handler.
  await expect(async () => {
    if ((await rankingInfo.getAttribute("aria-expanded")) !== "true") await rankingInfo.click();
    await expect(rankingInfo).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText(/Search ranking prioritizes relevance/i).first()).toBeVisible();

  await page.goto(`${APP_URL}/companies`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1, name: /Discover employer profiles\s*as verification comes online/i }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Search companies by name or industry...")).toBeVisible();
  await expect(page.getByText(/compan(y|ies) found/i)).toBeVisible();
});

test("candidate dashboard accepts login and exposes basic candidate actions", async ({
  page,
}) => {
  await loginViaUi(page, CANDIDATE_CREDS);
  await expect(page).toHaveURL(/\/(en\/)?candidate$/);
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/i })).toBeVisible();
  await expect(page.getByText(/Track your applications/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Browse Jobs|Find Jobs/i }).first()).toBeVisible();
});

test("employer dashboard accepts login and exposes basic employer actions", async ({
  page,
}) => {
  await loginViaUi(page, EMPLOYER_CREDS);
  await expect(page).toHaveURL(/\/(en\/)?employer$/);
  await expect(page.getByRole("heading", { name: /hiring command center/i })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Post a job" })).toHaveAttribute(
    "href",
    /\/employer\/jobs\/new$/,
  );
  await expect(main.getByRole("link", { name: "Search talent" }).first()).toBeVisible();
});

test("Spanish route and language switcher preserve localized navigation", async ({
  page,
}) => {
  await page.goto(`${APP_URL}/es/pricing`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/es\/pricing$/);
  await expect(page.getByRole("heading", { name: /Planes y precios/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Buscar empleos" }).first()).toHaveAttribute(
    "href",
    "/es/jobs",
  );

  // The language selector's accessible name is localized ("Idioma" on /es).
  const languageSelector = page.getByRole("combobox", { name: "Idioma" }).first();
  await languageSelector.selectOption("en");
  await expect(page).toHaveURL(/\/en\/pricing$/);
  await expect(page.getByRole("heading", { name: /Plans & Pricing/i })).toBeVisible();
});

test("OAuth provider visibility follows provider discovery response", async ({
  page,
  request,
}) => {
  const providersRes = await request.get(`${API_URL}/api/auth/oauth/providers`);
  expect(providersRes.ok()).toBeTruthy();
  const providersPayload = await providersRes.json();
  const providers = providersPayload.providers ?? [];

  await page.goto(`${APP_URL}/login`, { waitUntil: "domcontentloaded" });

  if (providers.some((provider: { provider: string }) => provider.provider === "google")) {
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toHaveCount(0);
  }

  if (providers.some((provider: { provider: string }) => provider.provider === "apple")) {
    await expect(page.getByRole("button", { name: "Sign in with Apple" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Sign in with Apple" })).toHaveCount(0);
  }
});

test("admin billing customer override works from search to success receipt", async ({
  page,
}) => {
  await loginViaUi(page, ADMIN_CREDS, "/admin/billing");
  await expect(page).toHaveURL(/\/admin\/billing$/);
  await expect(
    page.getByRole("heading", { name: /Reconciliation, support, and pricing safety/i }),
  ).toBeVisible();

  await page.getByPlaceholder(/Search by email/i).fill(CANDIDATE_CREDS.email);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: new RegExp(CANDIDATE_CREDS.email, "i") }).click();

  await expect(page.getByRole("heading", { name: "Subscription access override" })).toBeVisible();
  const overrideForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Update subscription access" }),
  });
  await overrideForm.locator("select").first().selectOption("BASIC");
  await expect(overrideForm.locator("select").first()).toHaveValue("BASIC");
  await overrideForm.locator("select").nth(1).selectOption("ACTIVE");
  await expect(overrideForm.locator("select").nth(1)).toHaveValue("ACTIVE");
  await overrideForm.getByLabel("Audit notes").fill(`Agent 3 QA override ${Date.now()}`);
  await overrideForm.getByRole("button", { name: "Update subscription access" }).click();

  await expect(page.getByText(/Subscription access updated/i)).toBeVisible();
  await expect(page.getByText(/Effective plan is BASIC/i)).toBeVisible();
});
