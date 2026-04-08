import { BillingProvider, BillingRegion } from "@prisma/client";
export interface CheckoutProviderDecision {
    provider: BillingProvider;
    reason: "nigeria_flutterwave" | "default_stripe" | "flutterwave_fallback";
}
export declare function isAnyBillingProviderConfigured(): boolean;
export declare function resolveCheckoutProvider(input: {
    country: string | null;
    region: BillingRegion;
}): CheckoutProviderDecision | null;
export declare function providerSupportsPortal(provider: BillingProvider | null | undefined): boolean;
//# sourceMappingURL=providers.d.ts.map