import { test, expect } from "@playwright/test";
import { API } from "./fixtures/auth";

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

test("smoke: register then login with cookie session", async ({ request }) => {
  const email = `phase1-smoke-${Date.now()}@example.com`;
  const password = "Password123!";

  const registerRes = await request.post(`${API}/api/auth/register`, {
    data: {
      email,
      password,
      name: "Phase1 Smoke User",
      role: "CANDIDATE",
    },
  });
  expect(registerRes.ok()).toBe(true);

  const logoutRes = await request.post(`${API}/api/auth/logout`);
  expect(logoutRes.ok()).toBe(true);

  const loginRes = await request.post(`${API}/api/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBe(true);

  const meRes = await request.get(`${API}/api/auth/me`);
  expect(meRes.ok()).toBe(true);
  const me = await meRes.json();
  expect(me.authenticated).toBe(true);
  expect(me.user?.email).toBe(email);
});

test("smoke: active job detail page includes JobPosting schema", async ({ request, page }) => {
  const jobsRes = await request.get(`${API}/api/jobs?limit=1`);
  expect(jobsRes.ok()).toBe(true);
  const jobsData = await jobsRes.json();
  test.skip(!jobsData.jobs || jobsData.jobs.length === 0, "No published jobs available for schema smoke test");

  const slug = jobsData.jobs[0].slug as string;
  await page.goto(`${APP_URL}/en/jobs/${slug}`, { waitUntil: "domcontentloaded" });

  const schemaScript = page.locator("script[type='application/ld+json']").first();
  await expect(schemaScript).toHaveCount(1);

  const schemaText = await schemaScript.textContent();
  const parsed = JSON.parse(schemaText || "{}") as Record<string, unknown>;
  expect(parsed["@type"]).toBe("JobPosting");
  expect(parsed.title).toBeTruthy();
  expect(parsed.description).toBeTruthy();
});
