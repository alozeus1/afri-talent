import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";

type CatalogMap = Record<string, string>;

function parseCatalogEnv(value: string | undefined): CatalogMap {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
    );
  } catch {
    return {};
  }
}

export function buildCatalogKey(
  plan: SubscriptionPlan,
  region: BillingRegion,
  interval: BillingInterval,
  currency: string,
): string {
  return [plan, region, interval, currency.toUpperCase()].join(":");
}

export function resolveStripeCatalogPriceId(
  plan: SubscriptionPlan,
  region: BillingRegion,
  interval: BillingInterval,
  currency: string,
): string | null {
  const catalog = parseCatalogEnv(process.env.STRIPE_PRICE_CATALOG_JSON);
  return catalog[buildCatalogKey(plan, region, interval, currency)] ?? null;
}

export function resolveFlutterwaveCatalogPlanId(
  plan: SubscriptionPlan,
  region: BillingRegion,
  interval: BillingInterval,
  currency: string,
): string | null {
  const catalog = parseCatalogEnv(process.env.FLUTTERWAVE_PLAN_CATALOG_JSON);
  return catalog[buildCatalogKey(plan, region, interval, currency)] ?? null;
}
