import { BillingProvider, BillingRegion } from "@prisma/client";
import { isStripeConfigured } from "../stripe.js";
import { isFlutterwaveConfigured } from "../flutterwave.js";

export interface CheckoutProviderDecision {
  provider: BillingProvider;
  reason: "nigeria_flutterwave" | "default_stripe" | "flutterwave_fallback";
}

export function isAnyBillingProviderConfigured(): boolean {
  return isStripeConfigured() || isFlutterwaveConfigured();
}

export function resolveCheckoutProvider(input: {
  country: string | null;
  region: BillingRegion;
}): CheckoutProviderDecision | null {
  const country = input.country?.toUpperCase() ?? null;

  if (country === "NG" && isFlutterwaveConfigured()) {
    return {
      provider: BillingProvider.FLUTTERWAVE,
      reason: "nigeria_flutterwave",
    };
  }

  if (isStripeConfigured()) {
    return {
      provider: BillingProvider.STRIPE,
      reason: "default_stripe",
    };
  }

  if (isFlutterwaveConfigured()) {
    return {
      provider: BillingProvider.FLUTTERWAVE,
      reason: "flutterwave_fallback",
    };
  }

  return null;
}

export function providerSupportsPortal(provider: BillingProvider | null | undefined): boolean {
  return provider === BillingProvider.STRIPE;
}
