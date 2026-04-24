import { BillingRegion, BillingInterval, SubscriptionPlan } from "@prisma/client";
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
/**
 * Get the regional price for a specific plan, region, and interval.
 */
export declare function getRegionalPrice(plan: SubscriptionPlan, region: BillingRegion, interval?: BillingInterval, currency?: string): Promise<PriceInfo | null>;
/**
 * Get all prices for a region (for the pricing page).
 */
export declare function getRegionalPrices(region: BillingRegion, currency?: string): Promise<PriceInfo[]>;
/**
 * Resolve Stripe Price ID for checkout.
 * For grandfathered users, returns their locked-in price if available.
 */
export declare function resolveStripePriceId(userId: string, plan: SubscriptionPlan, interval?: BillingInterval): Promise<{
    stripePriceId: string;
    currency: string;
    amount: number;
} | null>;
export declare function resolveCheckoutPrice(userId: string, plan: SubscriptionPlan, interval?: BillingInterval): Promise<PriceInfo | null>;
//# sourceMappingURL=pricing.d.ts.map