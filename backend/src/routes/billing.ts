import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, requireVerifiedEmail } from "../middleware/auth.js";
import { getStripe, isStripeConfigured, STRIPE_PRICES } from "../lib/stripe.js";
import { SubscriptionPlan, BillingInterval } from "@prisma/client";
import { resolveStripePriceId, resolveUserRegion } from "../lib/billing/index.js";
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

    // Resolve regional price
    const regionalPrice = await resolveStripePriceId(
      req.user!.userId,
      plan as SubscriptionPlan,
      interval as BillingInterval,
    );

    // Fallback to legacy env-var prices if no regional price configured
    const priceId = regionalPrice?.stripePriceId ?? STRIPE_PRICES[plan as SubscriptionPlan];

    if (!priceId) {
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
    let subscription = await prisma.subscription.findUnique({
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

    const sessionParams: Record<string, unknown> = {
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing`,
      metadata: { userId: req.user!.userId, plan, interval },
    };

    // For European customers, collect tax ID
    const billingProfile = await prisma.userBillingProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { region: true },
    });

    if (billingProfile?.region === "EUROPE") {
      sessionParams.tax_id_collection = { enabled: true };
    }

    const session = await stripe.checkout.sessions.create(sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0]);

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
