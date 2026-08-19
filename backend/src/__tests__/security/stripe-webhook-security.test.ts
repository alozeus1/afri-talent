import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  billingWebhookIdempotencyKey: { create: vi.fn(), delete: vi.fn() },
  subscription: { findFirst: vi.fn(), updateMany: vi.fn() },
  billingDiscrepancy: { updateMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
}));
const billing = vi.hoisted(() => ({
  recordBillingEvent: vi.fn(),
  syncBillingEntitlementState: vi.fn(),
  upsertBillingDiscrepancy: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ createUserNotification: vi.fn() }));
const ops = vi.hoisted(() => ({ recordOpsEvent: vi.fn() }));
const deadLetter = vi.hoisted(() => ({ pushDeadLetter: vi.fn() }));

vi.mock("../../lib/prisma.js", () => ({ default: db }));
vi.mock("../../lib/billing/index.js", () => billing);
vi.mock("../../lib/notifications.js", () => notifications);
vi.mock("../../lib/ops/events.js", () => ops);
vi.mock("../../lib/ops/resilience.js", () => deadLetter);
vi.mock("../../lib/redis.js", () => ({ redisClient: null }));
vi.mock("../../lib/billing/region-resolver.js", () => ({ updateStripeCountry: vi.fn() }));
vi.mock("../../lib/flutterwave.js", () => ({
  getFlutterwaveSecretHash: vi.fn(),
  verifyFlutterwaveTransaction: vi.fn(),
}));

import express from "express";
import request from "supertest";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";

const stripe = new Stripe(["sk", "test", "synthetic_webhook_security"].join("_"), { apiVersion: "2026-01-28.clover" });
vi.mock("../../lib/stripe.js", () => ({
  getStripe: () => stripe,
  getPlanFromPriceId: vi.fn(),
  isStripeConfigured: () => true,
}));

import router from "../../routes/webhooks.js";

const webhookSecret = ["whsec", "synthetic_stripe_webhook_security"].join("_");
const app = express();
app.use(express.raw({ type: "application/json", limit: "100kb" }));
app.use("/api/webhooks", router);

function signedPayload(payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    timestamp,
  });
}

describe("POST /api/webhooks/stripe raw signature integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret; // secret-scan:allow synthetic test value
    db.billingWebhookIdempotencyKey.create.mockResolvedValue({ key: "STRIPE:evt_synthetic_1" });
    db.subscription.findFirst.mockResolvedValue(null);
    db.subscription.updateMany.mockResolvedValue({ count: 1 });
    billing.recordBillingEvent.mockResolvedValue({ id: "billing-event-1" });
    deadLetter.pushDeadLetter.mockResolvedValue(undefined);
  });

  it("accepts a current SDK-signed raw payload", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_1",
      object: "event",
      created: 1_700_000_000,
      type: "payment_method.attached",
      data: { object: { id: "pm_synthetic", customer: "cus_synthetic" } },
    });

    const response = await request(app)
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .set("stripe-signature", signedPayload(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });
    expect(db.billingWebhookIdempotencyKey.create).toHaveBeenCalledOnce();
    expect(billing.recordBillingEvent).not.toHaveBeenCalled();
  });

  it("rejects a one-byte-altered payload signed for different raw bytes", async () => {
    const signed = JSON.stringify({
      id: "evt_synthetic_2",
      object: "event",
      created: 1_700_000_000,
      type: "test.synthetic_event",
      data: { object: { id: "synthetic-object" } },
    });
    const altered = signed.replace("synthetic-object", "synthetic-Object");

    const response = await request(app)
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .set("stripe-signature", signedPayload(signed))
      .send(altered);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid webhook signature" });
    expect(db.billingWebhookIdempotencyKey.create).not.toHaveBeenCalled();
    expect(billing.recordBillingEvent).not.toHaveBeenCalled();
    expect(billing.syncBillingEntitlementState).not.toHaveBeenCalled();
    expect(deadLetter.pushDeadLetter).not.toHaveBeenCalled();
  });

  it("rejects a validly signed timestamp far in the future", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_future",
      object: "event",
      created: 1_700_000_000,
      type: "test.synthetic_event",
      data: { object: { id: "synthetic-object" } },
    });

    const response = await request(app)
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .set("stripe-signature", signedPayload(payload, Math.floor(Date.now() / 1000) + 3600))
      .send(payload);

    expect(response.status).toBe(400);
    expect(db.billingWebhookIdempotencyKey.create).not.toHaveBeenCalled();
    expect(billing.recordBillingEvent).not.toHaveBeenCalled();
  });

  it("acknowledges an authentic unsupported event without persistence or billing side effects", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_unknown",
      object: "event",
      created: 1_700_000_000,
      type: "future.provider.event",
      data: { object: { id: "synthetic-object" } },
    });

    const response = await request(app)
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .set("stripe-signature", signedPayload(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(db.billingWebhookIdempotencyKey.create).not.toHaveBeenCalled();
    expect(billing.recordBillingEvent).not.toHaveBeenCalled();
    expect(billing.syncBillingEntitlementState).not.toHaveBeenCalled();
  });

  it("does not activate a user from checkout metadata without a matching stored Stripe customer", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_forged_metadata",
      object: "event",
      created: 1_700_000_000,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_synthetic",
          customer: "cus_other_account",
          subscription: "sub_other_account",
          metadata: { userId: "candidate-a", plan: "BASIC" },
        },
      },
    });

    const response = await request(app)
      .post("/api/webhooks/stripe")
      .set("content-type", "application/json")
      .set("stripe-signature", signedPayload(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(db.subscription.updateMany).not.toHaveBeenCalled();
    expect(billing.syncBillingEntitlementState).not.toHaveBeenCalled();
    expect(billing.recordBillingEvent).not.toHaveBeenCalled();
  });

  it("acknowledges an exact duplicate without repeating a trusted checkout transition", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_duplicate",
      object: "event",
      created: 1_700_000_000,
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_synthetic_duplicate",
        customer: "cus_candidate_a",
        subscription: "sub_candidate_a",
        metadata: { userId: "candidate-a", plan: "BASIC" },
      } },
    });
    db.subscription.findFirst.mockResolvedValueOnce({ id: "subscription-1" });

    const first = await request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload);
    expect(first.status).toBe(200);

    db.billingWebhookIdempotencyKey.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002", clientVersion: "test", meta: { target: ["key"] },
      }),
    );
    const duplicate = await request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload);

    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual({ received: true, duplicate: true });
    expect(db.subscription.updateMany).toHaveBeenCalledOnce();
    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
  });

  it("processes one of two concurrent deliveries and acknowledges the other as a duplicate", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_concurrent_duplicate",
      object: "event",
      created: 1_700_000_000,
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_synthetic_concurrent_duplicate",
        customer: "cus_candidate_a",
        subscription: "sub_candidate_a",
        metadata: { userId: "candidate-a", plan: "BASIC" },
      } },
    });
    const expectedKeyConflict = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002", clientVersion: "test", meta: { target: ["key"] },
    });
    let releaseFirstReservation: (() => void) | undefined;
    let firstReservationReached: (() => void) | undefined;
    const firstReservation = new Promise<void>((resolve) => { firstReservationReached = resolve; });
    const allowFirstReservation = new Promise<void>((resolve) => { releaseFirstReservation = resolve; });

    db.subscription.findFirst.mockResolvedValue({ id: "subscription-1" });
    db.billingWebhookIdempotencyKey.create
      .mockImplementationOnce(async () => {
        firstReservationReached?.();
        await allowFirstReservation;
        return { key: "STRIPE:evt_synthetic_concurrent_duplicate" };
      })
      .mockRejectedValueOnce(expectedKeyConflict);

    const winnerPromise = request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload)
      .then((response) => response);
    await firstReservation;
    const duplicatePromise = request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload)
      .then((response) => response);
    releaseFirstReservation?.();

    const [winner, duplicate] = await Promise.all([winnerPromise, duplicatePromise]);

    expect([winner.body, duplicate.body]).toContainEqual({ received: true });
    expect([winner.body, duplicate.body]).toContainEqual({ received: true, duplicate: true });
    expect(db.billingWebhookIdempotencyKey.create).toHaveBeenCalledTimes(2);
    expect(db.subscription.updateMany).toHaveBeenCalledOnce();
    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
    expect(db.billingWebhookIdempotencyKey.delete).not.toHaveBeenCalled();
    expect(deadLetter.pushDeadLetter).not.toHaveBeenCalled();
    expect(billing.upsertBillingDiscrepancy).not.toHaveBeenCalled();
  });

  it("ignores an older payment failure after a newer paid transition", async () => {
    const paid = JSON.stringify({
      id: "evt_paid_newer", object: "event", created: 1_700_000_200, type: "invoice.paid",
      data: { object: { id: "in_paid", customer: "cus_candidate_a", subscription: "sub_candidate_a" } },
    });
    const staleFailure = JSON.stringify({
      id: "evt_failed_older", object: "event", created: 1_700_000_100, type: "invoice.payment_failed",
      data: { object: { id: "in_failed", customer: "cus_candidate_a", subscription: "sub_candidate_a" } },
    });
    db.subscription.findFirst.mockResolvedValue({ id: "subscription-1", userId: "candidate-a", plan: "BASIC" });
    db.subscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const first = await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(paid)).send(paid);
    const second = await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(staleFailure)).send(staleFailure);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(db.billingWebhookIdempotencyKey.create).toHaveBeenCalledTimes(2);
    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
    expect(notifications.createUserNotification).not.toHaveBeenCalled();
    expect(db.subscription.updateMany).toHaveBeenCalledTimes(2);
    expect(db.subscription.updateMany.mock.calls[1][0].data.status).toBe("PAST_DUE");
  });

  it("does not restore access when an older paid event follows a newer payment failure", async () => {
    const failed = JSON.stringify({
      id: "evt_failed_newer", object: "event", created: 1_700_000_200, type: "invoice.payment_failed",
      data: { object: { id: "in_failed", customer: "cus_candidate_a", subscription: "sub_candidate_a" } },
    });
    const stalePaid = JSON.stringify({
      id: "evt_paid_older", object: "event", created: 1_700_000_100, type: "invoice.payment_succeeded",
      data: { object: { id: "in_paid", customer: "cus_candidate_a", subscription: "sub_candidate_a" } },
    });
    db.subscription.findFirst.mockResolvedValue({ id: "subscription-1", userId: "candidate-a", plan: "BASIC" });
    db.subscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(failed)).send(failed);
    await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(stalePaid)).send(stalePaid);

    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
    expect(notifications.createUserNotification).toHaveBeenCalledOnce();
    expect(db.subscription.updateMany).toHaveBeenCalledTimes(2);
  });

  it("keeps cancellation over an equal-timestamp active event", async () => {
    const cancelled = JSON.stringify({
      id: "evt_cancelled_same_time", object: "event", created: 1_700_000_200, type: "customer.subscription.deleted",
      data: { object: { id: "sub_candidate_a" } },
    });
    const active = JSON.stringify({
      id: "evt_active_same_time", object: "event", created: 1_700_000_200, type: "invoice.paid",
      data: { object: { id: "in_paid", customer: "cus_candidate_a", subscription: "sub_candidate_a" } },
    });
    db.subscription.findFirst.mockResolvedValue({ id: "subscription-1", userId: "candidate-a", plan: "BASIC" });
    db.subscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(cancelled)).send(cancelled);
    await request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
      .set("stripe-signature", signedPayload(active)).send(active);

    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
    expect(notifications.createUserNotification).toHaveBeenCalledOnce();
    const activePredicate = db.subscription.updateMany.mock.calls[1][0].where.OR;
    expect(activePredicate).toContainEqual({ stripeLifecycleOccurredAt: new Date(1_700_000_200 * 1000), stripeLifecyclePriority: { lt: 10 } });
  });

  it("does not treat an unrelated P2002 as a duplicate delivery", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_unrelated_constraint",
      object: "event",
      created: 1_700_000_000,
      type: "payment_method.attached",
      data: { object: { id: "pm_synthetic", customer: "cus_synthetic" } },
    });
    db.billingWebhookIdempotencyKey.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unrelated unique conflict", {
        code: "P2002", clientVersion: "test", meta: { target: ["differentUniqueField"] },
      }),
    );

    const response = await request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload);

    expect(response.status).toBe(500);
    expect(response.body).not.toEqual({ received: true, duplicate: true });
    expect(db.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("returns a retryable failure and releases the reservation when trusted checkout persistence fails", async () => {
    const payload = JSON.stringify({
      id: "evt_synthetic_retry",
      object: "event",
      created: 1_700_000_000,
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_synthetic_retry", customer: "cus_candidate_a", subscription: "sub_candidate_a",
        metadata: { userId: "candidate-a", plan: "BASIC" },
      } },
    });
    db.subscription.findFirst.mockResolvedValueOnce({ id: "subscription-1" });
    db.subscription.updateMany.mockRejectedValueOnce(new Error("synthetic persistence failure"));
    db.billingWebhookIdempotencyKey.delete.mockResolvedValueOnce({ key: "STRIPE:evt_synthetic_retry" });

    const failed = await request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload);

    expect(failed.status).toBe(500);
    expect(db.billingWebhookIdempotencyKey.delete).toHaveBeenCalledOnce();
    expect(billing.syncBillingEntitlementState).not.toHaveBeenCalled();

    db.subscription.findFirst.mockResolvedValueOnce({ id: "subscription-1" });
    const retry = await request(app).post("/api/webhooks/stripe")
      .set("content-type", "application/json").set("stripe-signature", signedPayload(payload)).send(payload);
    expect(retry.status).toBe(200);
    expect(db.billingWebhookIdempotencyKey.create).toHaveBeenCalledTimes(2);
    expect(db.subscription.updateMany).toHaveBeenCalledTimes(2);
    expect(billing.syncBillingEntitlementState).toHaveBeenCalledOnce();
  });
});
