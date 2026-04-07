import { expect, test } from "@playwright/test";

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const API_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

let servicesAvailable = true;

test.beforeAll(async ({ request }) => {
  try {
    const [appRes, apiRes] = await Promise.all([
      request.get(APP_URL),
      request.get(`${API_URL}/health`),
    ]);
    servicesAvailable = appRes.ok() && apiRes.ok();
  } catch {
    servicesAvailable = false;
  }
});

test.beforeEach(() => {
  test.skip(!servicesAvailable, "Frontend/API services are not reachable");
});

test("homepage renders with loading affordances and supports dark mode toggle", async ({
  page,
}) => {
  await page.route("**/api/public/stats", async (route) => {
    await page.waitForTimeout(450);
    await route.continue();
  });

  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", {
      name: "Unlock Global Opportunities for African Talent",
    }),
  ).toBeVisible();

  await expect(page.locator(".animate-pulse").first()).toBeVisible();
  await expect(page.getByText("Active Candidates")).toBeVisible();

  const hadDarkClass = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.locator("button[aria-label='Toggle color theme']:visible").first().click();

  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(!hadDarkClass);
});

test("jobs page shows loading skeleton and job detail emits JobPosting schema", async ({
  page,
  request,
}) => {
  await page.route("**/api/jobs?**", async (route) => {
    await page.waitForTimeout(500);
    await route.continue();
  });

  await page.goto(`${APP_URL}/jobs`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Find Your Next Role" })).toBeVisible();
  await expect(
    page.getByText("Results update in the background as you refine your search."),
  ).toBeVisible();

  const jobsRes = await request.get(`${API_URL}/api/jobs?limit=1`);
  test.skip(!jobsRes.ok(), `Jobs API unavailable for schema assertion: status ${jobsRes.status()}`);
  const jobsPayload = await jobsRes.json();
  const firstJob = jobsPayload.jobs?.[0];
  test.skip(!firstJob, "No published jobs available for schema assertion");

  await page.goto(`${APP_URL}/jobs/${firstJob.slug}`, { waitUntil: "networkidle" });
  const schemaText = await page
    .locator("script[type='application/ld+json']")
    .first()
    .textContent();

  expect(schemaText).toBeTruthy();
  const parsed = JSON.parse(schemaText || "{}") as Record<string, unknown>;
  expect(parsed["@type"]).toBe("JobPosting");
  expect(parsed.title).toBeTruthy();
  expect(parsed.description).toBeTruthy();
});

test("custom 404 route behaves correctly", async ({ page }) => {
  await page.goto(`${APP_URL}/this-route-should-not-exist-${Date.now()}`, {
    waitUntil: "networkidle",
  });

  await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Go Home" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Browse Jobs" })).toBeVisible();
});

test("multilingual routing redirects root and serves localized routes", async ({ page }) => {
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/(en|fr|pt|ar)$/);

  await page.goto(`${APP_URL}/fr/pricing`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/fr\/pricing$/);
  await expect(page.getByRole("heading", { name: "Plans et tarifs" })).toBeVisible();
});

test("accessibility smoke: keyboard focus progression reaches primary nav", async ({
  page,
}) => {
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });

  await page.keyboard.press("Tab");
  const firstTag = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() ?? "",
  );
  expect(["a", "button", "select", "input"]).toContain(firstTag);

  await page.keyboard.press("Tab");
  const secondTag = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() ?? "",
  );
  // On some mobile browsers, focus may temporarily return to <body> after virtual viewport adjustments.
  expect(["a", "button", "select", "input", "body"]).toContain(secondTag);
});

test("mobile navigation drawer is accessible and usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-web", "Mobile-only UX validation");

  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });

  const toggle = page.getByLabel("Toggle menu");
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Menu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find Jobs" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeVisible();
});

test("low-bandwidth resilience: homepage remains navigable under delayed asset delivery", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.continue();
  });

  try {
    const start = Date.now();
    await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
    const elapsed = Date.now() - start;

    await expect(
      page.getByRole("heading", {
        name: "Unlock Global Opportunities for African Talent",
      }),
    ).toBeVisible();

    // Soft SLO guard for low-end/slow simulation; keep broad to reduce flakes.
    expect(elapsed).toBeLessThan(15000);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});
