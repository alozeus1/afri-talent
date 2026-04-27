import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  AdminPermission,
  BillingEventOutcome,
  BillingDiscrepancyStatus,
  BillingDiscrepancyType,
  BillingSupportActionType,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { checkPermission, enforceAdminRbac } from "../middleware/admin-rbac.js";
import {
  createBillingSupportAction,
  recordBillingEvent,
  runBillingReconciliationCycle,
  syncBillingEntitlementState,
} from "../lib/billing/index.js";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";

const router = Router();

router.use(authenticate, enforceAdminRbac);

const supportActionSchema = z.object({
  actionType: z.nativeEnum(BillingSupportActionType),
  reasonCode: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(2000).optional(),
  billingEventId: z.string().trim().optional(),
  discrepancyId: z.string().trim().optional(),
  invoiceId: z.string().trim().optional(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ).optional(),
});

const subscriptionAccessSchema = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  status: z.nativeEnum(SubscriptionStatus),
  currentPeriodEnd: z.string().datetime({ offset: true }).nullable().optional(),
  reasonCode: z.string().trim().min(3).max(120),
  notes: z.string().trim().max(2000).optional(),
});

const discrepancyStatusValues = ["ALL", ...Object.values(BillingDiscrepancyStatus)] as const;
const candidatePlanValues = [SubscriptionPlan.FREE, SubscriptionPlan.BASIC, SubscriptionPlan.PROFESSIONAL] as const;
const employerPlanValues = [
  SubscriptionPlan.EMPLOYER_FREE,
  SubscriptionPlan.EMPLOYER_BASIC,
  SubscriptionPlan.EMPLOYER_PREMIUM,
] as const;

function isPlanAllowedForRole(role: Role, plan: SubscriptionPlan) {
  if (role === Role.EMPLOYER) {
    return employerPlanValues.includes(plan as typeof employerPlanValues[number]);
  }

  return candidatePlanValues.includes(plan as typeof candidatePlanValues[number]);
}

router.get("/dashboard", checkPermission(AdminPermission.VIEW_BILLING_DATA), async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      successfulPayments,
      failedPayments,
      webhookFailures,
      mismatchedSubscriptionStates,
      unpaidButEntitled,
      paidButNotEntitled,
      pendingRefunds,
      recentDiscrepancies,
      lastReconciliationRun,
    ] = await Promise.all([
      prisma.billingEventAudit.count({
        where: {
          eventType: { in: ["invoice.paid", "invoice.payment_succeeded"] },
          outcome: "PROCESSED",
          createdAt: { gte: since },
        },
      }),
      prisma.billingEventAudit.count({
        where: {
          eventType: "invoice.payment_failed",
          createdAt: { gte: since },
        },
      }),
      prisma.billingDiscrepancy.count({
        where: {
          type: BillingDiscrepancyType.WEBHOOK_FAILURE,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.billingDiscrepancy.count({
        where: {
          type: {
            in: [
              BillingDiscrepancyType.SUBSCRIPTION_STATE_MISMATCH,
              BillingDiscrepancyType.PLAN_MISMATCH,
              BillingDiscrepancyType.STALE_ENTITLEMENT,
              BillingDiscrepancyType.REGION_MISMATCH,
            ],
          },
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.billingDiscrepancy.count({
        where: {
          type: BillingDiscrepancyType.UNPAID_BUT_ENTITLED,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.billingDiscrepancy.count({
        where: {
          type: BillingDiscrepancyType.PAID_BUT_NOT_ENTITLED,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.billingDiscrepancy.count({
        where: {
          type: BillingDiscrepancyType.PENDING_REFUND,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
      }),
      prisma.billingDiscrepancy.findMany({
        take: 8,
        orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      prisma.billingReconciliationRun.findFirst({
        orderBy: { startedAt: "desc" },
      }),
    ]);

    res.json({
      metrics: {
        successfulPayments,
        failedPayments,
        webhookFailures,
        mismatchedSubscriptionStates,
        unpaidButEntitled,
        paidButNotEntitled,
        pendingRefunds,
      },
      lastReconciliationRun,
      recentDiscrepancies,
      windows: {
        paymentsSince: since.toISOString(),
      },
    });
  } catch (error) {
    console.error("Admin billing dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/discrepancies", checkPermission(AdminPermission.VIEW_BILLING_DATA), async (req: Request, res: Response) => {
  try {
    const rawStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "OPEN";
    const status = discrepancyStatusValues.includes(rawStatus as typeof discrepancyStatusValues[number])
      ? rawStatus
      : "OPEN";
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);

    const discrepancies = await prisma.billingDiscrepancy.findMany({
      where: status === "ALL" ? undefined : { status: status as BillingDiscrepancyStatus },
      take: limit,
      orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        subscription: {
          select: { id: true, plan: true, status: true },
        },
      },
    });

    res.json({ discrepancies });
  } catch (error) {
    console.error("Admin billing discrepancies error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reconciliation-runs", checkPermission(AdminPermission.VIEW_BILLING_DATA), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const runs = await prisma.billingReconciliationRun.findMany({
      take: limit,
      orderBy: { startedAt: "desc" },
    });
    res.json({ runs });
  } catch (error) {
    console.error("Admin billing reconciliation runs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reconcile", checkPermission(AdminPermission.MANAGE_BILLING_DISPUTES), async (req: Request, res: Response) => {
  try {
    const result = await runBillingReconciliationCycle(`admin:${req.user!.userId}`);
    res.json({ result });
  } catch (error) {
    console.error("Admin billing reconciliation trigger error:", error);
    res.status(500).json({ error: "Failed to run reconciliation" });
  }
});

router.get("/customers/search", checkPermission(AdminPermission.VIEW_BILLING_DATA), async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) {
      res.json({ customers: [] });
      return;
    }

    const customers = await prisma.user.findMany({
      where: {
        OR: [
          { id: query },
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { subscription: { is: { stripeCustomerId: query } } },
          { subscription: { is: { stripeSubId: query } } },
        ],
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            stripeCustomerId: true,
            stripeSubId: true,
          },
        },
        billingProfile: {
          select: {
            region: true,
            country: true,
            currency: true,
            isGrandfathered: true,
            pricingVersion: true,
          },
        },
      },
    });

    res.json({ customers });
  } catch (error) {
    console.error("Admin billing customer search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/customers/:userId", checkPermission(AdminPermission.VIEW_BILLING_DATA), async (req: Request, res: Response) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            billingProvider: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            stripeCustomerId: true,
            stripeSubId: true,
            currentPeriodEnd: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        billingProfile: {
          select: {
            region: true,
            country: true,
            currency: true,
            regionSource: true,
            pricingVersion: true,
            isGrandfathered: true,
            grandfatheredAt: true,
            taxIdType: true,
            taxIdValue: true,
            stripeCountry: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        billingEntitlementState: true,
        billingEvents: {
          take: 25,
          orderBy: { createdAt: "desc" },
        },
        billingDiscrepancies: {
          take: 20,
          orderBy: { detectedAt: "desc" },
        },
        billingSupportActions: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            actor: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    res.json({ customer });
  } catch (error) {
    console.error("Admin billing customer detail error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/customers/:userId/subscription-access", checkPermission(AdminPermission.MANAGE_BILLING_DISPUTES), async (req: Request, res: Response) => {
  try {
    const data = subscriptionAccessSchema.parse(req.body);
    const customer = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        role: true,
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            billingProvider: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            stripeCustomerId: true,
            stripeSubId: true,
            currentPeriodEnd: true,
          },
        },
        billingEntitlementState: {
          select: {
            effectivePlan: true,
            effectiveStatus: true,
          },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    if (!isPlanAllowedForRole(customer.role, data.plan)) {
      res.status(400).json({
        error: customer.role === Role.EMPLOYER
          ? "Employer accounts can only be assigned employer subscription plans."
          : "Candidate and admin accounts can only be assigned candidate subscription plans.",
      });
      return;
    }

    const currentPeriodEnd = data.currentPeriodEnd === undefined
      ? customer.subscription?.currentPeriodEnd ?? null
      : data.currentPeriodEnd
        ? new Date(data.currentPeriodEnd)
        : null;

    const previousState = {
      subscriptionPlan: customer.subscription?.plan ?? SubscriptionPlan.FREE,
      subscriptionStatus: customer.subscription?.status ?? SubscriptionStatus.INACTIVE,
      currentPeriodEnd: customer.subscription?.currentPeriodEnd?.toISOString() ?? null,
      effectivePlan: customer.billingEntitlementState?.effectivePlan ?? SubscriptionPlan.FREE,
      effectiveStatus: customer.billingEntitlementState?.effectiveStatus ?? SubscriptionStatus.INACTIVE,
    };

    const subscription = await prisma.subscription.upsert({
      where: { userId: customer.id },
      create: {
        userId: customer.id,
        plan: data.plan,
        status: data.status,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
      },
      update: {
        plan: data.plan,
        status: data.status,
        currentPeriodEnd,
      },
      select: {
        id: true,
        plan: true,
        status: true,
        billingProvider: true,
        providerCustomerId: true,
        providerSubscriptionId: true,
        stripeCustomerId: true,
        stripeSubId: true,
        currentPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const syncResult = await syncBillingEntitlementState(customer.id, `admin:${req.user!.userId}:subscription_access`);

    const providerLinked = Boolean(
      subscription.providerSubscriptionId
      || subscription.stripeSubId
      || subscription.providerCustomerId
      || subscription.stripeCustomerId,
    );

    const action = await createBillingSupportAction({
      actorId: req.user!.userId,
      userId: customer.id,
      subscriptionId: subscription.id,
      actionType: BillingSupportActionType.UPGRADE_DOWNGRADE_CORRECTION,
      reasonCode: data.reasonCode,
      notes: data.notes ?? null,
      metadata: {
        previousSubscriptionPlan: previousState.subscriptionPlan,
        previousSubscriptionStatus: previousState.subscriptionStatus,
        previousCurrentPeriodEnd: previousState.currentPeriodEnd,
        previousEffectivePlan: previousState.effectivePlan,
        previousEffectiveStatus: previousState.effectiveStatus,
        nextSubscriptionPlan: subscription.plan,
        nextSubscriptionStatus: subscription.status,
        nextCurrentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        nextEffectivePlan: syncResult.state.effectivePlan,
        nextEffectiveStatus: syncResult.state.effectiveStatus,
        providerLinked,
        billingProvider: subscription.billingProvider ?? null,
      },
    });

    await recordBillingEvent({
      userId: customer.id,
      subscriptionId: subscription.id,
      source: "ADMIN_BILLING",
      eventType: "admin.subscription_access.updated",
      outcome: BillingEventOutcome.PROCESSED,
      plan: subscription.plan,
      status: subscription.status,
      billingRegion: syncResult.state.billingRegion ?? null,
      currency: syncResult.state.currency ?? null,
      reasonCode: data.reasonCode,
      message: `Admin updated subscription access to ${subscription.plan}/${subscription.status}`,
      metadata: {
        actorId: req.user!.userId,
        notes: data.notes ?? null,
        providerLinked,
        previousPlan: previousState.subscriptionPlan,
        previousStatus: previousState.subscriptionStatus,
        previousEffectivePlan: previousState.effectivePlan,
        previousEffectiveStatus: previousState.effectiveStatus,
      },
      processedAt: new Date(),
    });

    res.json({
      subscription,
      state: syncResult.state,
      validation: syncResult.validation,
      action,
      warnings: providerLinked
        ? ["This account still has a linked billing provider subscription. Future provider webhooks may overwrite local plan or status changes."]
        : [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Admin billing subscription access error:", error);
    res.status(500).json({ error: "Failed to update subscription access" });
  }
});

router.post("/customers/:userId/resync-entitlements", checkPermission(AdminPermission.MANAGE_BILLING_DISPUTES), async (req: Request, res: Response) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        subscription: {
          select: { id: true },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const result = await syncBillingEntitlementState(customer.id, `admin:${req.user!.userId}`);
    const action = await createBillingSupportAction({
      actorId: req.user!.userId,
      userId: customer.id,
      subscriptionId: customer.subscription?.id ?? null,
      actionType: BillingSupportActionType.RESYNC_ENTITLEMENTS,
      reasonCode: "manual_entitlement_resync",
      metadata: {
        staleBeforeSync: result.validation.isStale,
        reasons: result.validation.reasons.join(","),
      },
    });

    await prisma.billingDiscrepancy.updateMany({
      where: {
        userId: customer.id,
        type: BillingDiscrepancyType.STALE_ENTITLEMENT,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    res.json({ state: result.state, validation: result.validation, action });
  } catch (error) {
    console.error("Admin billing resync entitlements error:", error);
    res.status(500).json({ error: "Failed to resync entitlements" });
  }
});

router.post("/customers/:userId/actions", checkPermission(AdminPermission.MANAGE_BILLING_DISPUTES), async (req: Request, res: Response) => {
  try {
    const data = supportActionSchema.parse(req.body);
    const customer = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        subscription: {
          select: { id: true },
        },
        billingProfile: {
          select: { isGrandfathered: true, pricingVersion: true },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    let receiptDelivery: { attempted: boolean; delivered: boolean; message: string } | null = null;

    if (data.actionType === BillingSupportActionType.RESEND_RECEIPT) {
      if (!data.invoiceId) {
        res.status(400).json({ error: "invoiceId is required to resend a receipt or invoice email" });
        return;
      }

      if (!isStripeConfigured()) {
        receiptDelivery = {
          attempted: false,
          delivered: false,
          message: "Stripe is not configured in this environment.",
        };
      } else {
        try {
          await getStripe().invoices.sendInvoice(data.invoiceId);
          receiptDelivery = {
            attempted: true,
            delivered: true,
            message: "Stripe accepted the invoice resend request.",
          };
        } catch (error) {
          receiptDelivery = {
            attempted: true,
            delivered: false,
            message: error instanceof Error
              ? error.message
              : "Stripe could not resend this invoice email. This usually means the invoice is not send_invoice eligible.",
          };
        }
      }
    }

    if (data.actionType === BillingSupportActionType.GRANDFATHER_OVERRIDE && data.metadata) {
      const shouldGrandfather = Boolean(data.metadata.isGrandfathered);
      await prisma.userBillingProfile.upsert({
        where: { userId: customer.id },
        create: {
          userId: customer.id,
          region: "ROW",
          currency: "USD",
          isGrandfathered: shouldGrandfather,
          pricingVersion: customer.billingProfile?.pricingVersion ?? 1,
          grandfatheredAt: shouldGrandfather ? new Date() : null,
        },
        update: {
          isGrandfathered: shouldGrandfather,
          grandfatheredAt: shouldGrandfather ? new Date() : null,
        },
      });
    }

    if (data.discrepancyId && data.actionType !== BillingSupportActionType.NOTE) {
      await prisma.billingDiscrepancy.update({
        where: { id: data.discrepancyId },
        data: {
          status: BillingDiscrepancyStatus.ACKNOWLEDGED,
          acknowledgedAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
    }

    const action = await createBillingSupportAction({
      actorId: req.user!.userId,
      userId: customer.id,
      subscriptionId: customer.subscription?.id ?? null,
      billingEventId: data.billingEventId ?? null,
      discrepancyId: data.discrepancyId ?? null,
      actionType: data.actionType,
      reasonCode: data.reasonCode,
      notes: data.notes ?? null,
      metadata: {
        ...(data.metadata ?? {}),
        ...(data.invoiceId ? { invoiceId: data.invoiceId } : {}),
        ...(receiptDelivery ? { receiptDelivery: JSON.stringify(receiptDelivery) } : {}),
      },
    });

    res.json({ action, receiptDelivery });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Admin billing support action error:", error);
    res.status(500).json({ error: "Failed to record billing support action" });
  }
});

export default router;
