import { describe, it, expect, afterEach } from "vitest";
import { SubscriptionPlan, BillingRegion, BillingInterval } from "@prisma/client";
import { buildCatalogKey } from "../../lib/billing/provider-catalog.js";
import { getPlanFromPriceId } from "../../lib/stripe.js";

// Regression: getPlanFromPriceId used to return FREE for any unrecognized price
// id. Because checkout mints subscriptions on regional/yearly *catalog* price
// ids (absent from the legacy per-price env vars), a later
// customer.subscription.updated webhook mapped a paying customer to FREE and
// silently revoked their entitlements. It must now resolve catalog prices and
// return null (not FREE) for genuinely unknown ids.

const PROF_AFRICA_MONTHLY = buildCatalogKey(
  SubscriptionPlan.PROFESSIONAL,
  BillingRegion.AFRICA,
  BillingInterval.MONTHLY,
  "USD",
);

describe("getPlanFromPriceId", () => {
  const original = process.env.STRIPE_PRICE_CATALOG_JSON;

  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_PRICE_CATALOG_JSON;
    else process.env.STRIPE_PRICE_CATALOG_JSON = original;
  });

  it("resolves a regional catalog price id to its plan (not FREE)", () => {
    process.env.STRIPE_PRICE_CATALOG_JSON = JSON.stringify({
      [PROF_AFRICA_MONTHLY]: "price_catalog_prof_africa",
    });
    expect(getPlanFromPriceId("price_catalog_prof_africa")).toBe(SubscriptionPlan.PROFESSIONAL);
  });

  it("returns null for an unknown price id instead of downgrading to FREE", () => {
    process.env.STRIPE_PRICE_CATALOG_JSON = JSON.stringify({
      [PROF_AFRICA_MONTHLY]: "price_catalog_prof_africa",
    });
    expect(getPlanFromPriceId("price_totally_unknown")).toBeNull();
  });

  it("returns null when no catalog is configured and the id is unknown", () => {
    delete process.env.STRIPE_PRICE_CATALOG_JSON;
    expect(getPlanFromPriceId("price_unknown")).toBeNull();
  });
});
