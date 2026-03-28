import { Router, Request, Response } from "express";
import { getStripe, getPlanFromPriceId, isStripeConfigured } from "../lib/stripe.js";
import prisma from "../lib/prisma.js";
import { SubscriptionStatus, SubscriptionPlan } from "@prisma/client";
import { updateStripeCountry } from "../lib/billing/region-resolver.js";
import { createUserNotification } from "../lib/notifications.js";

const router = Router();

// Processed event IDs for idempotency (resets on restart; use Redis for production)
const processedEvents = new Set<string>();

// POST /api/webhooks/stripe
// IMPORTANT: This route MUST be registered BEFORE express.json() in server.ts
// because Stripe signature verification requires the raw request body.
router.post("/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isStripeConfigured()) {
    console.error("[webhook] STRIPE_SECRET_KEY not set");
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

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

          await createUserNotification({
            userId,
            type: "VERIFICATION",
            title: "Subscription activated",
            body: `Your ${plan} plan is now active.`,
            channel: "subscriptionNotices",
            metadata: { event: event.type, plan },
          });
        }
        break;
      }

      case "payment_method.attached": {
        // Capture payment country from payment method
        const pm = event.data.object as unknown as {
          customer: string;
          card?: { country: string };
        };
        if (pm.customer && pm.card?.country) {
          const sub = await prisma.subscription.findFirst({
            where: { stripeCustomerId: pm.customer as string },
            select: { userId: true },
          });
          if (sub) {
            await updateStripeCountry(sub.userId, pm.card.country).catch((err) =>
              console.error("[webhook] Failed to update Stripe country:", err),
            );
          }
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
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubId: sub.id },
          select: { userId: true },
        });

        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            ...(plan && { plan }),
            status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });

        if (existing?.userId) {
          await createUserNotification({
            userId: existing.userId,
            type: "VERIFICATION",
            title: "Subscription updated",
            body: `Your subscription status is now ${status.toLowerCase()}.`,
            channel: "subscriptionNotices",
            metadata: { event: event.type, status, plan },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as { id: string };
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubId: sub.id },
          select: { userId: true },
        });
        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            plan: SubscriptionPlan.FREE,
          },
        });

        if (existing?.userId) {
          await createUserNotification({
            userId: existing.userId,
            type: "VERIFICATION",
            title: "Subscription cancelled",
            body: "Your paid subscription was cancelled and moved to Free.",
            channel: "subscriptionNotices",
            metadata: { event: event.type },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as unknown as { subscription: string };
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubId: invoice.subscription },
          select: { userId: true },
        });
        await prisma.subscription.updateMany({
          where: { stripeSubId: invoice.subscription },
          data: { status: SubscriptionStatus.PAST_DUE },
        });

        if (existing?.userId) {
          await createUserNotification({
            userId: existing.userId,
            type: "VERIFICATION",
            title: "Payment issue detected",
            body: "We could not process your payment. Please update your billing details.",
            channel: "subscriptionNotices",
            metadata: { event: event.type },
          });
        }
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
