import { BillingRegion, BillingInterval, SubscriptionPlan } from "@prisma/client";
import prisma from "../prisma.js";
import { DEFAULT_REGIONAL_PRICE_CATALOG } from "./default-price-catalog.js";
import { resolveFlutterwaveCatalogPlanId, resolveStripeCatalogPriceId } from "./provider-catalog.js";

export interface PriceInfo {
  plan: SubscriptionPlan;
  region: BillingRegion;
  interval: BillingInterval;
  currency: string;
  amount: number;
  stripePriceId: string | null;
  flutterwavePlanId: string | null;
  displayAmount: string;
}

function getFallbackRegionalPrice(
  plan: SubscriptionPlan,
  region: BillingRegion,
  interval: BillingInterval,
  currency?: string,
) {
  const normalizedCurrency = currency?.toUpperCase();

  return DEFAULT_REGIONAL_PRICE_CATALOG.find((row) => (
    row.plan === plan
    && row.region === region
    && row.interval === interval
    && (!normalizedCurrency || row.currency === normalizedCurrency)
  )) ?? null;
}

function getFallbackRegionalPrices(region: BillingRegion, currency?: string) {
  const normalizedCurrency = currency?.toUpperCase();

  return DEFAULT_REGIONAL_PRICE_CATALOG.filter((row) => (
    row.region === region
    && (!normalizedCurrency || row.currency === normalizedCurrency)
  ));
}

function toPriceInfo(price: {
  plan: SubscriptionPlan;
  region: BillingRegion;
  interval: BillingInterval;
  currency: string;
  amount: number;
  stripePriceId?: string | null;
}): PriceInfo {
  const stripePriceId = price.stripePriceId ?? resolveStripeCatalogPriceId(
    price.plan,
    price.region,
    price.interval,
    price.currency,
  );

  return {
    plan: price.plan,
    region: price.region,
    interval: price.interval,
    currency: price.currency,
    amount: price.amount,
    stripePriceId,
    flutterwavePlanId: resolveFlutterwaveCatalogPlanId(
      price.plan,
      price.region,
      price.interval,
      price.currency,
    ),
    displayAmount: formatAmount(price.amount, price.currency),
  };
}

/**
 * Get the regional price for a specific plan, region, and interval.
 */
export async function getRegionalPrice(
  plan: SubscriptionPlan,
  region: BillingRegion,
  interval: BillingInterval = BillingInterval.MONTHLY,
  currency?: string,
): Promise<PriceInfo | null> {
  const where: Record<string, unknown> = {
    plan,
    region,
    interval,
    isActive: true,
  };
  if (currency) where.currency = currency.toUpperCase();

  const price = await prisma.regionalPrice.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (price) {
    return toPriceInfo(price);
  }

  const fallback = getFallbackRegionalPrice(plan, region, interval, currency);
  return fallback ? toPriceInfo(fallback) : null;
}

/**
 * Get all prices for a region (for the pricing page).
 */
export async function getRegionalPrices(
  region: BillingRegion,
  currency?: string,
): Promise<PriceInfo[]> {
  const where: Record<string, unknown> = {
    region,
    isActive: true,
  };
  if (currency) where.currency = currency.toUpperCase();

  const prices = await prisma.regionalPrice.findMany({
    where,
    orderBy: [{ plan: "asc" }, { interval: "asc" }],
  });

  if (prices.length > 0) {
    return prices.map((price) => toPriceInfo(price));
  }

  return getFallbackRegionalPrices(region, currency).map((price) => toPriceInfo(price));
}

/**
 * Resolve Stripe Price ID for checkout.
 * For grandfathered users, returns their locked-in price if available.
 */
export async function resolveStripePriceId(
  userId: string,
  plan: SubscriptionPlan,
  interval: BillingInterval = BillingInterval.MONTHLY,
): Promise<{ stripePriceId: string; currency: string; amount: number } | null> {
  const profile = await prisma.userBillingProfile.findUnique({ where: { userId } });

  const region = profile?.region ?? BillingRegion.ROW;
  const currency = profile?.currency ?? "USD";

  // For grandfathered users, check if they have a price at their locked version
  // (future: look up price by pricingVersion)

  const price = await prisma.regionalPrice.findFirst({
    where: {
      plan,
      region,
      interval,
      currency,
      isActive: true,
    },
  });

  const stripePriceId = price?.stripePriceId ?? resolveStripeCatalogPriceId(plan, region, interval, currency);
  const amount = price?.amount ?? getFallbackRegionalPrice(plan, region, interval, currency)?.amount;
  if (!stripePriceId || typeof amount !== "number") {
    return null;
  }

  return {
    stripePriceId,
    currency,
    amount,
  };
}

export async function resolveCheckoutPrice(
  userId: string,
  plan: SubscriptionPlan,
  interval: BillingInterval = BillingInterval.MONTHLY,
): Promise<PriceInfo | null> {
  const profile = await prisma.userBillingProfile.findUnique({ where: { userId } });
  const region = profile?.region ?? BillingRegion.ROW;
  const currency = profile?.currency ?? "USD";
  return getRegionalPrice(plan, region, interval, currency);
}

function formatAmount(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency.toUpperCase()} ${major.toFixed(2)}`;
  }
}
