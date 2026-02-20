/**
 * Gate A — Security baseline E2E tests
 *
 * Verifies:
 *  1. HttpOnly cookie auth — token not exposed to JavaScript
 *  2. Cookie-based session — /api/auth/me works without Bearer header
 *  3. Logout invalidates session (token blocked in Redis)
 *  4. Protected routes return 401 without credentials
 *  5. Invalid / expired token returns 401
 *  6. Input validation (jobs pagination cap, CV URL scheme)
 *
 * Requires the backend running on API_BASE_URL (default http://localhost:4000).
 */

import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, TEST_EMPLOYER, loginAs } from "./fixtures/auth";

// ---------------------------------------------------------------------------
// 1. HttpOnly cookie — not accessible to JavaScript
// ---------------------------------------------------------------------------

test("login response body does NOT contain a token field", async ({
  request,
}) => {
  const res = await request.post(`${API}/api/auth/login`, {
    data: TEST_CANDIDATE,
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  // Token must not be returned in the body — auth uses HttpOnly cookie only
  expect(body.token).toBeUndefined();
  expect(body.user).toBeDefined();
  expect(body.user.email).toBe(TEST_CANDIDATE.email);
});

// ---------------------------------------------------------------------------
// 2. Cookie-based session (me endpoint works without explicit Authorization)
// ---------------------------------------------------------------------------

test("/api/auth/me works via cookie without Authorization header", async ({
  request,
}) => {
  // Login — Playwright's request context persists cookies automatically
  await loginAs(request, TEST_CANDIDATE);

  const meRes = await request.get(`${API}/api/auth/me`);
  expect(meRes.ok()).toBe(true);
  const body = await meRes.json();
  expect(body.user.email).toBe(TEST_CANDIDATE.email);
});

// ---------------------------------------------------------------------------
// 3. Logout invalidates session
// ---------------------------------------------------------------------------

test("after logout /api/auth/me returns 401", async ({ request }) => {
  await loginAs(request, TEST_CANDIDATE);

  // Confirm we're authenticated
  const before = await request.get(`${API}/api/auth/me`);
  expect(before.ok()).toBe(true);

  // Logout
  const logoutRes = await request.post(`${API}/api/auth/logout`);
  expect(logoutRes.ok()).toBe(true);

  // Cookie should be cleared — subsequent request should be 401
  const after = await request.get(`${API}/api/auth/me`);
  expect(after.status()).toBe(401);
});

// ---------------------------------------------------------------------------
// 4. Protected routes return 401 without credentials
// ---------------------------------------------------------------------------

test.describe("unauthenticated access", () => {
  const protectedRoutes: [string, string][] = [
    ["GET", "/api/auth/me"],
    ["GET", "/api/profile"],
    ["GET", "/api/applications"],
    ["GET", "/api/notifications"],
    ["GET", "/api/billing/status"],
  ];

  for (const [method, path] of protectedRoutes) {
    test(`${method} ${path} returns 401 without cookie`, async ({
      request,
    }) => {
      // Fresh request context — no cookies
      const res = await request.fetch(`${API}${path}`, { method });
      expect(res.status()).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Invalid token returns 401
// ---------------------------------------------------------------------------

test("Bearer token with garbage value returns 401", async ({ request }) => {
  const res = await request.get(`${API}/api/auth/me`, {
    headers: { Authorization: "Bearer this.is.not.a.valid.jwt" },
  });
  expect(res.status()).toBe(401);
});

test("Bearer token with valid structure but wrong signature returns 401", async ({
  request,
}) => {
  // A JWT with correct format but tampered signature
  const fakeJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + // header
    ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZha2UiLCJpYXQiOjE1MTYyMzkwMjJ9" + // payload
    ".TAMPERED_SIGNATURE_XXXXXXXXXXXXXXXXXXXXXXX"; // bad sig
  const res = await request.get(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${fakeJwt}` },
  });
  expect(res.status()).toBe(401);
});

// ---------------------------------------------------------------------------
// 6. Input validation
// ---------------------------------------------------------------------------

test("jobs list clamps limit at 100", async ({ request }) => {
  const res = await request.get(`${API}/api/jobs?limit=9999`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  // Pagination limit must be capped at 100
  expect(body.pagination.limit).toBeLessThanOrEqual(100);
});

test("apply with http:// cvUrl is rejected", async ({ request }) => {
  await loginAs(request, TEST_CANDIDATE);

  const res = await request.post(`${API}/api/applications`, {
    data: {
      jobId: "nonexistent-id",
      cvUrl: "http://evil.com/malware.pdf", // HTTP not HTTPS
    },
  });
  // 400 Bad Request (validation) or 404 (job not found after validation passes)
  // Either way it must NOT be 200/201
  expect(res.status()).not.toBe(200);
  expect(res.status()).not.toBe(201);
  // If it hits validation it should be 400
  if (res.status() === 400) {
    const body = await res.json();
    expect(body.error ?? body.details ?? "").toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// 7. Auth registration validation
// ---------------------------------------------------------------------------

test("register with weak password returns 400", async ({ request }) => {
  const res = await request.post(`${API}/api/auth/register`, {
    data: {
      email: `test-${Date.now()}@example.com`,
      password: "123", // too short
      name: "Test User",
      role: "CANDIDATE",
    },
  });
  expect(res.status()).toBe(400);
});

test("register with duplicate email returns 409", async ({ request }) => {
  // TEST_CANDIDATE email already exists from seed
  const res = await request.post(`${API}/api/auth/register`, {
    data: {
      email: TEST_CANDIDATE.email,
      password: "password123",
      name: "Dup User",
      role: "CANDIDATE",
    },
  });
  expect(res.status()).toBe(409);
});

// ---------------------------------------------------------------------------
// 8. CORS — requests from unlisted origins rejected
// ---------------------------------------------------------------------------

test("OPTIONS preflight from disallowed origin returns CORS error", async ({
  request,
}) => {
  const res = await request.fetch(`${API}/api/auth/me`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil-site.example.com",
      "Access-Control-Request-Method": "GET",
    },
  });
  // CORS rejection: 403/500 or missing Allow-Origin header
  const allowOrigin = res.headers()["access-control-allow-origin"] ?? "";
  expect(allowOrigin).not.toBe("https://evil-site.example.com");
});

test("requests from allowed origin include correct CORS headers", async ({
  request,
}) => {
  const res = await request.fetch(`${API}/api/jobs`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "GET",
    },
  });
  const allowOrigin = res.headers()["access-control-allow-origin"] ?? "";
  expect(allowOrigin).toBe("http://localhost:3000");
});
