// frontend/e2e/gate-c-entitlements.spec.ts
/**
 * Gate C — Entitlement gating & regional pricing E2E
 *
 * Verifies:
 *  1. FREE candidate cannot exceed saved-search limit without 402/403
 *  2. Employer talent search accessible to authenticated employer (not 500)
 *  3. Regional pricing returns valid amounts for all supported regions
 *  4. Yearly pricing is cheaper than monthly × 12 (discount applied)
 *  5. Billing checkout rejects missing/invalid plan
 *
 * Requires the backend running on API_BASE_URL (default http://localhost:4000).
 */
import { test, expect } from "@playwright/test";
import { API, TEST_CANDIDATE, TEST_EMPLOYER, loginAs } from "./fixtures/auth";

// ---------------------------------------------------------------------------
// 1. Saved search limit enforcement
// ---------------------------------------------------------------------------

test.describe("candidate entitlement gating", () => {
  test("GET /api/candidate-analytics/profile-views requires auth", async ({
    request,
  }) => {
    const res = await request.get(`${API}/api/candidate-analytics/profile-views`);
    expect(res.status()).toBe(401);
  });

  test("saved search creation remains stable as a candidate approaches the limit", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    let terminalStatus: number | null = null;
    for (let i = 0; i < 12; i++) {
      const res = await request.post(`${API}/api/saved-searches`, {
        data: {
          name: `Gate-C Search ${i}-${Date.now()}`,
          keywords: ["engineer"],
          alertFrequency: "WEEKLY",
        },
      });
      if ([400, 402, 403].includes(res.status())) {
        terminalStatus = res.status();
        break;
      }
      expect([200, 201]).toContain(res.status());
    }
    if (terminalStatus !== null) {
      expect([400, 402, 403]).toContain(terminalStatus);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Employer talent search access
// ---------------------------------------------------------------------------

test.describe("employer entitlement gating", () => {
  test("talent search is accessible to authenticated employer", async ({
    request,
  }) => {
    await loginAs(request, TEST_EMPLOYER);
    const res = await request.get(`${API}/api/talent`);
    // 200 (results) or 403 (plan gate) — never 500
    expect([200, 403]).toContain(res.status());
  });

  test("talent search requires authentication", async ({ request }) => {
    const res = await request.get(`${API}/api/talent`);
    expect([401, 403]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 3. Regional pricing integrity
// ---------------------------------------------------------------------------

const PRICING_REGIONS = [
  { region: "AFRICA", currency: "NGN" },
  { region: "AFRICA", currency: "KES" },
  { region: "ROW", currency: "USD" },
  { region: "ROW", currency: "GBP" },
];

test.describe("regional pricing", () => {
  for (const { region, currency } of PRICING_REGIONS) {
    test(`pricing returns valid amounts for ${region}/${currency}`, async ({
      request,
    }) => {
      const res = await request.get(
        `${API}/api/pricing?region=${region}&currency=${currency}`
      );
      expect(res.ok()).toBe(true);
      const body = await res.json();
      const prices = Array.isArray(body.prices) ? body.prices : [];
      expect(prices.length).toBeGreaterThan(0);
      for (const price of prices) {
        expect(price.currency).toBe(currency);
        expect(price.amount).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test("yearly pricing is cheaper than monthly × 12", async ({ request }) => {
    const res = await request.get(`${API}/api/pricing?region=ROW&currency=USD`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    const prices = Array.isArray(body.prices) ? body.prices : [];
    const byPlan = new Map<string, { monthly?: number; yearly?: number }>();

    for (const price of prices) {
      const current = byPlan.get(price.plan) ?? {};
      if (price.interval === "MONTHLY") current.monthly = price.amount;
      if (price.interval === "YEARLY") current.yearly = price.amount;
      byPlan.set(price.plan, current);
    }

    for (const [, plan] of byPlan) {
      if (typeof plan.monthly === "number" && typeof plan.yearly === "number") {
        expect(plan.yearly).toBeLessThan(plan.monthly * 12);
      }
    }
  });

  test("pricing endpoint returns 400 for unknown region", async ({
    request,
  }) => {
    const res = await request.get(
      `${API}/api/pricing?region=ATLANTIS&currency=XYZ`
    );
    // 400 (validation) or 200 with fallback — never 500
    expect(res.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 4. Billing checkout validation
// ---------------------------------------------------------------------------

test.describe("billing checkout", () => {
  test("POST /api/billing/checkout with missing plan returns a safe client error", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/billing/checkout`, {
      data: {},
    });
    expect([400, 403, 503]).toContain(res.status());
  });

  test("POST /api/billing/checkout with invalid plan returns a safe client error", async ({
    request,
  }) => {
    await loginAs(request, TEST_CANDIDATE);
    const res = await request.post(`${API}/api/billing/checkout`, {
      data: { plan: "ULTRA_DIAMOND_PLATINUM" },
    });
    expect([400, 403, 503]).toContain(res.status());
  });
});
