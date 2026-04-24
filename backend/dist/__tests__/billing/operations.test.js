import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingDiscrepancyType, BillingEventOutcome, BillingReconciliationStatus, SubscriptionPlan, SubscriptionStatus, } from "@prisma/client";
const mockEntitlements = {
    plan: SubscriptionPlan.BASIC,
    applicationsPerMonth: null,
    aiResumeReviews: 10,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: null,
    jobAlerts: true,
    prioritySupport: false,
    skillsAssessments: false,
    chatAccess: true,
    autopilot: false,
    jobPostsPerMonth: null,
    talentSearch: false,
    analytics: false,
    apiAccess: false,
    atsIntegrations: null,
    videoMockInterviews: 5,
    pipelineExports: false,
    brandedCareerPage: false,
    advancedFunnelMetrics: false,
};
const { prismaMock, getEntitlementsMock, getStripeMock, isStripeConfiguredMock, getPlanFromPriceIdMock, recordOpsEventMock, recordOpsSnapshotMetricMock, } = vi.hoisted(() => {
    const prismaMock = {
        subscription: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        userBillingProfile: {
            findUnique: vi.fn(),
        },
        billingEntitlementState: {
            findUnique: vi.fn(),
            upsert: vi.fn(),
        },
        billingEventAudit: {
            create: vi.fn(),
            count: vi.fn(),
        },
        billingDiscrepancy: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
            updateMany: vi.fn(),
        },
        billingSupportAction: {
            create: vi.fn(),
        },
        billingReconciliationRun: {
            create: vi.fn(),
            update: vi.fn(),
        },
        regionConfig: {
            findUnique: vi.fn(),
        },
    };
    return {
        prismaMock,
        getEntitlementsMock: vi.fn(),
        getStripeMock: vi.fn(),
        isStripeConfiguredMock: vi.fn(),
        getPlanFromPriceIdMock: vi.fn(),
        recordOpsEventMock: vi.fn(),
        recordOpsSnapshotMetricMock: vi.fn(),
    };
});
vi.mock("../../lib/prisma.js", () => ({
    default: prismaMock,
}));
vi.mock("../../lib/billing/entitlements.js", () => ({
    getEntitlements: getEntitlementsMock,
}));
vi.mock("../../lib/stripe.js", () => ({
    getStripe: getStripeMock,
    isStripeConfigured: isStripeConfiguredMock,
    getPlanFromPriceId: getPlanFromPriceIdMock,
}));
vi.mock("../../lib/ops/events.js", () => ({
    recordOpsEvent: recordOpsEventMock,
    recordOpsSnapshotMetric: recordOpsSnapshotMetricMock,
}));
import { runBillingReconciliationCycle, syncBillingEntitlementState, validateBillingEntitlementState, validateCheckoutSafety, } from "../../lib/billing/operations.js";
describe("billing operations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getEntitlementsMock.mockResolvedValue(mockEntitlements);
        getStripeMock.mockReturnValue({
            subscriptions: {
                retrieve: vi.fn(),
            },
        });
        getPlanFromPriceIdMock.mockReturnValue(SubscriptionPlan.BASIC);
        isStripeConfiguredMock.mockReturnValue(false);
        prismaMock.billingEventAudit.create.mockResolvedValue({ id: "audit-1" });
        prismaMock.billingDiscrepancy.findFirst.mockResolvedValue(null);
        prismaMock.billingDiscrepancy.create.mockResolvedValue({ id: "disc-1" });
        prismaMock.billingDiscrepancy.update.mockResolvedValue({ id: "disc-1" });
        prismaMock.billingDiscrepancy.updateMany.mockResolvedValue({ count: 1 });
        prismaMock.billingSupportAction.create.mockResolvedValue({ id: "support-1" });
        prismaMock.billingReconciliationRun.create.mockResolvedValue({ id: "run-1" });
        prismaMock.billingReconciliationRun.update.mockResolvedValue({ id: "run-1" });
        prismaMock.regionConfig.findUnique.mockResolvedValue({ currencies: ["USD", "EUR"] });
        prismaMock.billingEventAudit.count.mockResolvedValue(0);
        prismaMock.billingDiscrepancy.count.mockResolvedValue(0);
    });
    it("marks entitlement state as stale when no snapshot exists", async () => {
        prismaMock.subscription.findUnique.mockResolvedValue({
            id: "sub-1",
            plan: SubscriptionPlan.BASIC,
            status: SubscriptionStatus.ACTIVE,
        });
        prismaMock.userBillingProfile.findUnique.mockResolvedValue({
            region: "EUROPE",
            currency: "EUR",
            pricingVersion: 3,
            isGrandfathered: false,
            country: "DE",
            stripeCountry: "DE",
        });
        prismaMock.billingEntitlementState.findUnique.mockResolvedValue(null);
        const result = await validateBillingEntitlementState("user-1");
        expect(result.isStale).toBe(true);
        expect(result.reasons).toContain("missing_state");
        expect(result.expected.effectivePlan).toBe(SubscriptionPlan.BASIC);
        expect(result.expected.billingRegion).toBe("EUROPE");
    });
    it("syncs entitlement state and opens a stale entitlement discrepancy when needed", async () => {
        prismaMock.subscription.findUnique.mockResolvedValue({
            id: "sub-1",
            plan: SubscriptionPlan.BASIC,
            status: SubscriptionStatus.ACTIVE,
        });
        prismaMock.userBillingProfile.findUnique.mockResolvedValue({
            region: "ROW",
            currency: "USD",
            pricingVersion: 1,
            isGrandfathered: false,
            country: "US",
            stripeCountry: "US",
        });
        prismaMock.billingEntitlementState.findUnique.mockResolvedValue({
            id: "state-1",
            effectivePlan: SubscriptionPlan.FREE,
            effectiveStatus: SubscriptionStatus.INACTIVE,
            checksum: "old-checksum",
            billingRegion: "ROW",
            currency: "USD",
            pricingVersion: 1,
        });
        prismaMock.billingEntitlementState.upsert.mockResolvedValue({
            id: "state-1",
            effectivePlan: SubscriptionPlan.BASIC,
            effectiveStatus: SubscriptionStatus.ACTIVE,
            checksum: "new-checksum",
        });
        const result = await syncBillingEntitlementState("user-1", "test");
        expect(result.validation.isStale).toBe(true);
        expect(prismaMock.billingEntitlementState.upsert).toHaveBeenCalled();
        expect(prismaMock.billingDiscrepancy.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: BillingDiscrepancyType.STALE_ENTITLEMENT,
            }),
        }));
        expect(prismaMock.billingEventAudit.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                outcome: BillingEventOutcome.PROCESSED,
            }),
        }));
    });
    it("blocks checkout when billing country and verified payment country differ", async () => {
        prismaMock.userBillingProfile.findUnique.mockResolvedValue({
            id: "profile-1",
            country: "NG",
            region: "AFRICA",
            currency: "USD",
            isGrandfathered: false,
            pricingVersion: 1,
            stripeCountry: "DE",
        });
        prismaMock.regionConfig.findUnique.mockResolvedValue({ currencies: ["USD"] });
        const result = await validateCheckoutSafety("user-1");
        expect(result.allowed).toBe(false);
        expect(result.code).toBe("billing_country_payment_country_mismatch");
        expect(prismaMock.billingDiscrepancy.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: BillingDiscrepancyType.REGION_MISMATCH,
            }),
        }));
    });
    it("creates a partial reconciliation result for past-due paid subscriptions", async () => {
        prismaMock.subscription.findMany.mockResolvedValue([
            {
                id: "sub-1",
                userId: "user-1",
                plan: SubscriptionPlan.BASIC,
                status: SubscriptionStatus.PAST_DUE,
                stripeSubId: "stripe-sub-1",
            },
        ]);
        prismaMock.subscription.findUnique.mockResolvedValue({
            id: "sub-1",
            plan: SubscriptionPlan.BASIC,
            status: SubscriptionStatus.PAST_DUE,
        });
        prismaMock.userBillingProfile.findUnique.mockResolvedValue({
            region: "ROW",
            currency: "USD",
            pricingVersion: 1,
            isGrandfathered: false,
            country: "US",
            stripeCountry: "US",
        });
        prismaMock.billingEntitlementState.findUnique.mockResolvedValue({
            id: "state-1",
            effectivePlan: SubscriptionPlan.BASIC,
            effectiveStatus: SubscriptionStatus.PAST_DUE,
            checksum: "checksum",
            billingRegion: "ROW",
            currency: "USD",
            pricingVersion: 1,
        });
        prismaMock.billingEntitlementState.upsert.mockResolvedValue({
            id: "state-1",
            effectivePlan: SubscriptionPlan.BASIC,
            effectiveStatus: SubscriptionStatus.PAST_DUE,
            checksum: "checksum",
        });
        prismaMock.billingEventAudit.count
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(1);
        prismaMock.billingDiscrepancy.count
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0);
        const result = await runBillingReconciliationCycle("test");
        expect(result.status).toBe(BillingReconciliationStatus.PARTIAL);
        expect(result.unpaidEntitlements).toBe(1);
        expect(prismaMock.billingReconciliationRun.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: BillingReconciliationStatus.PARTIAL,
                checkedSubscriptions: 1,
                unpaidEntitlements: 1,
            }),
        }));
    });
});
//# sourceMappingURL=operations.test.js.map