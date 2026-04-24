import { SubscriptionPlan } from "@prisma/client";
export interface FlutterwaveCheckoutInput {
    txRef: string;
    amountMinor: number;
    currency: string;
    customer: {
        email: string;
        name: string | null;
    };
    redirectUrl: string;
    plan: SubscriptionPlan;
    interval: "MONTHLY" | "YEARLY";
    paymentPlanId: string;
    meta?: Record<string, unknown>;
}
export interface FlutterwaveCheckoutResponse {
    link: string;
}
export interface FlutterwaveVerifiedTransaction {
    id: number;
    tx_ref: string;
    flw_ref?: string;
    amount: number;
    currency: string;
    status: string;
    payment_type?: string;
    customer?: {
        id?: number;
        email?: string;
        name?: string;
    };
    card?: {
        country?: string;
        type?: string;
        last_4digits?: string;
    };
    meta?: Record<string, unknown> | null;
}
export declare function isFlutterwaveConfigured(): boolean;
export declare function getFlutterwaveSecretHash(): string;
export declare function getFlutterwavePublicKey(): string;
export declare function createFlutterwaveCheckout(input: FlutterwaveCheckoutInput): Promise<FlutterwaveCheckoutResponse>;
export declare function verifyFlutterwaveTransaction(transactionId: number): Promise<FlutterwaveVerifiedTransaction>;
//# sourceMappingURL=flutterwave.d.ts.map