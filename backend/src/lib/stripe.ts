import Stripe from "stripe";
import { SubscriptionPlan } from "@prisma/client";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() || "";

export const STRIPE_PRICES: Record<SubscriptionPlan, string | undefined> = {
  FREE: undefined,
  BASIC: process.env.STRIPE_PRICE_BASIC_MONTHLY,
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
  EMPLOYER_FREE: undefined,
  EMPLOYER_BASIC: process.env.STRIPE_PRICE_EMPLOYER_BASIC_MONTHLY,
  EMPLOYER_PREMIUM: process.env.STRIPE_PRICE_EMPLOYER_PREMIUM_MONTHLY,
};

let _stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.length > 0;
}

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_SECRET_KEY is not set - billing features are unavailable");
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
