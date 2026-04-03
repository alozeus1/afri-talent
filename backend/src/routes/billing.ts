import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, requireVerifiedEmail } from "../middleware/auth.js";
import { getStripe, isStripeConfigured, STRIPE_PRICES } from "../lib/stripe.js";
import { SubscriptionPlan, BillingInterval } from "@prisma/client";
import {
  resolveStripePriceId,
  resolveUserRegion,
  recordBillingEvent,
  validateCheckoutSafety,
} from "../lib/billing/index.js";
import { recordOpsEvent } from "../lib/ops/events.js";

const router = Router();

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PROFESSIONAL", "EMPLOYER_BASIC", "EMPLOYER_PREMIUM"]),
  interval: z.enum(["MONTHLY", "YEARLY"]).optional().default("MONTHLY"),
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/checkout", authenticate, requireVerifiedEmail(), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    if (!isStripeConfigured()) {
      recordOpsEvent({
        metricName: "billing_checkout_failure",
        category: "billing",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "stripe_not_configured",
        },
      });
      res.status(503).json({ error: "Billing is not configured for this environment" });
      return;
    }

    const stripe = getStripe();
    const { plan, interval } = checkoutSchema.parse(req.body);
    const safety = await validateCheckoutSafety(req.user!.userId);

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

    // Resolve regional price
    const regionalPrice = await resolveStripePriceId(
      req.user!.userId,
      plan as SubscriptionPlan,
      interval as BillingInterval,
    );

    // Fallback to legacy env-var prices if no regional price configured
    const priceId = regionalPrice?.stripePriceId ?? STRIPE_PRICES[plan as SubscriptionPlan];
    const usedLegacyFallback = !regionalPrice?.stripePriceId && !!STRIPE_PRICES[plan as SubscriptionPlan];

    if (!priceId) {
      await recordBillingEvent({
        userId: req.user!.userId,
        source: "CHECKOUT_API",
        eventType: "billing.checkout.failed",
        outcome: "FAILED",
        plan: plan as SubscriptionPlan,
        reasonCode: "missing_price_id",
        metadata: {
          interval,
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
        },
      });
      res.status(400).json({ error: `Price not configured for plan: ${plan}` });
      return;
    }

    // Get or create Stripe customer
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
    });

    let customerId = subscription?.stripeCustomerId;

    if (!customerId) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true, name: true },
      });

      const region = await resolveUserRegion(req.user!.userId);

      const customer = await stripe.customers.create({
        email: user!.email,
        name: user!.name,
        metadata: {
          userId: req.user!.userId,
          billingRegion: region.region,
          billingCountry: region.country,
        },
      });

      customerId = customer.id;

      await prisma.subscription.upsert({
        where: { userId: req.user!.userId },
        create: {
          userId: req.user!.userId,
          stripeCustomerId: customerId,
          plan: SubscriptionPlan.FREE,
        },
        update: { stripeCustomerId: customerId },
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resolvedRegion = await resolveUserRegion(req.user!.userId);

    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
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
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
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
      },
    });

    res.json({
      plan: subscription?.plan ?? SubscriptionPlan.FREE,
      status: subscription?.status ?? "INACTIVE",
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      hasCustomer: !!subscription?.stripeCustomerId,
    });
  } catch (error) {
    console.error("Billing status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
