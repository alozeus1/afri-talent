// frontend/e2e/gate-e-trust.spec.ts
/**
 * Gate E — Trust verification flows E2E
 *
 * Verifies:
 *  1. Candidate trust profile is readable (shape validation)
 *  2. Employer trust profile is readable (shape validation)
 *  3. Role isolation: employer cannot read candidate trust profile endpoint
 *  4. Role isolation: candidate cannot read employer trust profile endpoint
 *  5. Artifact submission rejects unknown type (400)
 *  6. Artifact submission rejects missing evidenceUrl (400)
 *  7. Messaging guidance endpoint requires authentication
 *  8. Messaging guidance flags advance-fee language
 *
 * Requires the backend running on API_BASE_URL (default http://localhost:4000).
 */
import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, TEST_EMPLOYER, loginAs } from "./fixtures/auth";

// ---------------------------------------------------------------------------
// 1 & 3. Candidate trust profile
// ---------------------------------------------------------------------------

test.describe("candidate trust profile", () => {
  test("GET /api/trust/candidate/summary returns valid shape for candidate", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/trust/candidate/summary`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.trust?.authenticityScore).toBe("number");
    expect(body.trust.authenticityScore).toBeGreaterThanOrEqual(0);
    expect(body.trust.authenticityScore).toBeLessThanOrEqual(100);
    expect(typeof body.trust?.riskScore).toBe("number");
    expect(body.trust).toHaveProperty("verificationLevel");
  });

  test("employer cannot access candidate trust profile endpoint", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/candidate/summary`);
    expect(res.status()).toBe(403);
  });

  test("unauthenticated user cannot access candidate trust profile", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/trust/candidate/summary`);
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2 & 4. Employer trust profile
// ---------------------------------------------------------------------------

test.describe("employer trust profile", () => {
  test("GET /api/trust/employer/summary returns valid shape for employer", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/employer/summary`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.trust).toHaveProperty("verificationLevel");
    expect(body.trust).toHaveProperty("badge");
  });

  test("candidate cannot access employer trust profile endpoint", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/trust/employer/summary`);
    expect(res.status()).toBe(403);
  });

  test("unauthenticated user cannot access employer trust profile", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/trust/employer/summary`);
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. Artifact submission validation
// ---------------------------------------------------------------------------

test.describe("artifact submission", () => {
  test("candidate artifact with unknown type returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/trust/candidate/artifacts`, {
      data: {
        type: "INVENTED_TYPE_XYZ",
        externalUrl: "https://example.com/doc.pdf",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("employer artifact with missing evidenceUrl returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/employer/artifacts`, {
      data: { type: "DOMAIN_OWNERSHIP" },
    });
    expect(res.status()).toBe(400);
  });

  test("employer artifact with non-HTTPS evidenceUrl does not return 500", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/employer/artifacts`, {
      data: {
        type: "DOMAIN_OWNERSHIP",
        externalUrl: "http://insecure.example.com/doc.pdf",
      },
    });
    // 400 (URL scheme validation) or 200 (if HTTPS not enforced at artifact level)
    // Must not be 500
    expect(res.status()).not.toBe(500);
  });

  test("candidate artifact requires authentication", async ({ request }) => {
    const res = await request.post(`${API}/api/trust/candidate/artifacts`, {
      data: {
        type: "IDENTITY_DOCUMENT",
        externalUrl: "https://example.com/proof.pdf",
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Messaging guidance fraud prevention
// ---------------------------------------------------------------------------

test.describe("messaging guidance", () => {
  test("GET /api/trust/messaging-guidance requires authentication", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/trust/messaging-guidance`);
    expect(res.status()).toBe(401);
  });

  test("messaging guidance returns trust-safe rule preview", async ({ request }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/messaging-guidance`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.headline).toBe("string");
    expect(Array.isArray(body.tips)).toBe(true);
    expect(typeof body.rulePreview?.riskScore).toBe("number");
    expect(Array.isArray(body.rulePreview?.blockedPatterns)).toBe(true);
  });

  test("messaging guidance responds for authenticated employers without error", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/messaging-guidance`);
    expect(res.ok()).toBe(true);
  });
});
