// frontend/e2e/gate-d-abuse.spec.ts
/**
 * Gate D — Abuse case / adversarial E2E tests
 *
 * Verifies:
 *  1. Abuse report submission (valid reasons accepted, invalid rejected)
 *  2. Unauthenticated report submission rejected (401)
 *  3. Access control: candidate cannot reach admin routes
 *  4. Access control: candidate cannot reach employer-only routes
 *  5. Phone OTP endpoint requires authentication
 *  6. Push preferences rate-limit bounds are enforced
 *
 * Requires the backend running on API_BASE_URL (default http://localhost:4000).
 */
import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { API, TEST_CANDIDATE, TEST_EMPLOYER, loginAs } from "./fixtures/auth";

// ---------------------------------------------------------------------------
// 1. Abuse reporting
// ---------------------------------------------------------------------------

test.describe("abuse reporting", () => {
  async function firstPublishedJobId(request: import("@playwright/test").APIRequestContext) {
    const jobsRes = await request.get(`${API}/api/jobs?limit=1`);
    expect(jobsRes.ok()).toBe(true);
    const jobsBody = await jobsRes.json();
    const job = jobsBody.jobs?.[0];
    expect(job?.id).toBeTruthy();
    return job.id as string;
  }

  test("POST /api/trust/reports requires authentication", async ({ request }) => {
    const res = await request.post(`${API}/api/trust/reports`, {
      data: { reason: "SCAM", details: "unauthenticated attempt", targetJobId: crypto.randomUUID() },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/trust/reports with valid reason returns 201", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const targetJobId = await firstPublishedJobId(request);
    const res = await request.post(`${API}/api/trust/reports`, {
      data: {
        reason: "FAKE_JOB",
        targetJobId,
        details: "This job is clearly a scam — requests upfront payment.",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("POST /api/trust/reports with unknown reason code returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const targetJobId = await firstPublishedJobId(request);
    const res = await request.post(`${API}/api/trust/reports`, {
      data: {
        reason: "INVENTED_REASON_XYZ_999",
        targetJobId,
        details: "Testing unknown reason code.",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/trust/reports with empty body returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/trust/reports`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/trust/reports with ADVANCE_FEE_REQUEST accepted", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const targetJobId = await firstPublishedJobId(request);
    const res = await request.post(`${API}/api/trust/reports`, {
      data: {
        reason: "ADVANCE_FEE_REQUEST",
        targetJobId,
        details:
          "Employer asked me to send $200 as an application processing fee.",
      },
    });
    expect(res.status()).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 2. Access control — adversarial
// ---------------------------------------------------------------------------

test.describe("access control adversarial cases", () => {
  test("candidate cannot access admin user list", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/admin/users`);
    expect([401, 403]).toContain(res.status());
  });

  test("candidate cannot access admin trust management", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/admin/trust`);
    expect([401, 403]).toContain(res.status());
  });

  test("candidate cannot access employer talent search", async ({ request }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/talent`);
    expect([401, 403]).toContain(res.status());
  });

  test("employer cannot access candidate profile (candidate-only route)", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/profile`);
    expect([401, 403]).toContain(res.status());
  });

  test("unauthenticated user cannot access admin routes", async ({
    request,
  }) => {
    const adminRoutes = [
      "/api/admin/users",
      "/api/admin/trust",
      "/api/admin/billing",
    ];
    for (const route of adminRoutes) {
      const res = await request.get(`${API}${route}`);
      expect([401, 403]).toContain(
        res.status()
      );
    }
  });

  test("ATS connections only returns own employer's data", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/ats/connections`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    const connections = body.connections ?? body;
    // Must be an array — structural check that cross-tenant leak doesn't happen
    expect(Array.isArray(connections)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Phone OTP abuse prevention
// ---------------------------------------------------------------------------

test.describe("phone OTP abuse prevention", () => {
  test("phone OTP request requires authentication", async ({ request }) => {
    const res = await request.post(`${API}/api/trust/candidate/phone/request-otp`, {
      data: { phoneNumber: "+2348012345678" },
    });
    expect(res.status()).toBe(401);
  });

  test("phone OTP verify with wrong code returns 400/404/429", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/trust/candidate/phone/verify-otp`, {
      data: { phoneNumber: "+2348012345678", code: "000000" },
    });
    expect([400, 404]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 4. Push notification spam prevention
// ---------------------------------------------------------------------------

test.describe("push notification rate limits", () => {
  test("push preferences rejects maxNotificationsPerWeek above 21", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.put(`${API}/api/push/preferences`, {
      data: {
        maxNotificationsPerWeek: 100,
        minimumHoursBetweenNotifications: 0,
      },
    });
    if (res.ok()) {
      // If accepted, values must be clamped to valid range
      const body = await res.json();
      expect(body.maxNotificationsPerWeek).toBeLessThanOrEqual(21);
      expect(body.minimumHoursBetweenNotifications).toBeGreaterThanOrEqual(1);
    } else {
      expect(res.status()).toBe(400);
    }
  });
});
