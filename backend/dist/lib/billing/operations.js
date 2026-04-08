import crypto from "node:crypto";
import { BillingDiscrepancyStatus, BillingDiscrepancyType, BillingEventOutcome, BillingReconciliationStatus, SubscriptionPlan, SubscriptionStatus, } from "@prisma/client";
import prisma from "../prisma.js";
import { getStripe, getPlanFromPriceId, isStripeConfigured } from "../stripe.js";
import { recordOpsEvent, recordOpsSnapshotMetric } from "../ops/events.js";
import { getEntitlements } from "./entitlements.js";
import { countryToRegion } from "./regions.js";
const SUCCESSFUL_PAYMENT_EVENTS = ["invoice.paid", "invoice.payment_succeeded"];
const FAILED_PAYMENT_EVENTS = ["invoice.payment_failed"];
function stableJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableJson(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function hashEntitlements(value) {
    return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}
export function mapStripeSubscriptionStatus(stripeStatus) {
    switch (stripeStatus) {
        case "active":
        case "trialing":
            return SubscriptionStatus.ACTIVE;
        case "past_due":
            return SubscriptionStatus.PAST_DUE;
        case "canceled":
        case "unpaid":
            return SubscriptionStatus.CANCELLED;
        default:
            return SubscriptionStatus.INACTIVE;
    }
}
function isPaidPlan(plan) {
    return plan !== SubscriptionPlan.FREE && plan !== SubscriptionPlan.EMPLOYER_FREE;
}
function isEntitlementGrantingStatus(status) {
    return status !== SubscriptionStatus.CANCELLED && status !== SubscriptionStatus.INACTIVE;
}
async function buildExpectedBillingState(userId) {
    const [subscription, profile] = await Promise.all([
        prisma.subscription.findUnique({
            where: { userId },
            select: {
                id: true,
                plan: true,
                status: true,
            },
        }),
        prisma.userBillingProfile.findUnique({
            where: { userId },
            select: {
                region: true,
                currency: true,
                pricingVersion: true,
                isGrandfathered: true,
                country: true,
                stripeCountry: true,
            },
        }),
    ]);
    const subscriptionPlan = subscription?.plan ?? SubscriptionPlan.FREE;
    const subscriptionStatus = subscription?.status ?? SubscriptionStatus.INACTIVE;
    const effectivePlan = isEntitlementGrantingStatus(subscriptionStatus)
        ? subscriptionPlan
        : SubscriptionPlan.FREE;
    const entitlements = await getEntitlements(effectivePlan);
    return {
        userId,
        subscriptionId: subscription?.id ?? null,
        subscriptionPlan,
        subscriptionStatus,
        effectivePlan,
        effectiveStatus: subscriptionStatus,
        billingRegion: profile?.region ?? null,
        currency: profile?.currency ?? null,
        pricingVersion: profile?.pricingVersion ?? null,
        entitlements,
        checksum: hashEntitlements(entitlements),
        isGrandfathered: profile?.isGrandfathered ?? false,
        profileCountry: profile?.country ?? null,
        stripeCountry: profile?.stripeCountry ?? null,
    };
}
export async function validateBillingEntitlementState(userId) {
    const [expected, currentState] = await Promise.all([
        buildExpectedBillingState(userId),
        prisma.billingEntitlementState.findUnique({
            where: { userId },
            select: {
                id: true,
                effectivePlan: true,
                effectiveStatus: true,
                checksum: true,
                billingRegion: true,
                currency: true,
                pricingVersion: true,
            },
        }),
    ]);
    const reasons = [];
    if (!currentState) {
        reasons.push("missing_state");
    }
    else {
        if (currentState.effectivePlan !== expected.effectivePlan) {
            reasons.push("plan_out_of_sync");
        }
        if (currentState.effectiveStatus !== expected.effectiveStatus) {
            reasons.push("status_out_of_sync");
        }
        if (currentState.checksum !== expected.checksum) {
            reasons.push("checksum_out_of_sync");
        }
        if (currentState.billingRegion !== expected.billingRegion) {
            reasons.push("region_out_of_sync");
        }
        if ((currentState.currency ?? null) !== (expected.currency ?? null)) {
            reasons.push("currency_out_of_sync");
        }
        if ((currentState.pricingVersion ?? null) !== (expected.pricingVersion ?? null)) {
            reasons.push("pricing_version_out_of_sync");
        }
    }
    return {
        currentState,
        expected,
        reasons,
        isStale: reasons.length > 0,
    };
}
export async function recordBillingEvent(input) {
    return prisma.billingEventAudit.create({
        data: {
            userId: input.userId ?? undefined,
            subscriptionId: input.subscriptionId ?? undefined,
            eventId: input.eventId ?? undefined,
            source: input.source,
            eventType: input.eventType,
            outcome: input.outcome ?? BillingEventOutcome.RECEIVED,
            plan: input.plan ?? undefined,
            status: input.status ?? undefined,
            billingRegion: input.billingRegion ?? undefined,
            currency: input.currency?.toUpperCase() ?? undefined,
            amountMinor: input.amountMinor ?? undefined,
            stripeCustomerId: input.stripeCustomerId ?? undefined,
            stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
            stripeInvoiceId: input.stripeInvoiceId ?? undefined,
            stripePaymentIntentId: input.stripePaymentIntentId ?? undefined,
            stripeChargeId: input.stripeChargeId ?? undefined,
            stripeRefundId: input.stripeRefundId ?? undefined,
            reasonCode: input.reasonCode ?? undefined,
            message: input.message ?? undefined,
            metadata: input.metadata,
            rawPayload: input.rawPayload ?? undefined,
            occurredAt: input.occurredAt ?? new Date(),
            processedAt: input.processedAt ?? undefined,
        },
    });
}
export async function upsertBillingDiscrepancy(input) {
    const existing = await prisma.billingDiscrepancy.findFirst({
        where: {
            type: input.type,
            status: {
                in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED],
            },
            ...(input.userId ? { userId: input.userId } : {}),
            ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
        },
        orderBy: { detectedAt: "desc" },
    });
    if (existing) {
        return prisma.billingDiscrepancy.update({
            where: { id: existing.id },
            data: {
                severity: input.severity ?? existing.severity,
                title: input.title,
                reasonCode: input.reasonCode ?? existing.reasonCode,
                details: (input.details ?? existing.details ?? undefined),
                dueAt: input.dueAt ?? existing.dueAt ?? undefined,
                lastSeenAt: new Date(),
                billingEventId: input.billingEventId ?? existing.billingEventId ?? undefined,
                reconciliationRunId: input.reconciliationRunId ?? existing.reconciliationRunId ?? undefined,
            },
        });
    }
    return prisma.billingDiscrepancy.create({
        data: {
            userId: input.userId ?? undefined,
            subscriptionId: input.subscriptionId ?? undefined,
            billingEventId: input.billingEventId ?? undefined,
            reconciliationRunId: input.reconciliationRunId ?? undefined,
            type: input.type,
            severity: input.severity ?? "MEDIUM",
            title: input.title,
            reasonCode: input.reasonCode ?? undefined,
            details: input.details,
            dueAt: input.dueAt ?? undefined,
        },
    });
}
export async function resolveBillingDiscrepancy(discrepancyId) {
    return prisma.billingDiscrepancy.update({
        where: { id: discrepancyId },
        data: {
            status: BillingDiscrepancyStatus.RESOLVED,
            resolvedAt: new Date(),
            lastSeenAt: new Date(),
        },
    });
}
export async function syncBillingEntitlementState(userId, source = "system") {
    const validation = await validateBillingEntitlementState(userId);
    const expected = validation.expected;
    const state = await prisma.billingEntitlementState.upsert({
        where: { userId },
        create: {
            userId,
            subscriptionId: expected.subscriptionId ?? undefined,
            effectivePlan: expected.effectivePlan,
            effectiveStatus: expected.effectiveStatus,
            billingRegion: expected.billingRegion ?? undefined,
            currency: expected.currency ?? undefined,
            pricingVersion: expected.pricingVersion ?? undefined,
            entitlements: expected.entitlements,
            checksum: expected.checksum,
            source,
            isInSync: true,
            mismatchReason: null,
            lastSyncedAt: new Date(),
            lastValidatedAt: new Date(),
        },
        update: {
            subscriptionId: expected.subscriptionId ?? undefined,
            effectivePlan: expected.effectivePlan,
            effectiveStatus: expected.effectiveStatus,
            billingRegion: expected.billingRegion ?? undefined,
            currency: expected.currency ?? undefined,
            pricingVersion: expected.pricingVersion ?? undefined,
            entitlements: expected.entitlements,
            checksum: expected.checksum,
            source,
            isInSync: true,
            mismatchReason: null,
            lastSyncedAt: new Date(),
            lastValidatedAt: new Date(),
        },
    });
    if (validation.isStale) {
        await upsertBillingDiscrepancy({
            userId,
            subscriptionId: expected.subscriptionId,
            type: BillingDiscrepancyType.STALE_ENTITLEMENT,
            severity: "MEDIUM",
            title: "Entitlement snapshot drift detected",
            reasonCode: "entitlement_snapshot_stale",
            details: {
                reasons: validation.reasons,
                expectedPlan: expected.effectivePlan,
                expectedStatus: expected.effectiveStatus,
            },
        });
    }
    await recordBillingEvent({
        userId,
        subscriptionId: expected.subscriptionId,
        source: source.toUpperCase(),
        eventType: "entitlements.synced",
        outcome: validation.isStale ? BillingEventOutcome.PROCESSED : BillingEventOutcome.RECONCILED,
        plan: expected.effectivePlan,
        status: expected.effectiveStatus,
        billingRegion: expected.billingRegion,
        currency: expected.currency,
        metadata: {
            reasons: validation.reasons,
            source,
        },
        processedAt: new Date(),
    });
    return {
        state,
        validation,
    };
}
export async function createBillingSupportAction(input) {
    return prisma.billingSupportAction.create({
        data: {
            actorId: input.actorId,
            userId: input.userId,
            subscriptionId: input.subscriptionId ?? undefined,
            billingEventId: input.billingEventId ?? undefined,
            discrepancyId: input.discrepancyId ?? undefined,
            actionType: input.actionType,
            reasonCode: input.reasonCode,
            notes: input.notes ?? undefined,
            metadata: input.metadata,
        },
    });
}
export async function validateCheckoutSafety(userId) {
    const profile = await prisma.userBillingProfile.findUnique({
        where: { userId },
        select: {
            id: true,
            country: true,
            region: true,
            currency: true,
            isGrandfathered: true,
            pricingVersion: true,
            stripeCountry: true,
        },
    });
    if (!profile) {
        return { allowed: true, profile: null };
    }
    const regionConfig = await prisma.regionConfig.findUnique({
        where: { region: profile.region },
        select: {
            currencies: true,
        },
    });
    if (profile.currency && regionConfig && !regionConfig.currencies.includes(profile.currency)) {
        await upsertBillingDiscrepancy({
            userId,
            type: BillingDiscrepancyType.REGION_MISMATCH,
            severity: "HIGH",
            title: "Unsupported billing currency configured for region",
            reasonCode: "unsupported_currency_for_region",
            details: {
                currency: profile.currency,
                region: profile.region,
                allowedCurrencies: regionConfig.currencies,
            },
        });
        return {
            allowed: false,
            profile,
            code: "unsupported_currency_for_region",
            message: "Your billing currency does not match the configured currencies for your billing region.",
        };
    }
    if (profile.country
        && profile.stripeCountry
        && countryToRegion(profile.country) !== countryToRegion(profile.stripeCountry)
        && !profile.isGrandfathered) {
        await upsertBillingDiscrepancy({
            userId,
            type: BillingDiscrepancyType.REGION_MISMATCH,
            severity: "HIGH",
            title: "Billing region differs from last verified payment region",
            reasonCode: "billing_country_payment_country_mismatch",
            details: {
                billingCountry: profile.country,
                billingRegion: profile.region,
                stripeCountry: profile.stripeCountry,
                stripeRegion: countryToRegion(profile.stripeCountry),
            },
        });
        return {
            allowed: false,
            profile,
            code: "billing_country_payment_country_mismatch",
            message: "Your billing country does not match your last verified payment country. Update your billing country or contact support before checkout.",
        };
    }
    return { allowed: true, profile };
}
async function compareRemoteSubscription(runId, subscription) {
    if (!isStripeConfigured() || !subscription.stripeSubId) {
        return { mismatches: 0 };
    }
    const stripe = getStripe();
    const remote = await stripe.subscriptions.retrieve(subscription.stripeSubId);
    const remoteStatus = mapStripeSubscriptionStatus(remote.status);
    const remotePriceId = remote.items.data[0]?.price.id;
    const remotePlan = remotePriceId ? getPlanFromPriceId(remotePriceId) : subscription.plan;
    let mismatches = 0;
    if (remoteStatus !== subscription.status) {
        mismatches += 1;
        await upsertBillingDiscrepancy({
            userId: subscription.userId,
            subscriptionId: subscription.id,
            reconciliationRunId: runId,
            type: BillingDiscrepancyType.SUBSCRIPTION_STATE_MISMATCH,
            severity: "HIGH",
            title: "Local subscription status does not match Stripe",
            reasonCode: "subscription_status_mismatch",
            details: {
                localStatus: subscription.status,
                stripeStatus: remoteStatus,
            },
        });
    }
    if (remotePlan !== subscription.plan) {
        mismatches += 1;
        await upsertBillingDiscrepancy({
            userId: subscription.userId,
            subscriptionId: subscription.id,
            reconciliationRunId: runId,
            type: BillingDiscrepancyType.PLAN_MISMATCH,
            severity: "HIGH",
            title: "Local subscription plan does not match Stripe",
            reasonCode: "subscription_plan_mismatch",
            details: {
                localPlan: subscription.plan,
                stripePlan: remotePlan,
                stripePriceId: remotePriceId ?? null,
            },
        });
    }
    return { mismatches };
}
export async function runBillingReconciliationCycle(triggeredBy = "scheduler") {
    const run = await prisma.billingReconciliationRun.create({
        data: {
            status: BillingReconciliationStatus.SUCCESS,
            triggeredBy,
            startedAt: new Date(),
        },
    });
    const startedAt = Date.now();
    try {
        const subscriptions = await prisma.subscription.findMany({
            select: {
                id: true,
                userId: true,
                plan: true,
                status: true,
                stripeSubId: true,
            },
        });
        let subscriptionMismatches = 0;
        let unpaidEntitlements = 0;
        let paidNotEntitled = 0;
        for (const subscription of subscriptions) {
            const validation = await validateBillingEntitlementState(subscription.userId);
            if (validation.isStale) {
                await upsertBillingDiscrepancy({
                    userId: subscription.userId,
                    subscriptionId: subscription.id,
                    reconciliationRunId: run.id,
                    type: BillingDiscrepancyType.STALE_ENTITLEMENT,
                    severity: "MEDIUM",
                    title: "Entitlement snapshot is stale",
                    reasonCode: "entitlement_snapshot_stale",
                    details: {
                        reasons: validation.reasons,
                    },
                });
            }
            await syncBillingEntitlementState(subscription.userId, "reconciliation");
            if (subscription.status === SubscriptionStatus.PAST_DUE && isPaidPlan(subscription.plan)) {
                unpaidEntitlements += 1;
                await upsertBillingDiscrepancy({
                    userId: subscription.userId,
                    subscriptionId: subscription.id,
                    reconciliationRunId: run.id,
                    type: BillingDiscrepancyType.UNPAID_BUT_ENTITLED,
                    severity: "HIGH",
                    title: "Past-due subscriber still has paid entitlements",
                    reasonCode: "past_due_entitlements_active",
                    details: {
                        status: subscription.status,
                        plan: subscription.plan,
                    },
                });
            }
            if (subscription.status === SubscriptionStatus.ACTIVE
                && subscription.plan !== SubscriptionPlan.FREE
                && subscription.plan !== SubscriptionPlan.EMPLOYER_FREE
                && validation.currentState?.effectivePlan === SubscriptionPlan.FREE) {
                paidNotEntitled += 1;
                await upsertBillingDiscrepancy({
                    userId: subscription.userId,
                    subscriptionId: subscription.id,
                    reconciliationRunId: run.id,
                    type: BillingDiscrepancyType.PAID_BUT_NOT_ENTITLED,
                    severity: "CRITICAL",
                    title: "Active paid subscriber is mapped to free entitlements",
                    reasonCode: "paid_subscription_free_entitlements",
                    details: {
                        plan: subscription.plan,
                        currentStatePlan: validation.currentState?.effectivePlan ?? null,
                    },
                });
            }
            const remoteComparison = await compareRemoteSubscription(run.id, subscription);
            subscriptionMismatches += remoteComparison.mismatches;
        }
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [successPayments, failedPayments, webhookFailures, pendingRefunds,] = await Promise.all([
            prisma.billingEventAudit.count({
                where: {
                    eventType: { in: [...SUCCESSFUL_PAYMENT_EVENTS] },
                    outcome: BillingEventOutcome.PROCESSED,
                    createdAt: { gte: since },
                },
            }),
            prisma.billingEventAudit.count({
                where: {
                    eventType: { in: [...FAILED_PAYMENT_EVENTS] },
                    createdAt: { gte: since },
                },
            }),
            prisma.billingDiscrepancy.count({
                where: {
                    type: BillingDiscrepancyType.WEBHOOK_FAILURE,
                    status: { in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED] },
                },
            }),
            prisma.billingDiscrepancy.count({
                where: {
                    type: BillingDiscrepancyType.PENDING_REFUND,
                    status: { in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED] },
                },
            }),
        ]);
        const status = subscriptionMismatches > 0
            || webhookFailures > 0
            || unpaidEntitlements > 0
            || paidNotEntitled > 0
            || pendingRefunds > 0
            ? BillingReconciliationStatus.PARTIAL
            : BillingReconciliationStatus.SUCCESS;
        await prisma.billingReconciliationRun.update({
            where: { id: run.id },
            data: {
                status,
                checkedSubscriptions: subscriptions.length,
                successPayments,
                failedPayments,
                webhookFailures,
                subscriptionMismatches,
                unpaidEntitlements,
                paidNotEntitled,
                pendingRefunds,
                completedAt: new Date(),
                summary: {
                    checkedSubscriptions: subscriptions.length,
                    successPayments,
                    failedPayments,
                    webhookFailures,
                    subscriptionMismatches,
                    unpaidEntitlements,
                    paidNotEntitled,
                    pendingRefunds,
                },
            },
        });
        recordOpsSnapshotMetric({
            metricName: "billing_successful_payments_24h",
            value: successPayments,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_failed_payments_24h",
            value: failedPayments,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_webhook_failures_open",
            value: webhookFailures,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_subscription_state_mismatches_open",
            value: subscriptionMismatches,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_unpaid_but_entitled_open",
            value: unpaidEntitlements,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_paid_but_not_entitled_open",
            value: paidNotEntitled,
        });
        recordOpsSnapshotMetric({
            metricName: "billing_pending_refunds_open",
            value: pendingRefunds,
        });
        recordOpsEvent({
            metricName: "billing_reconciliation_completed",
            category: "billing",
            outcome: status === BillingReconciliationStatus.SUCCESS ? "success" : "degraded",
            severity: status === BillingReconciliationStatus.SUCCESS ? "info" : "warning",
            durationMs: Date.now() - startedAt,
            details: {
                checkedSubscriptions: subscriptions.length,
                subscriptionMismatches,
                unpaidEntitlements,
                paidNotEntitled,
                webhookFailures,
            },
        });
        return {
            runId: run.id,
            status,
            checkedSubscriptions: subscriptions.length,
            successPayments,
            failedPayments,
            webhookFailures,
            subscriptionMismatches,
            unpaidEntitlements,
            paidNotEntitled,
            pendingRefunds,
        };
    }
    catch (error) {
        await prisma.billingReconciliationRun.update({
            where: { id: run.id },
            data: {
                status: BillingReconciliationStatus.FAILED,
                errorMessage: error instanceof Error ? error.message : String(error),
                completedAt: new Date(),
            },
        });
        recordOpsEvent({
            metricName: "billing_reconciliation_failed",
            category: "billing",
            outcome: "failure",
            severity: "critical",
            durationMs: Date.now() - startedAt,
            details: {
                runId: run.id,
            },
        });
        throw error;
    }
}
//# sourceMappingURL=operations.js.map