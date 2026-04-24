import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";
export declare function buildCatalogKey(plan: SubscriptionPlan, region: BillingRegion, interval: BillingInterval, currency: string): string;
export declare function resolveStripeCatalogPriceId(plan: SubscriptionPlan, region: BillingRegion, interval: BillingInterval, currency: string): string | null;
export declare function resolveFlutterwaveCatalogPlanId(plan: SubscriptionPlan, region: BillingRegion, interval: BillingInterval, currency: string): string | null;
//# sourceMappingURL=provider-catalog.d.ts.map