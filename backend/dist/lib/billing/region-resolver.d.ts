import { BillingRegion, RegionChangeSource } from "@prisma/client";
interface ResolvedRegion {
    region: BillingRegion;
    country: string | null;
    currency: string;
    source: RegionChangeSource;
    confidence: "high" | "medium" | "low";
}
/**
 * Resolve a user's billing region using the priority chain:
 *  1. Explicit billing profile (user-selected country) — highest confidence
 *  2. Stripe payment country — high confidence
 *  3. IP geolocation — low confidence (soft signal only)
 *  4. Default to ROW
 */
export declare function resolveUserRegion(userId: string, ipCountry?: string | null): Promise<ResolvedRegion>;
/**
 * Set/update a user's billing country and region.
 * Creates an audit trail entry on every change.
 */
export declare function setUserBillingCountry(userId: string, country: string, source: RegionChangeSource, opts?: {
    ipAddress?: string;
    metadata?: Record<string, string>;
}): Promise<void>;
/**
 * Update billing profile with Stripe payment country.
 * Called from webhook when payment method country is detected.
 */
export declare function updateStripeCountry(userId: string, stripeCountry: string): Promise<void>;
export {};
//# sourceMappingURL=region-resolver.d.ts.map