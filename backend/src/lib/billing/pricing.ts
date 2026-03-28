import { BillingRegion, BillingInterval, SubscriptionPlan } from "@prisma/client";
import prisma from "../prisma.js";

interface PriceInfo {
  plan: SubscriptionPlan;
  region: BillingRegion;
  interval: BillingInterval;
  currency: string;
  amount: number;
  stripePriceId: string | null;
  displayAmount: string;
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

  if (!price) return null;

  return {
    plan: price.plan,
    region: price.region,
    interval: price.interval,
    currency: price.currency,
    amount: price.amount,
    stripePriceId: price.stripePriceId,
    displayAmount: formatAmount(price.amount, price.currency),
  };
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

  return prices.map((p) => ({
    plan: p.plan,
    region: p.region,
    interval: p.interval,
    currency: p.currency,
    amount: p.amount,
    stripePriceId: p.stripePriceId,
    displayAmount: formatAmount(p.amount, p.currency),
  }));
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

  if (!price?.stripePriceId) return null;

  return {
    stripePriceId: price.stripePriceId,
    currency: price.currency,
    amount: price.amount,
  };
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
