import { createHash, timingSafeEqual } from "node:crypto";
import { Router, Request, Response } from "express";
import { BillingDiscrepancyType, BillingEventOutcome, BillingProvider, Prisma, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { getStripe, getPlanFromPriceId, isStripeConfigured } from "../lib/stripe.js";
import prisma from "../lib/prisma.js";
import { updateStripeCountry } from "../lib/billing/region-resolver.js";
import { createUserNotification } from "../lib/notifications.js";
import { redisClient } from "../lib/redis.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { pushDeadLetter } from "../lib/ops/resilience.js";
import { getFlutterwaveSecretHash, verifyFlutterwaveTransaction } from "../lib/flutterwave.js";
import {
  mapStripeSubscriptionStatus,
  recordBillingEvent,
  syncBillingEntitlementState,
  upsertBillingDiscrepancy,
} from "../lib/billing/index.js";

const router = Router();

const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;
const STRIPE_SUPPORTED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "payment_method.attached",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
  "invoice.payment_succeeded",
  "charge.refunded",
  "refund.created",
  "refund.updated",
]);
const STRIPE_LIFECYCLE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
  "invoice.payment_succeeded",
]);

const STRIPE_LIFECYCLE_PRIORITY: Record<SubscriptionStatus, number> = {
  [SubscriptionStatus.ACTIVE]: 10,
  [SubscriptionStatus.PAST_DUE]: 20,
  [SubscriptionStatus.INACTIVE]: 20,
  [SubscriptionStatus.CANCELLED]: 30,
};

type LifecycleApplyResult =
  | { applied: true; subscriptionId: string }
  | { applied: false; reason: "stale" | "same_or_lower_priority" };

function getStripeLifecyclePriority(eventType: string, status: SubscriptionStatus): number {
  if (!STRIPE_LIFECYCLE_EVENT_TYPES.has(eventType)) {
    throw new Error(`Stripe event ${eventType} is not a subscription lifecycle event`);
  }
  return STRIPE_LIFECYCLE_PRIORITY[status];
}

/**
 * Atomically compare and apply a Stripe subscription transition. Exact event
 * identity is reserved separately; this guard orders distinct events for the
 * same subscription. Event IDs only break a true timestamp-and-priority tie,
 * never establish provider chronology.
 */
async function applyStripeLifecycleTransition(input: {
  subscriptionId: string;
  eventId: string;
  eventType: string;
  occurredAt: Date;
  status: SubscriptionStatus;
  data: Prisma.SubscriptionUpdateManyMutationInput;
}): Promise<LifecycleApplyResult> {
  const priority = getStripeLifecyclePriority(input.eventType, input.status);

  return prisma.$transaction(async (tx) => {
    const result = await tx.subscription.updateMany({
      where: {
        id: input.subscriptionId,
        OR: [
          { stripeLifecycleOccurredAt: null },
          { stripeLifecycleOccurredAt: { lt: input.occurredAt } },
          {
            stripeLifecycleOccurredAt: input.occurredAt,
            stripeLifecyclePriority: { lt: priority },
          },
          {
            stripeLifecycleOccurredAt: input.occurredAt,
            stripeLifecyclePriority: priority,
            OR: [
              { stripeLifecycleEventId: null },
              { stripeLifecycleEventId: { lt: input.eventId } },
            ],
          },
        ],
      },
      data: {
        ...input.data,
        stripeLifecycleOccurredAt: input.occurredAt,
        stripeLifecyclePriority: priority,
        stripeLifecycleEventId: input.eventId,
      },
    });

    if (result.count === 1) {
      return { applied: true, subscriptionId: input.subscriptionId };
    }

    return { applied: false, reason: "stale" };
  });
}

function hasFreshStripeSignatureTimestamp(signature: unknown): boolean {
  if (typeof signature !== "string") return false;

  const timestamps = signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("t="))
    .map((part) => part.slice(2));

  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0])) return false;

  const timestamp = Number(timestamps[0]);
  if (!Number.isSafeInteger(timestamp)) return false;

  return Math.abs(Math.floor(Date.now() / 1000) - timestamp) <= STRIPE_WEBHOOK_TOLERANCE_SECONDS;
}

function parseRawJsonBody(req: Request): Record<string, unknown> | null {
  if (!req.body) {
    return null;
  }

  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }

  return null;
}

async function reserveEventId(provider: BillingProvider, eventId: string): Promise<boolean> {
  const key = `${provider}:${eventId}`;

  try {
    await prisma.billingWebhookIdempotencyKey.create({
      data: {
        key,
        provider,
        eventId,
        expiresAt: new Date(Date.now() + WEBHOOK_IDEMPOTENCY_TTL_SECONDS * 1000),
      },
    });
  } catch (error) {
    const target = error instanceof Prisma.PrismaClientKnownRequestError
      ? error.meta?.target
      : undefined;
    const targetValues = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
    const isIdempotencyKeyConflict = targetValues.some((value) =>
      value === "key" || value.toLowerCase().includes("billingwebhookidempotencykey_key"),
    );
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && isIdempotencyKeyConflict) {
      return false;
    }
    throw error;
  }

  if (redisClient) {
    await redisClient.set(
      `idempotency:${key}`,
      new Date().toISOString(),
      "EX",
      WEBHOOK_IDEMPOTENCY_TTL_SECONDS,
    ).catch(() => undefined);
  }

  return true;
}

/**
 * Release a previously reserved idempotency key so the provider's retry (or a
 * manual redelivery) can re-process the event. Call this when processing fails
 * AFTER the key was reserved — otherwise the reservation permanently swallows
 * the retry and, e.g., a charged-but-not-activated subscription is never
 * reconciled automatically.
 */
async function releaseEventId(provider: BillingProvider, eventId: string): Promise<void> {
  const key = `${provider}:${eventId}`;
  try {
    await prisma.billingWebhookIdempotencyKey.delete({ where: { key } });
  } catch {
    // Preserve the processing failure; an operator can reconcile a stranded
    // reservation without exposing provider or database details to Stripe.
  }
  if (redisClient) {
    try {
      await redisClient.del(`idempotency:${key}`);
    } catch {
      // Redis is a secondary cache; the database reservation is authoritative.
    }
  }
}

/**
 * Flutterwave returns `card.country` as values like "NIGERIA NG" (country name +
 * ISO code), but UserBillingProfile.country/stripeCountry are VARCHAR(2) ISO
 * alpha-2. Persisting the raw value overflows the column and makes the webhook
 * fail — leaving a paid customer un-activated. Extract the 2-letter code (or
 * null) so activation is never blocked by the country string.
 */
export function normalizeCardCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const codes = upper.split(/[^A-Z]+/).filter((token) => /^[A-Z]{2}$/.test(token));
  return codes.length > 0 ? codes[codes.length - 1] : null;
}

async function activateFlutterwaveSubscription(input: {
  userId: string;
  plan: SubscriptionPlan;
  txRef: string;
  transactionId: number;
  amountMinor: number;
  currency: string;
  billingRegion: "AFRICA" | "EUROPE" | "ROW" | null;
  customerEmail?: string | null;
  customerId?: string | null;
  cardCountry?: string | null;
  rawPayload: Prisma.InputJsonValue;
}) {
  const subscription = await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      plan: input.plan,
      status: SubscriptionStatus.ACTIVE,
      billingProvider: BillingProvider.FLUTTERWAVE,
      providerCustomerId: input.customerId ?? undefined,
      providerSubscriptionId: input.txRef,
    },
    update: {
      plan: input.plan,
      status: SubscriptionStatus.ACTIVE,
      billingProvider: BillingProvider.FLUTTERWAVE,
      ...(input.customerId && { providerCustomerId: input.customerId }),
      providerSubscriptionId: input.txRef,
    },
  });

  if (input.cardCountry) {
    await prisma.userBillingProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        country: input.cardCountry,
        stripeCountry: input.cardCountry,
        region: input.billingRegion ?? "AFRICA",
        currency: input.currency.toUpperCase(),
      },
      update: {
        country: input.cardCountry,
        stripeCountry: input.cardCountry,
        currency: input.currency.toUpperCase(),
      },
    });
  }

  await syncBillingEntitlementState(input.userId, "flutterwave_webhook_success");
  await recordBillingEvent({
    userId: input.userId,
    subscriptionId: subscription.id,
    source: "FLUTTERWAVE_WEBHOOK",
    eventId: input.txRef,
    eventType: "charge.completed",
    outcome: BillingEventOutcome.PROCESSED,
    plan: input.plan,
    status: SubscriptionStatus.ACTIVE,
    billingRegion: input.billingRegion,
    currency: input.currency,
    amountMinor: input.amountMinor,
    reasonCode: "flutterwave_charge_success",
    metadata: {
      provider: BillingProvider.FLUTTERWAVE,
      flutterwaveTransactionId: input.transactionId,
      txRef: input.txRef,
      customerEmail: input.customerEmail ?? null,
      cardCountry: input.cardCountry ?? null,
    },
    rawPayload: input.rawPayload,
    processedAt: new Date(),
  });
}

// Constant-time comparison of the verif-hash header against the configured
// secret. Both sides are SHA-256 digested first so inputs of different
// lengths can be compared without leaking length information.
function isValidFlutterwaveSignature(signature: unknown, secretHash: string): boolean {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const a = createHash("sha256").update(signature).digest();
  const b = createHash("sha256").update(secretHash).digest();
  return timingSafeEqual(a, b);
}

// POST /api/webhooks/flutterwave
// SECURITY: fail closed. If FLUTTERWAVE_SECRET_HASH is not configured, every
// request is rejected (503) — we never process an unauthenticated webhook.
// See config/env.ts for the matching startup fail-fast in production/staging.
router.post("/flutterwave", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const secretHash = getFlutterwaveSecretHash();

  if (!secretHash) {
    console.error("[webhook] FLUTTERWAVE_SECRET_HASH not set — rejecting Flutterwave webhook");
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        provider: "flutterwave",
        reason: "webhook_secret_missing",
      },
    });
    res.status(503).json({ error: "Flutterwave webhook is not configured" });
    return;
  }

  if (!isValidFlutterwaveSignature(req.headers["verif-hash"], secretHash)) {
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
      details: {
        provider: "flutterwave",
        reason: "invalid_signature",
      },
    });
    res.status(401).json({ error: "Invalid Flutterwave signature" });
    return;
  }

  const payload = parseRawJsonBody(req);
  if (!payload) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  const event = typeof payload.event === "string" ? payload.event : null;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const rawEventId = typeof data.tx_ref === "string"
    ? data.tx_ref
    : typeof data.id === "number"
      ? String(data.id)
      : null;

  if (!rawEventId) {
    res.status(202).json({ received: true, ignored: true });
    return;
  }

  const reserved = await reserveEventId(BillingProvider.FLUTTERWAVE, rawEventId);
  if (!reserved) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    if (event === "charge.completed" && typeof data.id === "number") {
      const verified = await verifyFlutterwaveTransaction(data.id);
      const txRef = verified.tx_ref;
      const checkoutEvent = txRef
        ? await prisma.billingEventAudit.findFirst({
            where: { eventId: txRef, source: "FLUTTERWAVE_CHECKOUT" },
            orderBy: { createdAt: "desc" },
          })
        : null;
      const checkoutMetadata = (checkoutEvent?.metadata ?? {}) as Record<string, unknown>;
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const customerEmail = typeof customer.email === "string" ? customer.email : undefined;
      const user = checkoutEvent?.userId
        ? { id: checkoutEvent.userId }
        : customerEmail
          ? await prisma.user.findUnique({
              where: { email: customerEmail },
              select: { id: true },
            })
          : null;

      if (!user?.id) {
        await recordBillingEvent({
          source: "FLUTTERWAVE_WEBHOOK",
          eventId: txRef ?? String(data.id),
          eventType: event,
          outcome: BillingEventOutcome.FAILED,
          reasonCode: "user_not_found",
          rawPayload: payload as Prisma.InputJsonValue,
          processedAt: new Date(),
        }).catch(() => undefined);
        res.status(202).json({ received: true, ignored: true });
        return;
      }

      if (verified.status.toLowerCase() === "successful") {
        if (!checkoutEvent?.userId || verified.tx_ref !== txRef) {
          await recordBillingEvent({
            source: "FLUTTERWAVE_WEBHOOK",
            eventId: txRef ?? String(data.id),
            eventType: event,
            outcome: BillingEventOutcome.FAILED,
            reasonCode: "checkout_reference_not_found",
            message: "Successful Flutterwave webhook did not match a stored checkout reference",
            rawPayload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          }).catch(() => undefined);
          res.status(202).json({ received: true, ignored: true });
          return;
        }

        const plan = (checkoutEvent.plan as SubscriptionPlan | null)
          ?? (checkoutMetadata.plan as SubscriptionPlan | undefined);

        if (!plan) {
          await recordBillingEvent({
            userId: checkoutEvent.userId,
            source: "FLUTTERWAVE_WEBHOOK",
            eventId: txRef,
            eventType: event,
            outcome: BillingEventOutcome.FAILED,
            reasonCode: "checkout_plan_missing",
            message: "Stored Flutterwave checkout reference is missing plan metadata",
            rawPayload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          }).catch(() => undefined);
          res.status(202).json({ received: true, ignored: true });
          return;
        }

        if (checkoutEvent.amountMinor !== null && Math.round(verified.amount * 100) !== checkoutEvent.amountMinor) {
          await recordBillingEvent({
            userId: checkoutEvent.userId,
            source: "FLUTTERWAVE_WEBHOOK",
            eventId: txRef,
            eventType: event,
            outcome: BillingEventOutcome.FAILED,
            reasonCode: "checkout_amount_mismatch",
            message: "Verified Flutterwave amount does not match checkout reference",
            rawPayload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          }).catch(() => undefined);
          res.status(202).json({ received: true, ignored: true });
          return;
        }

        if (checkoutEvent.currency && verified.currency.toUpperCase() !== checkoutEvent.currency.toUpperCase()) {
          await recordBillingEvent({
            userId: checkoutEvent.userId,
            source: "FLUTTERWAVE_WEBHOOK",
            eventId: txRef,
            eventType: event,
            outcome: BillingEventOutcome.FAILED,
            reasonCode: "checkout_currency_mismatch",
            message: "Verified Flutterwave currency does not match checkout reference",
            rawPayload: payload as Prisma.InputJsonValue,
            processedAt: new Date(),
          }).catch(() => undefined);
          res.status(202).json({ received: true, ignored: true });
          return;
        }

        const card = (verified.card ?? {}) as Record<string, unknown>;
        await activateFlutterwaveSubscription({
          userId: user.id,
          plan,
          txRef,
          transactionId: verified.id,
          amountMinor: Math.round(verified.amount * 100),
          currency: verified.currency,
          billingRegion: (checkoutMetadata.billingRegion as "AFRICA" | "EUROPE" | "ROW" | null) ?? "AFRICA",
          customerEmail,
          customerId: verified.customer?.id ? String(verified.customer.id) : null,
          cardCountry: normalizeCardCountry(card.country),
          rawPayload: payload as Prisma.InputJsonValue,
        });
      } else {
        const existingSubscription = await prisma.subscription.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });
        await recordBillingEvent({
          userId: user.id,
          subscriptionId: existingSubscription?.id ?? null,
          source: "FLUTTERWAVE_WEBHOOK",
          eventId: txRef ?? String(data.id),
          eventType: event,
          outcome: BillingEventOutcome.FAILED,
          status: SubscriptionStatus.PAST_DUE,
          currency: verified.currency,
          amountMinor: Math.round(verified.amount * 100),
          reasonCode: "flutterwave_charge_failed",
          rawPayload: payload as Prisma.InputJsonValue,
          processedAt: new Date(),
        });
      }
    }

    if (event === "subscription.cancelled") {
      const customer = (data.customer ?? {}) as Record<string, unknown>;
      const providerCustomerId = customer.id === undefined || customer.id === null
        ? null
        : String(customer.id);

      // The payload email is diagnostic-only: a signed event must still bind
      // to the customer ID recorded during our verified checkout flow. This
      // prevents a provider payload (or a future integration mistake) from
      // selecting an AfriTalent account by a mutable email address.
      if (providerCustomerId) {
        const subscription = await prisma.subscription.findFirst({
          where: {
            billingProvider: BillingProvider.FLUTTERWAVE,
            providerCustomerId,
          },
          select: { id: true, userId: true },
        });

        if (subscription) {
          // Re-check the binding in the write predicate. A concurrent billing
          // update that changes or removes it must not receive entitlement or
          // audit side effects for this cancellation event.
          const update = await prisma.subscription.updateMany({
            where: {
              id: subscription.id,
              billingProvider: BillingProvider.FLUTTERWAVE,
              providerCustomerId,
            },
            data: {
              status: SubscriptionStatus.CANCELLED,
              plan: SubscriptionPlan.FREE,
            },
          });

          if (update.count === 1) {
            await syncBillingEntitlementState(subscription.userId, "flutterwave_subscription_cancelled");
            await recordBillingEvent({
              userId: subscription.userId,
              subscriptionId: subscription.id,
              source: "FLUTTERWAVE_WEBHOOK",
              eventId: rawEventId,
              eventType: event,
              outcome: BillingEventOutcome.PROCESSED,
              plan: SubscriptionPlan.FREE,
              status: SubscriptionStatus.CANCELLED,
              reasonCode: "flutterwave_subscription_cancelled",
              rawPayload: payload as Prisma.InputJsonValue,
              processedAt: new Date(),
            });
          }
        }
      }
    }

    recordOpsEvent({
      metricName: "billing_checkout_success",
      category: "billing",
      durationMs: Date.now() - startedAt,
      details: {
        provider: "flutterwave",
        event,
      },
    });
    res.status(200).json({ received: true });
  } catch (error) {
    // Processing failed after the idempotency key was reserved. Release it so
    // Flutterwave's retry (this response is a 500) can re-activate the charge —
    // otherwise a charged customer is left unactivated until manual reconcile.
    await releaseEventId(BillingProvider.FLUTTERWAVE, rawEventId).catch(() => undefined);

    await pushDeadLetter({
      category: "webhook",
      source: "flutterwave",
      reasonCode: "flutterwave_webhook_processing_failed",
      error,
      payload,
      retryable: true,
    }).catch(() => undefined);

    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// POST /api/webhooks/stripe
// IMPORTANT: This route MUST be registered BEFORE express.json() in server.ts
// because Stripe signature verification requires the raw request body.
router.post("/stripe", async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isStripeConfigured()) {
    console.error("[webhook] STRIPE_SECRET_KEY not set");
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
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET not set");
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "webhook_secret_missing",
      },
    });
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "invalid_signature",
      },
    });
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  // Stripe's SDK rejects timestamps that are too old, but a valid signature
  // with a far-future timestamp must also fail closed to prevent delayed replay.
  if (!hasFreshStripeSignatureTimestamp(sig)) {
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "warning",
      durationMs: Date.now() - startedAt,
      details: { reason: "stripe_signature_timestamp_out_of_range" },
    });
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  if (!STRIPE_SUPPORTED_EVENT_TYPES.has(event.type)) {
    recordOpsEvent({
      metricName: "billing_webhook_ignored",
      category: "billing",
      durationMs: Date.now() - startedAt,
      details: { event_type: event.type },
    });
    res.json({ received: true, ignored: true });
    return;
  }

  // A true return means this request created the durable reservation.
  let reservationAcquired = false;
  let processingCompleted = false;
  const reservationCreated = await reserveEventId(BillingProvider.STRIPE, event.id);
  if (!reservationCreated) {
    await recordBillingEvent({
      source: "STRIPE_WEBHOOK",
      eventId: event.id,
      eventType: event.type,
      outcome: BillingEventOutcome.DUPLICATE,
      rawPayload: event as unknown as Prisma.InputJsonValue,
      occurredAt: new Date(event.created * 1000),
      processedAt: new Date(),
      reasonCode: "duplicate_webhook_event",
    }).catch(() => undefined);
    recordOpsEvent({
      metricName: "billing_checkout_duplicate",
      category: "billing",
      outcome: "duplicate",
      durationMs: Date.now() - startedAt,
      details: {
        event_type: event.type,
      },
    });
    res.json({ received: true, duplicate: true });
    return;
  }
  reservationAcquired = true;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as unknown as {
          customer: string;
          subscription: string;
          invoice?: string | null;
          payment_intent?: string | null;
          amount_total?: number | null;
          currency?: string | null;
          customer_details?: {
            address?: { country?: string | null };
            tax_ids?: Array<{ type?: string | null; value?: string | null }>;
          };
          metadata: { userId: string; plan: string; billingRegion?: "AFRICA" | "EUROPE" | "ROW" };
        };
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan as SubscriptionPlan | undefined;

        if (userId && plan) {
          const trustedSubscription = await prisma.subscription.findFirst({
            where: {
              userId,
              billingProvider: BillingProvider.STRIPE,
              OR: [
                { stripeCustomerId: session.customer },
                { providerCustomerId: session.customer },
              ],
            },
            select: { id: true },
          });

          if (!trustedSubscription) {
            recordOpsEvent({
              metricName: "billing_webhook_rejected",
              category: "billing",
              outcome: "failure",
              severity: "warning",
              durationMs: Date.now() - startedAt,
              details: { reason: "checkout_customer_binding_missing" },
            });
            break;
          }

          const lifecycle = await applyStripeLifecycleTransition({
            subscriptionId: trustedSubscription.id,
            eventId: event.id,
            eventType: event.type,
            occurredAt: new Date(event.created * 1000),
            status: SubscriptionStatus.ACTIVE,
            data: {
              billingProvider: BillingProvider.STRIPE,
              providerCustomerId: session.customer,
              providerSubscriptionId: session.subscription,
              stripeCustomerId: session.customer,
              stripeSubId: session.subscription,
              plan,
              status: "ACTIVE",
            },
          });
          if (!lifecycle.applied) break;

          const taxId = session.customer_details?.tax_ids?.[0];
          if (taxId?.type || taxId?.value || session.customer_details?.address?.country) {
            await prisma.userBillingProfile.upsert({
              where: { userId },
              create: {
                userId,
                country: session.customer_details?.address?.country?.toUpperCase() ?? null,
                region: session.metadata?.billingRegion ?? "ROW",
                currency: session.currency?.toUpperCase() ?? "USD",
                taxIdType: taxId?.type ?? null,
                taxIdValue: taxId?.value ?? null,
              },
              update: {
                ...(session.customer_details?.address?.country && {
                  country: session.customer_details.address.country.toUpperCase(),
                }),
                ...(session.currency && { currency: session.currency.toUpperCase() }),
                ...(taxId?.type && { taxIdType: taxId.type }),
                ...(taxId?.value && { taxIdValue: taxId.value }),
              },
            });
          }

          await syncBillingEntitlementState(userId, "webhook_checkout_completed");
          await recordBillingEvent({
            userId,
            subscriptionId: lifecycle.subscriptionId,
            source: "STRIPE_WEBHOOK",
            eventId: event.id,
            eventType: event.type,
            outcome: BillingEventOutcome.PROCESSED,
            plan,
            status: "ACTIVE",
            billingRegion: session.metadata?.billingRegion ?? null,
            currency: session.currency ?? null,
            amountMinor: session.amount_total ?? null,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            stripeInvoiceId: session.invoice ?? null,
            stripePaymentIntentId: session.payment_intent ?? null,
            metadata: {
              billingCountry: session.customer_details?.address?.country ?? null,
              taxIdType: taxId?.type ?? null,
            },
            rawPayload: event as unknown as Prisma.InputJsonValue,
            occurredAt: new Date(event.created * 1000),
            processedAt: new Date(),
          });

          await createUserNotification({
            userId,
            type: "VERIFICATION",
            title: "Subscription activated",
            body: `Your ${plan.toLowerCase().replaceAll("_", " ")} plan is now active.`,
            channel: "subscriptionNotices",
            metadata: { event: event.type, plan },
          });
          recordOpsEvent({
            metricName: "billing_checkout_success",
            category: "billing",
            durationMs: Date.now() - startedAt,
            details: {
              event_type: event.type,
              plan,
            },
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
            await recordBillingEvent({
              userId: sub.userId,
              source: "STRIPE_WEBHOOK",
              eventId: event.id,
              eventType: event.type,
              outcome: BillingEventOutcome.PROCESSED,
              stripeCustomerId: pm.customer,
              metadata: {
                stripeCountry: pm.card.country,
              },
              rawPayload: event as unknown as Prisma.InputJsonValue,
              occurredAt: new Date(event.created * 1000),
              processedAt: new Date(),
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as {
          id: string;
          status: string;
          current_period_end?: number | null;
          items: { data: Array<{ price: { id: string }; current_period_end?: number | null }> };
        };
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? getPlanFromPriceId(priceId) : undefined;
        const status = mapStripeSubscriptionStatus(sub.status);
        // Stripe moved current_period_end onto the subscription item in newer
        // API versions; fall back to the (legacy) top-level field. Guard against
        // undefined so we never persist an Invalid Date.
        const periodEndUnix = sub.items.data[0]?.current_period_end ?? sub.current_period_end;
        const currentPeriodEnd = typeof periodEndUnix === "number" && Number.isFinite(periodEndUnix)
          ? new Date(periodEndUnix * 1000)
          : null;
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubId: sub.id },
          select: { userId: true, id: true },
        });

        if (!existing) break;
        const lifecycle = await applyStripeLifecycleTransition({
          subscriptionId: existing.id,
          eventId: event.id,
          eventType: event.type,
          occurredAt: new Date(event.created * 1000),
          status,
          data: {
            ...(plan && { plan }),
            status,
            ...(currentPeriodEnd && { currentPeriodEnd }),
          },
        });
        if (!lifecycle.applied) break;

        if (existing.userId) {
          await syncBillingEntitlementState(existing.userId, "webhook_subscription_updated");
          await recordBillingEvent({
            userId: existing.userId,
            subscriptionId: existing.id,
            source: "STRIPE_WEBHOOK",
            eventId: event.id,
            eventType: event.type,
            outcome: BillingEventOutcome.PROCESSED,
            plan: plan ?? null,
            status,
            stripeSubscriptionId: sub.id,
            metadata: {
              stripePriceId: priceId ?? null,
            },
            rawPayload: event as unknown as Prisma.InputJsonValue,
            occurredAt: new Date(event.created * 1000),
            processedAt: new Date(),
          });
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
          select: { userId: true, id: true },
        });
        if (!existing) break;
        const lifecycle = await applyStripeLifecycleTransition({
          subscriptionId: existing.id,
          eventId: event.id,
          eventType: event.type,
          occurredAt: new Date(event.created * 1000),
          status: SubscriptionStatus.CANCELLED,
          data: {
            status: "CANCELLED",
            plan: "FREE",
          },
        });
        if (!lifecycle.applied) break;

        if (existing.userId) {
          await syncBillingEntitlementState(existing.userId, "webhook_subscription_deleted");
          await recordBillingEvent({
            userId: existing.userId,
            subscriptionId: existing.id,
            source: "STRIPE_WEBHOOK",
            eventId: event.id,
            eventType: event.type,
            outcome: BillingEventOutcome.PROCESSED,
            plan: "FREE",
            status: "CANCELLED",
            stripeSubscriptionId: sub.id,
            rawPayload: event as unknown as Prisma.InputJsonValue,
            occurredAt: new Date(event.created * 1000),
            processedAt: new Date(),
          });
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
        const invoice = event.data.object as unknown as {
          id: string;
          customer?: string | null;
          subscription: string;
          payment_intent?: string | null;
          amount_due?: number | null;
          currency?: string | null;
          attempt_count?: number | null;
          next_payment_attempt?: number | null;
        };
        const existing = await prisma.subscription.findFirst({
          where: { stripeSubId: invoice.subscription },
          select: { userId: true, id: true, plan: true },
        });
        if (!existing) break;
        const lifecycle = await applyStripeLifecycleTransition({
          subscriptionId: existing.id,
          eventId: event.id,
          eventType: event.type,
          occurredAt: new Date(event.created * 1000),
          status: SubscriptionStatus.PAST_DUE,
          data: { status: "PAST_DUE" },
        });
        if (!lifecycle.applied) break;

        if (existing.userId) {
          await syncBillingEntitlementState(existing.userId, "webhook_invoice_payment_failed");
          const auditEvent = await recordBillingEvent({
            userId: existing.userId,
            subscriptionId: existing.id,
            source: "STRIPE_WEBHOOK",
            eventId: event.id,
            eventType: event.type,
            outcome: BillingEventOutcome.PROCESSED,
            plan: existing.plan,
            status: "PAST_DUE",
            currency: invoice.currency ?? null,
            amountMinor: invoice.amount_due ?? null,
            stripeCustomerId: invoice.customer ?? null,
            stripeSubscriptionId: invoice.subscription,
            stripeInvoiceId: invoice.id,
            stripePaymentIntentId: invoice.payment_intent ?? null,
            reasonCode: "invoice_payment_failed",
            metadata: {
              attemptCount: invoice.attempt_count ?? null,
              nextPaymentAttempt: invoice.next_payment_attempt ?? null,
            },
            rawPayload: event as unknown as Prisma.InputJsonValue,
            occurredAt: new Date(event.created * 1000),
            processedAt: new Date(),
          });
          await upsertBillingDiscrepancy({
            userId: existing.userId,
            subscriptionId: existing.id,
            billingEventId: auditEvent.id,
            type: BillingDiscrepancyType.PAYMENT_FAILURE,
            severity: "HIGH",
            title: "Payment retry is required for a past-due subscription",
            reasonCode: "invoice_payment_failed",
            dueAt: invoice.next_payment_attempt
              ? new Date(invoice.next_payment_attempt * 1000)
              : null,
            details: {
              attemptCount: invoice.attempt_count ?? null,
              nextPaymentAttempt: invoice.next_payment_attempt ?? null,
              amountDue: invoice.amount_due ?? null,
              currency: invoice.currency ?? null,
            },
          });
          await createUserNotification({
            userId: existing.userId,
            type: "VERIFICATION",
            title: "Payment issue detected",
            body: "We could not process your payment. Please update your billing details.",
            channel: "subscriptionNotices",
            metadata: { event: event.type },
          });
        }
        recordOpsEvent({
          metricName: "billing_checkout_failure",
          category: "billing",
          outcome: "failure",
          severity: "warning",
          durationMs: Date.now() - startedAt,
          details: {
            event_type: event.type,
            reason: "invoice_payment_failed",
          },
        });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as unknown as {
          id: string;
          customer?: string | null;
          subscription?: string | null;
          payment_intent?: string | null;
          amount_paid?: number | null;
          currency?: string | null;
        };

        if (invoice.subscription) {
          const existing = await prisma.subscription.findFirst({
            where: { stripeSubId: invoice.subscription },
            select: { userId: true, id: true, plan: true },
          });

          if (!existing) break;
          const lifecycle = await applyStripeLifecycleTransition({
            subscriptionId: existing.id,
            eventId: event.id,
            eventType: event.type,
            occurredAt: new Date(event.created * 1000),
            status: SubscriptionStatus.ACTIVE,
            data: { status: "ACTIVE" },
          });
          if (!lifecycle.applied) break;

          if (existing.userId) {
            await syncBillingEntitlementState(existing.userId, "webhook_invoice_paid");
            const auditEvent = await recordBillingEvent({
              userId: existing.userId,
              subscriptionId: existing.id,
              source: "STRIPE_WEBHOOK",
              eventId: event.id,
              eventType: event.type,
              outcome: BillingEventOutcome.PROCESSED,
              plan: existing.plan,
              status: "ACTIVE",
              currency: invoice.currency ?? null,
              amountMinor: invoice.amount_paid ?? null,
              stripeCustomerId: invoice.customer ?? null,
              stripeSubscriptionId: invoice.subscription,
              stripeInvoiceId: invoice.id,
              stripePaymentIntentId: invoice.payment_intent ?? null,
              rawPayload: event as unknown as Prisma.InputJsonValue,
              occurredAt: new Date(event.created * 1000),
              processedAt: new Date(),
            });

            await prisma.billingDiscrepancy.updateMany({
              where: {
                userId: existing.userId,
                type: {
                  in: [BillingDiscrepancyType.PAYMENT_FAILURE, BillingDiscrepancyType.UNPAID_BUT_ENTITLED],
                },
                status: {
                  in: ["OPEN", "ACKNOWLEDGED"],
                },
              },
              data: {
                status: "RESOLVED",
                resolvedAt: new Date(),
                lastSeenAt: new Date(),
              },
            });

            await recordBillingEvent({
              userId: existing.userId,
              subscriptionId: existing.id,
              source: "SYSTEM",
              eventType: "billing.payment_recovered",
              outcome: BillingEventOutcome.RECONCILED,
              plan: existing.plan,
              status: "ACTIVE",
              stripeInvoiceId: invoice.id,
              billingRegion: null,
              rawPayload: {
                recoveredFromEventId: auditEvent.id,
              },
              processedAt: new Date(),
            });
          }
        }

        break;
      }

      case "charge.refunded":
      case "refund.created":
      case "refund.updated": {
        const refund = event.data.object as unknown as {
          id: string;
          charge?: string | null;
          payment_intent?: string | null;
          metadata?: { userId?: string; subscriptionId?: string };
          amount?: number | null;
          currency?: string | null;
          status?: string | null;
        };

        const existing = refund.metadata?.subscriptionId
          ? await prisma.subscription.findUnique({
              where: { id: refund.metadata.subscriptionId },
              select: { id: true, userId: true, plan: true },
            })
          : refund.metadata?.userId
            ? await prisma.subscription.findUnique({
                where: { userId: refund.metadata.userId },
                select: { id: true, userId: true, plan: true },
              })
            : null;

        const auditEvent = await recordBillingEvent({
          userId: existing?.userId ?? refund.metadata?.userId ?? null,
          subscriptionId: existing?.id ?? refund.metadata?.subscriptionId ?? null,
          source: "STRIPE_WEBHOOK",
          eventId: event.id,
          eventType: event.type,
          outcome: BillingEventOutcome.PROCESSED,
          plan: existing?.plan ?? null,
          currency: refund.currency ?? null,
          amountMinor: refund.amount ?? null,
          stripeRefundId: refund.id,
          stripePaymentIntentId: refund.payment_intent ?? null,
          stripeChargeId: refund.charge ?? null,
          reasonCode: refund.status ?? null,
          rawPayload: event as unknown as Prisma.InputJsonValue,
          occurredAt: new Date(event.created * 1000),
          processedAt: new Date(),
        });

        if (refund.status === "pending" || refund.status === "requires_action") {
          await upsertBillingDiscrepancy({
            userId: existing?.userId ?? refund.metadata?.userId ?? null,
            subscriptionId: existing?.id ?? refund.metadata?.subscriptionId ?? null,
            billingEventId: auditEvent.id,
            type: BillingDiscrepancyType.PENDING_REFUND,
            severity: "MEDIUM",
            title: "Refund is pending completion",
            reasonCode: refund.status ?? "refund_pending",
            details: {
              stripeRefundId: refund.id,
              amount: refund.amount ?? null,
              currency: refund.currency ?? null,
            },
          });
        }

        if (refund.status === "succeeded" && (existing?.userId || refund.metadata?.userId)) {
          await prisma.billingDiscrepancy.updateMany({
            where: {
              userId: existing?.userId ?? refund.metadata?.userId ?? undefined,
              type: BillingDiscrepancyType.PENDING_REFUND,
              status: {
                in: ["OPEN", "ACKNOWLEDGED"],
              },
            },
            data: {
              status: "RESOLVED",
              resolvedAt: new Date(),
              lastSeenAt: new Date(),
            },
          });
        }
        break;
      }

      default:
        // Event types are allowlisted before idempotency reservation.
        }

    processingCompleted = true;
    res.json({ received: true });
  } catch (error) {
    if (reservationAcquired && !processingCompleted) {
      await releaseEventId(BillingProvider.STRIPE, event.id).catch(() => undefined);
    }
    console.error("[webhook] Handler error:", error);
    const failedAudit = await recordBillingEvent({
      source: "STRIPE_WEBHOOK",
      eventId: event.id,
      eventType: event.type,
      outcome: BillingEventOutcome.FAILED,
      reasonCode: "stripe_webhook_handler_failed",
      message: error instanceof Error ? error.message : "Unknown webhook handler error",
      rawPayload: event as unknown as Prisma.InputJsonValue,
      occurredAt: new Date(event.created * 1000),
      processedAt: new Date(),
    }).catch(() => null);
    if (failedAudit) {
      await upsertBillingDiscrepancy({
        billingEventId: failedAudit.id,
        type: BillingDiscrepancyType.WEBHOOK_FAILURE,
        severity: "HIGH",
        title: "Stripe webhook handler failed",
        reasonCode: "stripe_webhook_handler_failed",
        details: {
          eventId: event.id,
          eventType: event.type,
        },
      }).catch(() => undefined);
    }
    await pushDeadLetter({
      category: "webhook",
      source: "stripe",
      reasonCode: "stripe_webhook_handler_failed",
      error,
      payload: {
        eventId: event.id,
        eventType: event.type,
      },
    });
    recordOpsEvent({
      metricName: "billing_checkout_failure",
      category: "billing",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        event_type: event.type,
        reason: "handler_error",
      },
    });
    // The reservation was released before fallible reporting so Stripe can
    // safely retry the incomplete event.
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
