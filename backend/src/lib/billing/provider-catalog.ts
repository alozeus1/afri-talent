import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";
import { z } from "zod/v4";
import { DEFAULT_REGIONAL_PRICE_CATALOG } from "./default-price-catalog.js";

type CatalogMap = Record<string, string>;

const LEGACY_PLAN_KEYS: Record<string, SubscriptionPlan> = {
  afritalent_basic: SubscriptionPlan.BASIC,
  afritalent_professional: SubscriptionPlan.PROFESSIONAL,
  afritalent_employer_basic: SubscriptionPlan.EMPLOYER_BASIC,
  afritalent_employer_premium: SubscriptionPlan.EMPLOYER_PREMIUM,
};

const LEGACY_INTERVAL_KEYS: Record<string, BillingInterval> = {
  monthly: BillingInterval.MONTHLY,
  yearly: BillingInterval.YEARLY,
};

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchingRegions(plan: SubscriptionPlan, interval: BillingInterval, currency: string): BillingRegion[] {
  return DEFAULT_REGIONAL_PRICE_CATALOG
    .filter((row) => row.plan === plan && row.interval === interval && row.currency === currency)
    .map((row) => row.region);
}

function normalizeLegacyCatalog(parsed: Record<string, unknown>, label: string): CatalogMap | null {
  const entries = Object.entries(parsed);
  const hasLegacyShape = entries.some(([key, value]) => key in LEGACY_PLAN_KEYS || isPlainObject(value) && "prices" in value);
  if (!hasLegacyShape) {
    return null;
  }

  const normalized: CatalogMap = {};

  for (const [legacyPlanKey, planPayload] of entries) {
    const plan = LEGACY_PLAN_KEYS[legacyPlanKey];
    if (!plan) {
      throw new Error(`${label} failed validation: ${legacyPlanKey}: unknown legacy catalog plan key`);
    }

    if (!isPlainObject(planPayload) || !isPlainObject(planPayload.prices)) {
      throw new Error(`${label} failed validation: ${legacyPlanKey}: legacy catalog entry must include prices`);
    }

    for (const [currencyKey, intervalPayload] of Object.entries(planPayload.prices)) {
      const currency = currencyKey.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw new Error(`${label} failed validation: ${legacyPlanKey}.${currencyKey}: currency must be 3 letters`);
      }

      if (!isPlainObject(intervalPayload)) {
        throw new Error(`${label} failed validation: ${legacyPlanKey}.${currencyKey}: prices must be an object`);
      }

      for (const [legacyIntervalKey, providerId] of Object.entries(intervalPayload)) {
        if (legacyIntervalKey.startsWith("discount_")) {
          continue;
        }

        const interval = LEGACY_INTERVAL_KEYS[legacyIntervalKey];
        if (!interval) {
          throw new Error(`${label} failed validation: ${legacyPlanKey}.${currencyKey}.${legacyIntervalKey}: unknown legacy interval key`);
        }

        if (typeof providerId !== "string" || providerId.trim() === "") {
          throw new Error(`${label} failed validation: ${legacyPlanKey}.${currencyKey}.${legacyIntervalKey}: provider id must be non-empty`);
        }

        const regions = matchingRegions(plan, interval, currency);
        if (regions.length === 0) {
          throw new Error(`${label} failed validation: ${legacyPlanKey}.${currencyKey}.${legacyIntervalKey}: no regional price exists for ${currency}`);
        }

        for (const region of regions) {
          normalized[buildCatalogKey(plan, region, interval, currency)] = providerId.trim();
        }
      }
    }
  }

  return normalized;
}

function normalizeCatalogPayload(parsed: unknown, label: string): unknown {
  if (!isPlainObject(parsed)) {
    return parsed;
  }

  return normalizeLegacyCatalog(parsed, label) ?? parsed;
}

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

  const result = catalogSchema.safeParse(normalizeCatalogPayload(parsed, label));
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
    if (!isPlainObject(parsed)) {
      return {};
    }

    const normalizedLegacy = normalizeLegacyCatalog(parsed, "CATALOG_JSON");
    if (normalizedLegacy) {
      return normalizedLegacy;
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
