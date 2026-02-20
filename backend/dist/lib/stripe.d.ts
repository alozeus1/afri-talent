import Stripe from "stripe";
import { SubscriptionPlan } from "@prisma/client";
export declare const STRIPE_PRICES: Record<SubscriptionPlan, string | undefined>;
export declare function getStripe(): Stripe;
export declare function getPlanFromPriceId(priceId: string): SubscriptionPlan;
//# sourceMappingURL=stripe.d.ts.map