import { BillingDiscrepancyType, BillingEventOutcome, BillingReconciliationStatus, BillingSupportActionType, Prisma, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { type Entitlements } from "./entitlements.js";
type JsonRecord = Record<string, unknown>;
export interface BillingEventInput {
    userId?: string | null;
    subscriptionId?: string | null;
    eventId?: string | null;
    source: string;
    eventType: string;
    outcome?: BillingEventOutcome;
    plan?: SubscriptionPlan | null;
    status?: SubscriptionStatus | null;
    billingRegion?: "AFRICA" | "EUROPE" | "ROW" | null;
    currency?: string | null;
    amountMinor?: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeInvoiceId?: string | null;
    stripePaymentIntentId?: string | null;
    stripeChargeId?: string | null;
    stripeRefundId?: string | null;
    reasonCode?: string | null;
    message?: string | null;
    metadata?: JsonRecord | null;
    rawPayload?: Prisma.InputJsonValue;
    occurredAt?: Date;
    processedAt?: Date | null;
}
interface BillingExpectation {
    userId: string;
    subscriptionId: string | null;
    subscriptionPlan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    effectivePlan: SubscriptionPlan;
    effectiveStatus: SubscriptionStatus;
    billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
    currency: string | null;
    pricingVersion: number | null;
    entitlements: Entitlements;
    checksum: string;
    isGrandfathered: boolean;
    profileCountry: string | null;
    stripeCountry: string | null;
}
export interface BillingStateValidation {
    currentState: {
        id: string;
        effectivePlan: SubscriptionPlan;
        effectiveStatus: SubscriptionStatus;
        checksum: string;
        billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
        currency: string | null;
        pricingVersion: number | null;
    } | null;
    expected: BillingExpectation;
    reasons: string[];
    isStale: boolean;
}
export interface BillingDiscrepancyInput {
    userId?: string | null;
    subscriptionId?: string | null;
    billingEventId?: string | null;
    reconciliationRunId?: string | null;
    type: BillingDiscrepancyType;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    reasonCode?: string | null;
    details?: JsonRecord | null;
    dueAt?: Date | null;
}
interface BillingReconciliationResult {
    runId: string;
    status: BillingReconciliationStatus;
    checkedSubscriptions: number;
    successPayments: number;
    failedPayments: number;
    webhookFailures: number;
    subscriptionMismatches: number;
    unpaidEntitlements: number;
    paidNotEntitled: number;
    pendingRefunds: number;
}
export declare function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus;
export declare function validateBillingEntitlementState(userId: string): Promise<BillingStateValidation>;
export declare function recordBillingEvent(input: BillingEventInput): Promise<{
    message: string | null;
    id: string;
    userId: string | null;
    currency: string | null;
    createdAt: Date;
    source: string;
    plan: import(".prisma/client").$Enums.SubscriptionPlan | null;
    status: import(".prisma/client").$Enums.SubscriptionStatus | null;
    stripeCustomerId: string | null;
    metadata: Prisma.JsonValue | null;
    subscriptionId: string | null;
    billingRegion: import(".prisma/client").$Enums.BillingRegion | null;
    eventId: string | null;
    eventType: string;
    outcome: import(".prisma/client").$Enums.BillingEventOutcome;
    amountMinor: number | null;
    stripeSubscriptionId: string | null;
    stripeInvoiceId: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    stripeRefundId: string | null;
    reasonCode: string | null;
    rawPayload: Prisma.JsonValue | null;
    occurredAt: Date;
    processedAt: Date | null;
}>;
export declare function upsertBillingDiscrepancy(input: BillingDiscrepancyInput): Promise<{
    type: import(".prisma/client").$Enums.BillingDiscrepancyType;
    id: string;
    userId: string | null;
    updatedAt: Date;
    status: import(".prisma/client").$Enums.BillingDiscrepancyStatus;
    details: Prisma.JsonValue | null;
    subscriptionId: string | null;
    reasonCode: string | null;
    billingEventId: string | null;
    reconciliationRunId: string | null;
    severity: string;
    title: string;
    dueAt: Date | null;
    detectedAt: Date;
    lastSeenAt: Date;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
}>;
export declare function resolveBillingDiscrepancy(discrepancyId: string): Promise<{
    type: import(".prisma/client").$Enums.BillingDiscrepancyType;
    id: string;
    userId: string | null;
    updatedAt: Date;
    status: import(".prisma/client").$Enums.BillingDiscrepancyStatus;
    details: Prisma.JsonValue | null;
    subscriptionId: string | null;
    reasonCode: string | null;
    billingEventId: string | null;
    reconciliationRunId: string | null;
    severity: string;
    title: string;
    dueAt: Date | null;
    detectedAt: Date;
    lastSeenAt: Date;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
}>;
export declare function syncBillingEntitlementState(userId: string, source?: string): Promise<{
    state: {
        id: string;
        userId: string;
        currency: string | null;
        pricingVersion: number | null;
        createdAt: Date;
        updatedAt: Date;
        source: string;
        effectivePlan: import(".prisma/client").$Enums.SubscriptionPlan;
        effectiveStatus: import(".prisma/client").$Enums.SubscriptionStatus;
        entitlements: Prisma.JsonValue;
        subscriptionId: string | null;
        billingRegion: import(".prisma/client").$Enums.BillingRegion | null;
        checksum: string;
        isInSync: boolean;
        mismatchReason: string | null;
        lastSyncedAt: Date;
        lastValidatedAt: Date | null;
    };
    validation: BillingStateValidation;
}>;
export declare function createBillingSupportAction(input: {
    actorId: string;
    userId: string;
    subscriptionId?: string | null;
    billingEventId?: string | null;
    discrepancyId?: string | null;
    actionType: BillingSupportActionType;
    reasonCode: string;
    notes?: string | null;
    metadata?: JsonRecord | null;
}): Promise<{
    id: string;
    userId: string;
    createdAt: Date;
    metadata: Prisma.JsonValue | null;
    subscriptionId: string | null;
    reasonCode: string;
    billingEventId: string | null;
    actorId: string;
    discrepancyId: string | null;
    actionType: import(".prisma/client").$Enums.BillingSupportActionType;
    notes: string | null;
}>;
export declare function validateCheckoutSafety(userId: string): Promise<{
    allowed: boolean;
    profile: null;
    code?: undefined;
    message?: undefined;
} | {
    allowed: boolean;
    profile: {
        id: string;
        country: string | null;
        region: import(".prisma/client").$Enums.BillingRegion;
        currency: string;
        pricingVersion: number;
        isGrandfathered: boolean;
        stripeCountry: string | null;
    };
    code: string;
    message: string;
} | {
    allowed: boolean;
    profile: {
        id: string;
        country: string | null;
        region: import(".prisma/client").$Enums.BillingRegion;
        currency: string;
        pricingVersion: number;
        isGrandfathered: boolean;
        stripeCountry: string | null;
    };
    code?: undefined;
    message?: undefined;
}>;
export declare function runBillingReconciliationCycle(triggeredBy?: string): Promise<BillingReconciliationResult>;
export {};
//# sourceMappingURL=operations.d.ts.map