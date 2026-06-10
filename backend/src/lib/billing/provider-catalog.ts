import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";
import { z } from "zod/v4";

type CatalogMap = Record<string, string>;

// Keys must be "<PLAN>:<REGION>:<INTERVAL>:<CURRENCY>" built by
// buildCatalogKey(); values are the provider price/plan ids.
const CATALOG_KEY_PATTERN = new RegExp(
  `^(${Object.values(SubscriptionPlan).join("|")}):` +
  `(${Object.values(BillingRegion).join("|")}):` +
  `(${Object.values(BillingInterval).join("|")}):` +
  `[A-Z]{3}$`,
);

const catalogSchema = z.record(
  z.string().regex(CATALOG_KEY_PATTERN, "catalog key must be PLAN:REGION:INTERVAL:CURRENCY"),
  z.string().trim().min(1, "catalog values must be non-empty provider ids"),
);

/**
 * Strictly parse a catalog env value. Throws on malformed JSON, non-object
 * payloads, unknown plan/region/interval keys, or empty values — used by
 * startup validation so a bad deploy fails fast instead of silently breaking
 * checkout at runtime (M5).
 */
export function parseCatalogStrict(value: string | undefined, label: string): CatalogMap {
  if (!value?.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const result = catalogSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${label} failed validation: ${issues}`);
  }

  return result.data;
}

/**
 * Startup validation for both provider catalogs. Call from
 * validateRuntimeEnv(); throws when a configured catalog is malformed.
 * Unset catalogs are allowed — price resolution falls back to the
 * per-price-id env variables.
 */
export function validatePriceCatalogEnv(): void {
  parseCatalogStrict(process.env.STRIPE_PRICE_CATALOG_JSON, "STRIPE_PRICE_CATALOG_JSON");
  parseCatalogStrict(process.env.FLUTTERWAVE_PLAN_CATALOG_JSON, "FLUTTERWAVE_PLAN_CATALOG_JSON");
}

// Lenient runtime parse: startup validation already guarantees integrity in
// production/staging; this guards against exotic runtime env mutation without
// crashing the request path.
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
