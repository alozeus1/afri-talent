import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, requireVerifiedEmail } from "../middleware/auth.js";
import { getStripe, isStripeConfigured, STRIPE_PRICES } from "../lib/stripe.js";
import { BillingProvider, SubscriptionPlan, BillingInterval } from "@prisma/client";
import {
  resolveCheckoutPrice,
  resolveUserRegion,
  recordBillingEvent,
  validateCheckoutSafety,
  providerSupportsPortal,
  resolveCheckoutProvider,
} from "../lib/billing/index.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { createFlutterwaveCheckout, isFlutterwaveConfigured, verifyFlutterwaveTransaction } from "../lib/flutterwave.js";

const router = Router();

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PROFESSIONAL", "EMPLOYER_BASIC", "EMPLOYER_PREMIUM"]),
  interval: z.enum(["MONTHLY", "YEARLY"]).optional().default("MONTHLY"),
});

const verifyCheckoutSchema = z.object({
  provider: z.enum(["STRIPE", "FLUTTERWAVE"]),
  sessionId: z.string().optional(),
  transactionId: z.coerce.number().int().positive().optional(),
  txRef: z.string().optional(),
});

function buildFlutterwaveTxRef(userId: string, plan: SubscriptionPlan, interval: BillingInterval): string {
  return `aft_${userId}_${plan}_${interval}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// POST /api/billing/checkout — create Stripe checkout session
router.post("/checkout", authenticate, requireVerifiedEmail(), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const { plan, interval } = checkoutSchema.parse(req.body);
    const safety = await validateCheckoutSafety(req.user!.userId);
    const providerDecision = resolveCheckoutProvider({
      country: safety.profile?.country ?? null,
      region: safety.profile?.region ?? await resolveUserRegion(req.user!.userId).then((value) => value.region),
    });

    if (!providerDecision) {
      recordOpsEvent({
        metricName: "billing_checkout_failure",
        category: "billing",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "billing_not_configured",
        },
      });
      res.status(503).json({ error: "Billing is not configured for this environment" });
      return;
    }

    if (!safety.allowed) {
      await recordBillingEvent({
        userId: req.user!.userId,
        source: "CHECKOUT_API",
        eventType: "billing.checkout.blocked",
        outcome: "FAILED",
        plan: plan as SubscriptionPlan,
        reasonCode: safety.code,
        message: safety.message,
        metadata: {
          profileRegion: safety.profile?.region ?? null,
          profileCurrency: safety.profile?.currency ?? null,
          stripeCountry: safety.profile?.stripeCountry ?? null,
        },
        processedAt: new Date(),
      });
      res.status(409).json({ error: safety.message });
      return;
    }

    const regionalPrice = await resolveCheckoutPrice(
      req.user!.userId,
      plan as SubscriptionPlan,
      interval as BillingInterval,
    );

    // Fallback to legacy env-var prices if no regional price configured
    const priceId = regionalPrice?.stripePriceId ?? STRIPE_PRICES[plan as SubscriptionPlan];
    const flutterwavePlanId = regionalPrice?.flutterwavePlanId ?? null;
    const usedLegacyFallback = providerDecision.provider === BillingProvider.STRIPE
      && !regionalPrice?.stripePriceId
      && !!STRIPE_PRICES[plan as SubscriptionPlan];

    if (
      (providerDecision.provider === BillingProvider.STRIPE && !priceId)
      || (providerDecision.provider === BillingProvider.FLUTTERWAVE && !flutterwavePlanId)
    ) {
      await recordBillingEvent({
        userId: req.user!.userId,
        source: "CHECKOUT_API",
        eventType: "billing.checkout.failed",
        outcome: "FAILED",
        plan: plan as SubscriptionPlan,
        reasonCode: "missing_price_id",
        metadata: {
          interval,
          provider: providerDecision.provider,
          profileRegion: safety.profile?.region ?? null,
          profileCurrency: safety.profile?.currency ?? null,
        },
        processedAt: new Date(),
      });
      recordOpsEvent({
        metricName: "billing_checkout_failure",
        category: "billing",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          plan,
          interval,
          reason: "missing_price_id",
          provider: providerDecision.provider,
        },
      });
      res.status(400).json({
        error: providerDecision.provider === BillingProvider.FLUTTERWAVE
          ? `Flutterwave plan not configured for ${plan}`
          : `Price not configured for plan: ${plan}`,
      });
      return;
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resolvedRegion = await resolveUserRegion(req.user!.userId);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      res.status(404).json({ error: "Billing user not found" });
      return;
    }

    const sessionParams: Record<string, unknown> = {
      mode: "subscription",
      payment_method_types: ["card"],
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing`,
      metadata: {
        userId: req.user!.userId,
        plan,
        interval,
        billingRegion: resolvedRegion.region,
        billingCountry: resolvedRegion.country,
        currency: regionalPrice?.currency ?? safety.profile?.currency ?? null,
        pricingVersion: safety.profile?.pricingVersion ?? null,
        isGrandfathered: safety.profile?.isGrandfathered ?? false,
      },
      client_reference_id: req.user!.userId,
    };

    // For European customers, collect tax ID
    const billingProfile = await prisma.userBillingProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { region: true, taxIdType: true, taxIdValue: true, country: true },
    });

    if (billingProfile?.region === "EUROPE") {
      sessionParams.tax_id_collection = { enabled: true };
      sessionParams.customer_update = {
        address: "auto",
        name: "auto",
      };
      sessionParams.tax_id_collection = { enabled: true };
      sessionParams.automatic_tax = { enabled: true };
    }

    if (billingProfile?.taxIdType && billingProfile.taxIdValue) {
      sessionParams.customer_update = {
        ...(sessionParams.customer_update as Record<string, unknown> | undefined),
        address: "auto",
        name: "auto",
      };
    }

    if (providerDecision.provider === BillingProvider.FLUTTERWAVE) {
      if (!isFlutterwaveConfigured()) {
        res.status(503).json({ error: "Flutterwave is not configured for this environment" });
        return;
      }

      const txRef = buildFlutterwaveTxRef(req.user!.userId, plan as SubscriptionPlan, interval as BillingInterval);
      const session = await createFlutterwaveCheckout({
        txRef,
        amountMinor: regionalPrice?.amount ?? 0,
        currency: regionalPrice?.currency ?? safety.profile?.currency ?? "NGN",
        redirectUrl: `${frontendUrl}/billing/success?provider=FLUTTERWAVE`,
        customer: {
          email: user.email,
          name: user.name,
        },
        plan: plan as SubscriptionPlan,
        interval: interval as BillingInterval,
        paymentPlanId: flutterwavePlanId!,
        meta: {
          userId: req.user!.userId,
          plan,
          interval,
          billingRegion: resolvedRegion.region,
          billingCountry: resolvedRegion.country,
        },
      });

      await prisma.subscription.upsert({
        where: { userId: req.user!.userId },
        create: {
          userId: req.user!.userId,
          plan: SubscriptionPlan.FREE,
          billingProvider: BillingProvider.FLUTTERWAVE,
        },
        update: {
          billingProvider: BillingProvider.FLUTTERWAVE,
        },
      });

      await recordBillingEvent({
        userId: req.user!.userId,
        subscriptionId: subscription?.id ?? null,
        source: "FLUTTERWAVE_CHECKOUT",
        eventId: txRef,
        eventType: "billing.checkout.created",
        outcome: "PROCESSED",
        plan: plan as SubscriptionPlan,
        billingRegion: resolvedRegion.region,
        currency: regionalPrice?.currency ?? safety.profile?.currency ?? null,
        amountMinor: regionalPrice?.amount ?? null,
        reasonCode: "flutterwave_checkout",
        metadata: {
          interval,
          provider: BillingProvider.FLUTTERWAVE,
          checkoutUrl: session.link,
          flutterwavePlanId,
          billingCountry: resolvedRegion.country,
          pricingVersion: safety.profile?.pricingVersion ?? null,
        },
        processedAt: new Date(),
      });

      res.json({
        provider: BillingProvider.FLUTTERWAVE,
        url: session.link,
        reference: txRef,
        sessionId: txRef,
        currency: regionalPrice?.currency ?? "NGN",
        amount: regionalPrice?.amount ?? null,
      });
      return;
    }

    const stripe = getStripe();
    let customerId = subscription?.stripeCustomerId ?? subscription?.providerCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: req.user!.userId,
          billingRegion: resolvedRegion.region,
          billingCountry: resolvedRegion.country,
        },
      });

      customerId = customer.id;

      await prisma.subscription.upsert({
        where: { userId: req.user!.userId },
        create: {
          userId: req.user!.userId,
          stripeCustomerId: customerId,
          providerCustomerId: customerId,
          billingProvider: BillingProvider.STRIPE,
          plan: SubscriptionPlan.FREE,
        },
        update: {
          stripeCustomerId: customerId,
          providerCustomerId: customerId,
          billingProvider: BillingProvider.STRIPE,
        },
      });
    }

    sessionParams.customer = customerId;
    sessionParams.line_items = [{ price: priceId, quantity: 1 }];

    const session = await stripe.checkout.sessions.create(sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]);

    await recordBillingEvent({
      userId: req.user!.userId,
      subscriptionId: subscription?.id ?? null,
      source: "CHECKOUT_API",
      eventType: "billing.checkout.created",
      outcome: "PROCESSED",
      plan: plan as SubscriptionPlan,
      billingRegion: resolvedRegion.region,
      currency: regionalPrice?.currency ?? safety.profile?.currency ?? null,
      amountMinor: regionalPrice?.amount ?? null,
      stripeCustomerId: customerId,
      eventId: session.id,
      reasonCode: usedLegacyFallback ? "legacy_price_fallback" : null,
      metadata: {
        interval,
        stripePriceId: priceId,
        billingCountry: resolvedRegion.country,
        pricingVersion: safety.profile?.pricingVersion ?? null,
        isGrandfathered: safety.profile?.isGrandfathered ?? false,
        usedLegacyFallback,
        taxIdType: billingProfile?.taxIdType ?? null,
      },
      processedAt: new Date(),
    });

    res.json({
      provider: BillingProvider.STRIPE,
      url: session.url,
      sessionId: session.id,
      currency: regionalPrice?.currency ?? "usd",
      amount: regionalPrice?.amount ?? null,
    });
    recordOpsEvent({
      metricName: "billing_checkout_session_success",
      category: "billing",
      durationMs: Date.now() - startedAt,
      details: {
        plan,
        interval,
        currency: regionalPrice?.currency ?? "usd",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "billing_checkout_failure",
        category: "billing",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Checkout error:", error);
    await recordBillingEvent({
      userId: req.user?.userId ?? null,
      source: "CHECKOUT_API",
      eventType: "billing.checkout.failed",
      outcome: "FAILED",
      reasonCode: "internal_error",
      message: error instanceof Error ? error.message : "Unknown checkout failure",
      processedAt: new Date(),
    }).catch(() => undefined);
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
      },
    });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/billing/verify-checkout — verify provider redirects before webhook catch-up
router.post("/verify-checkout", authenticate, requireVerifiedEmail(), async (req: Request, res: Response) => {
  try {
    const payload = verifyCheckoutSchema.parse(req.body);

    if (payload.provider === "STRIPE") {
      const subscription = await prisma.subscription.findUnique({
        where: { userId: req.user!.userId },
        select: { plan: true, status: true, currentPeriodEnd: true, stripeCustomerId: true, billingProvider: true },
      });

      res.json({
        verified: true,
        provider: BillingProvider.STRIPE,
        plan: subscription?.plan ?? SubscriptionPlan.FREE,
        status: subscription?.status ?? "INACTIVE",
      });
      return;
    }

    if (!payload.transactionId) {
      res.status(400).json({ error: "transactionId is required for Flutterwave verification" });
      return;
    }

    const verified = await verifyFlutterwaveTransaction(payload.transactionId);
    const checkoutEvent = payload.txRef
      ? await prisma.billingEventAudit.findFirst({
          where: {
            eventId: payload.txRef,
            userId: req.user!.userId,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const metadata = (checkoutEvent?.metadata ?? {}) as Record<string, unknown>;
    const plan = (metadata.plan as SubscriptionPlan | undefined) ?? SubscriptionPlan.BASIC;
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    if (
      verified.status.toLowerCase() !== "successful"
      || (payload.txRef && verified.tx_ref !== payload.txRef)
    ) {
      res.status(409).json({ error: "Flutterwave transaction has not completed successfully yet" });
      return;
    }

    const subscription = await prisma.subscription.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        plan,
        status: "ACTIVE",
        billingProvider: BillingProvider.FLUTTERWAVE,
        providerCustomerId: verified.customer?.id ? String(verified.customer.id) : null,
        providerSubscriptionId: payload.txRef ?? String(verified.id),
      },
      update: {
        plan,
        status: "ACTIVE",
        billingProvider: BillingProvider.FLUTTERWAVE,
        providerCustomerId: verified.customer?.id ? String(verified.customer.id) : currentSubscription?.providerCustomerId,
        providerSubscriptionId: payload.txRef ?? currentSubscription?.providerSubscriptionId ?? String(verified.id),
      },
    });

    await recordBillingEvent({
      userId: req.user!.userId,
      subscriptionId: subscription.id,
      source: "FLUTTERWAVE_VERIFY",
      eventId: payload.txRef ?? String(verified.id),
      eventType: "charge.completed",
      outcome: "PROCESSED",
      plan,
      status: "ACTIVE",
      billingRegion: metadata.billingRegion as "AFRICA" | "EUROPE" | "ROW" | null,
      currency: verified.currency,
      amountMinor: Math.round(verified.amount * 100),
      reasonCode: "redirect_verification",
      metadata: {
        provider: BillingProvider.FLUTTERWAVE,
        txRef: verified.tx_ref,
        flutterwaveTransactionId: verified.id,
        paymentType: verified.payment_type ?? null,
      },
      processedAt: new Date(),
    });

    res.json({
      verified: true,
      provider: BillingProvider.FLUTTERWAVE,
      plan: subscription.plan,
      status: subscription.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }

    console.error("Verify checkout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/billing/portal — create Stripe customer portal session
router.post("/portal", authenticate, requireVerifiedEmail(), async (req: Request, res: Response) => {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Billing is not configured for this environment" });
      return;
    }

    const stripe = getStripe();

    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
      select: { stripeCustomerId: true, billingProvider: true },
    });

    if (!providerSupportsPortal(subscription?.billingProvider) || !subscription?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found. Please subscribe first." });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${frontendUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Portal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/billing/status — get current subscription status
router.get("/status", authenticate, async (req: Request, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
      select: {
        plan: true,
        status: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
        billingProvider: true,
        providerCustomerId: true,
      },
    });

    res.json({
      plan: subscription?.plan ?? SubscriptionPlan.FREE,
      status: subscription?.status ?? "INACTIVE",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      billingProvider: subscription?.billingProvider ?? null,
      hasCustomer: !!(subscription?.stripeCustomerId || subscription?.providerCustomerId),
      hasPortal: providerSupportsPortal(subscription?.billingProvider),
    });
  } catch (error) {
    console.error("Billing status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
