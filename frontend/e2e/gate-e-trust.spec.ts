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
  test("GET /api/trust/candidate-profile returns valid shape for candidate", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/trust/candidate-profile`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.authenticityScore).toBe("number");
    expect(body.authenticityScore).toBeGreaterThanOrEqual(0);
    expect(body.authenticityScore).toBeLessThanOrEqual(100);
    expect(typeof body.fraudRiskScore).toBe("number");
    expect(body).toHaveProperty("verificationLevel");
  });

  test("employer cannot access candidate trust profile endpoint", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/candidate-profile`);
    expect([401, 403]).toContain(res.status());
  });

  test("unauthenticated user cannot access candidate trust profile", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/trust/candidate-profile`);
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2 & 4. Employer trust profile
// ---------------------------------------------------------------------------

test.describe("employer trust profile", () => {
  test("GET /api/trust/employer-profile returns valid shape for employer", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/trust/employer-profile`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("verificationTier");
    expect(body).toHaveProperty("badgeStatus");
  });

  test("candidate cannot access employer trust profile endpoint", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.get(`${API}/api/trust/employer-profile`);
    expect([401, 403]).toContain(res.status());
  });

  test("unauthenticated user cannot access employer trust profile", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/trust/employer-profile`);
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
    const res = await request.post(`${API}/api/trust/candidate-artifact`, {
      data: {
        artifactType: "INVENTED_TYPE_XYZ",
        evidenceUrl: "https://example.com/doc.pdf",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("employer artifact with missing evidenceUrl returns 400", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/employer-artifact`, {
      data: { artifactType: "DOMAIN_OWNERSHIP" },
    });
    expect(res.status()).toBe(400);
  });

  test("employer artifact with non-HTTPS evidenceUrl does not return 500", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/employer-artifact`, {
      data: {
        artifactType: "DOMAIN_OWNERSHIP",
        evidenceUrl: "http://insecure.example.com/doc.pdf",
      },
    });
    // 400 (URL scheme validation) or 200 (if HTTPS not enforced at artifact level)
    // Must not be 500
    expect(res.status()).not.toBe(500);
  });

  test("candidate artifact requires authentication", async ({ request }) => {
    const res = await request.post(`${API}/api/trust/candidate-artifact`, {
      data: {
        artifactType: "EMAIL_VERIFICATION",
        evidenceUrl: "https://example.com/proof.pdf",
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Messaging guidance fraud prevention
// ---------------------------------------------------------------------------

test.describe("messaging guidance", () => {
  test("POST /api/trust/messaging-guidance requires authentication", async ({
    request,
  }) => {
    const res = await request.post(`${API}/api/trust/messaging-guidance`, {
      data: {
        messageContent: "Please send $50 to activate your application.",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("messaging guidance flags advance-fee language", async ({ request }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/messaging-guidance`, {
      data: {
        messageContent:
          "To proceed with your application, please send $200 as a processing fee before we can review your CV.",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    // At least one of these fields must be truthy to indicate the flag
    const isFlagged =
      body.flagged === true ||
      body.riskLevel === "HIGH" ||
      body.riskLevel === "MEDIUM" ||
      typeof body.warning === "string";
    expect(isFlagged).toBe(true);
  });

  test("messaging guidance passes clean professional message", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.post(`${API}/api/trust/messaging-guidance`, {
      data: {
        messageContent:
          "Hi, we reviewed your application and would like to schedule a 30-minute interview next week. Please confirm your availability.",
      },
    });
    expect(res.ok()).toBe(true);
    // Must not 500 on legitimate content
  });
});
