import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";
export interface DefaultRegionalPriceRow {
    plan: SubscriptionPlan;
    region: BillingRegion;
    interval: BillingInterval;
    currency: string;
    amount: number;
}
export declare const DEFAULT_REGIONAL_PRICE_CATALOG: DefaultRegionalPriceRow[];
//# sourceMappingURL=default-price-catalog.d.ts.map