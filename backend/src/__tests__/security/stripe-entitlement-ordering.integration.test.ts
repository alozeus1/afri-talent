import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => {
  let activeEntered!: () => void;
  let releaseActive!: () => void;
  let cancelledCompleted!: () => void;
  return {
    calls: 0,
    realCalls: 0,
    activeEntered: new Promise<void>((resolve) => { activeEntered = resolve; }),
    releaseActive: () => releaseActive(),
    activeGate: new Promise<void>((resolve) => { releaseActive = resolve; }),
    cancelledCompleted: new Promise<void>((resolve) => { cancelledCompleted = resolve; }),
    signalActive: () => activeEntered(),
    signalCancelled: () => cancelledCompleted(),
  };
});
const notifications = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));
const deadLetter = vi.hoisted(() => ({ pushDeadLetter: vi.fn().mockResolvedValue(undefined) }));

vi.mock("../../lib/billing/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/billing/index.js")>("../../lib/billing/index.js");
  return {
    ...actual,
    syncBillingEntitlementState: async (...args: Parameters<typeof actual.syncBillingEntitlementState>) => {
      control.calls += 1;
      if (control.calls === 1) {
        control.signalActive();
        await control.activeGate;
      }
      const result = await actual.syncBillingEntitlementState(...args);
      control.realCalls += 1;
      if (control.calls === 2) control.signalCancelled();
      return result;
    },
  };
});
vi.mock("../../lib/notifications.js", () => notifications);
vi.mock("../../lib/ops/resilience.js", () => deadLetter);
vi.mock("../../lib/redis.js", () => ({ redisClient: null }));

import express from "express";
import request from "supertest";
import Stripe from "stripe";
import prisma from "../../lib/prisma.js";
import router from "../../routes/webhooks.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const requested = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1";
const safeDatabase = /^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/afritalent_stripe_entitlement_test_/i.test(databaseUrl);
if (requested && !safeDatabase) throw new Error("stripe entitlement integration test requires a loopback afritalent_stripe_entitlement_test database");
const describeIntegration = requested ? describe : describe.skip;

const stripe = new Stripe("sk_test_synthetic_entitlement_ordering", { apiVersion: "2026-01-28.clover" }); // secret-scan:allow synthetic test value
const secret = "whsec_synthetic_entitlement_ordering"; // secret-scan:allow synthetic test value
const app = express();
app.use(express.raw({ type: "application/json" }));
app.use("/api/webhooks", router);
const id = "00000000-0000-4000-8000-000000000901";

function send(payload: object) {
  const raw = JSON.stringify(payload);
  return request(app).post("/api/webhooks/stripe").set("content-type", "application/json")
    .set("stripe-signature", stripe.webhooks.generateTestHeaderString({ payload: raw, secret, timestamp: Math.floor(Date.now() / 1000) })).send(raw);
}

describeIntegration("Stripe entitlement ordering with PostgreSQL", () => {
  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    await prisma.user.create({ data: { id, email: "entitlement-ordering@example.test", password: "test-only", name: "Entitlement Ordering", role: "CANDIDATE" } });
    await prisma.subscription.create({ data: { userId: id, plan: "FREE", status: "INACTIVE", billingProvider: "STRIPE", stripeCustomerId: "cus_entitlement", stripeSubId: "sub_entitlement", stripeLifecycleOccurredAt: new Date("2030-01-01T00:00:00Z"), stripeLifecyclePriority: 0, stripeLifecycleEventId: "evt_baseline" } });
  });
  afterAll(async () => { await prisma.billingWebhookIdempotencyKey.deleteMany({ where: { eventId: { in: ["evt_active", "evt_cancelled"] } } }); await prisma.billingEntitlementState.deleteMany({ where: { userId: id } }); await prisma.subscription.delete({ where: { userId: id } }); await prisma.user.delete({ where: { id } }); await prisma.$disconnect(); });

  it("cannot restore entitlement when a deferred active sync resumes after cancellation", async () => {
    const active = { id: "evt_active", object: "event", created: 1_900_000_001, type: "invoice.paid", data: { object: { id: "in_active", customer: "cus_entitlement", subscription: "sub_entitlement" } } };
    const cancelled = { id: "evt_cancelled", object: "event", created: 1_900_000_002, type: "customer.subscription.deleted", data: { object: { id: "sub_entitlement" } } };
    const activeRequest = send(active).then((response) => response);
    await control.activeEntered;
    expect((await prisma.subscription.findUniqueOrThrow({ where: { userId: id } })).status).toBe("ACTIVE");
    const cancelResponse = await send(cancelled);
    await control.cancelledCompleted;
    let state = await prisma.subscription.findUniqueOrThrow({ where: { userId: id } });
    let entitlement = await prisma.billingEntitlementState.findUniqueOrThrow({ where: { userId: id } });
    expect(cancelResponse.status).toBe(200); expect(state.status).toBe("CANCELLED"); expect(state.plan).toBe("FREE"); expect(state.stripeLifecyclePriority).toBe(30); expect(state.stripeLifecycleEventId).toBe("evt_cancelled"); expect(entitlement.effectivePlan).toBe("FREE");
    control.releaseActive();
    expect((await activeRequest).status).toBe(200);
    state = await prisma.subscription.findUniqueOrThrow({ where: { userId: id } }); entitlement = await prisma.billingEntitlementState.findUniqueOrThrow({ where: { userId: id } });
    expect(control.calls).toBe(2); expect(control.realCalls).toBe(2); expect(state.status).toBe("CANCELLED"); expect(state.plan).toBe("FREE"); expect(state.stripeLifecycleEventId).toBe("evt_cancelled"); expect(entitlement.effectivePlan).toBe("FREE"); expect(deadLetter.pushDeadLetter).not.toHaveBeenCalled(); expect(notifications.createUserNotification).toHaveBeenCalledTimes(1);
  });
});
