import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { getStripe, STRIPE_PRICES } from "../lib/stripe.js";
import { SubscriptionPlan } from "@prisma/client";

const router = Router();

const checkoutSchema = z.object({
  plan: z.enum(["BASIC", "PROFESSIONAL"]),
});

// POST /api/billing/checkout — create Stripe checkout session
router.post("/checkout", authenticate, async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const { plan } = checkoutSchema.parse(req.body);
    const priceId = STRIPE_PRICES[plan as SubscriptionPlan];

    if (!priceId) {
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

      const customer = await stripe.customers.create({
        email: user!.email,
        name: user!.name,
        metadata: { userId: req.user!.userId },
      });

      customerId = customer.id;

      // Upsert subscription record with customer ID
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing`,
      metadata: { userId: req.user!.userId, plan },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Checkout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/billing/portal — create Stripe customer portal session
router.post("/portal", authenticate, async (req: Request, res: Response) => {
  try {
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
