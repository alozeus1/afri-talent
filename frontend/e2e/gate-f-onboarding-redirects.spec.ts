/**
 * Gate F — Onboarding entry-point redirects (Wave 6 §7.2)
 *
 * Verifies that legacy/SEO onboarding paths collapse to /register with a
 * strict 301 status (NOT 308 — search engines and older clients treat 301
 * as the canonical permanent redirect per the launch master prompt).
 *
 * Aliases covered: /signup, /sign-up, /join, /get-started.
 *
 * Hits the FRONTEND at APP_BASE_URL (not the API), so the test uses
 * `maxRedirects: 0` against an absolute URL to bypass this project's
 * default baseURL (api) and read the raw redirect response.
 */

import { test, expect } from "@playwright/test";

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

const ALIASES = ["/signup", "/sign-up", "/join", "/get-started"] as const;

for (const alias of ALIASES) {
  test(`GET ${alias} → 301 /register`, async ({ request }) => {
    const res = await request.get(`${APP_URL}${alias}`, { maxRedirects: 0 });
    expect(res.status(), `expected 301, got ${res.status()} for ${alias}`).toBe(301);
    const location = res.headers()["location"];
    expect(location, `expected Location header on ${alias}`).toBeTruthy();
    expect(location).toMatch(/\/register$/);
  });
}
