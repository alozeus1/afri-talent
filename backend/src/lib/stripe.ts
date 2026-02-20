import Stripe from "stripe";
import { SubscriptionPlan } from "@prisma/client";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_SECRET_KEY must be set in production");
}

export const STRIPE_PRICES: Record<SubscriptionPlan, string | undefined> = {
  FREE: undefined, // No Stripe price for free tier
  BASIC: process.env.STRIPE_PRICE_BASIC_MONTHLY,
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
};

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set — billing features are unavailable");
  }
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
    });
  }
  return _stripe;
}

export function getPlanFromPriceId(priceId: string): SubscriptionPlan {
  for (const [plan, id] of Object.entries(STRIPE_PRICES)) {
    if (id === priceId) return plan as SubscriptionPlan;
  }
  return SubscriptionPlan.FREE;
}
