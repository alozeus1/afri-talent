import { Router, Request, Response } from "express";
import { getStripe, getPlanFromPriceId } from "../lib/stripe.js";
import prisma from "../lib/prisma.js";
import { SubscriptionStatus, SubscriptionPlan } from "@prisma/client";

const router = Router();

// Processed event IDs for idempotency (resets on restart; use Redis for production)
const processedEvents = new Set<string>();

// POST /api/webhooks/stripe
// IMPORTANT: This route MUST be registered BEFORE express.json() in server.ts
// because Stripe signature verification requires the raw request body.
router.post("/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  // Idempotency guard
  if (processedEvents.has(event.id)) {
    res.json({ received: true, duplicate: true });
    return;
  }
  processedEvents.add(event.id);
  // Keep set bounded (prevent unbounded memory growth in long-running processes)
  if (processedEvents.size > 10000) {
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as {
          customer: string;
          subscription: string;
          metadata: { userId: string; plan: string };
        };
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan as SubscriptionPlan;

        if (userId && plan) {
          await prisma.subscription.upsert({
            where: { userId },
            create: {
              userId,
              stripeCustomerId: session.customer,
              stripeSubId: session.subscription,
              plan,
              status: SubscriptionStatus.ACTIVE,
            },
            update: {
              stripeCustomerId: session.customer,
              stripeSubId: session.subscription,
              plan,
              status: SubscriptionStatus.ACTIVE,
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as {
          id: string;
          status: string;
          current_period_end: number;
          items: { data: Array<{ price: { id: string } }> };
        };
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? getPlanFromPriceId(priceId) : undefined;
        const status = mapStripeStatus(sub.status);

        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            ...(plan && { plan }),
            status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as { id: string };
        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            plan: SubscriptionPlan.FREE,
          },
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as { subscription: string };
        await prisma.subscription.updateMany({
          where: { stripeSubId: invoice.subscription },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
        break;
      }

      default:
        // Unhandled event types are fine — log and acknowledge
        console.info(`[webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[webhook] Handler error:", error);
    // Return 200 to prevent Stripe from retrying (state may be partially applied)
    res.json({ received: true, error: "Handler error — check server logs" });
  }
});

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
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

export default router;
