import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock Prisma — the signature tests never reach the DB, but the route module
// imports it transitively.
vi.mock("../lib/prisma.js", () => ({
    default: {
        user: { findUnique: vi.fn() },
        subscription: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
        userBillingProfile: { upsert: vi.fn() },
        billingEventAudit: { findFirst: vi.fn() },
        billingWebhookIdempotencyKey: {
            create: vi.fn().mockResolvedValue({ id: "idempotency-1" }),
            delete: vi.fn().mockResolvedValue(undefined),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn().mockResolvedValue(undefined),
    },
}));

// Mock the Flutterwave API client so no network calls happen. The secret-hash
// getter is NOT mocked — we exercise the real signature verification logic.
vi.mock("../lib/flutterwave.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/flutterwave.js")>();
    return {
        ...actual,
        verifyFlutterwaveTransaction: vi.fn(),
    };
});

// Keep entitlement and audit delivery outside this route test. Their call
// counts are security-relevant: an unauthorised or zero-row cancellation must
// not create any post-commit billing effects.
vi.mock("../lib/billing/index.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/billing/index.js")>();
    return {
        ...actual,
        syncBillingEntitlementState: vi.fn(),
        recordBillingEvent: vi.fn(),
    };
});

import request from "supertest";
import app from "../app.js";
import { validateRuntimeEnv } from "../config/env.js";
import prisma from "../lib/prisma.js";
import { recordBillingEvent, syncBillingEntitlementState } from "../lib/billing/index.js";

const SECRET_HASH = "test-flw-secret-hash";

describe("POST /api/webhooks/flutterwave — signature enforcement (H1)", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("rejects every request with 503 when FLUTTERWAVE_SECRET_HASH is not configured (fail closed)", async () => {
        delete process.env.FLUTTERWAVE_SECRET_HASH;

        const res = await request(app)
            .post("/api/webhooks/flutterwave")
            .set("Content-Type", "application/json")
            .send({ event: "charge.completed", data: { id: 123, tx_ref: "tx-unconfigured" } });

        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/not configured/i);
    });

    it("rejects unsigned requests with 401", async () => {
        const res = await request(app)
            .post("/api/webhooks/flutterwave")
            .set("Content-Type", "application/json")
            .send({ event: "subscription.cancelled", data: { customer: { email: "victim@example.com" } } });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid flutterwave signature/i);
    });

    it("rejects requests with a wrong signature with 401", async () => {
        const res = await request(app)
            .post("/api/webhooks/flutterwave")
            .set("Content-Type", "application/json")
            .set("verif-hash", "wrong-secret")
            .send({ event: "subscription.cancelled", data: { customer: { email: "victim@example.com" } } });

        expect(res.status).toBe(401);
    });

    it("rejects an empty signature header with 401", async () => {
        const res = await request(app)
            .post("/api/webhooks/flutterwave")
            .set("Content-Type", "application/json")
            .set("verif-hash", "")
            .send({ event: "charge.completed", data: {} });

        expect(res.status).toBe(401);
    });

    it("accepts a correctly signed request (proceeds past authentication)", async () => {
        // Payload without tx_ref/id is acknowledged-and-ignored (202) AFTER the
        // signature gate — proving valid signatures are let through without
        // touching external APIs.
        const res = await request(app)
            .post("/api/webhooks/flutterwave")
            .set("Content-Type", "application/json")
            .set("verif-hash", SECRET_HASH)
            .send({ event: "charge.completed", data: {} });

        expect(res.status).toBe(202);
        expect(res.body).toEqual({ received: true, ignored: true });
    });
});

describe("POST /api/webhooks/flutterwave — cancellation ownership (H1)", () => {
    const originalEnv = { ...process.env };
    const prismaMock = prisma as unknown as {
        user: { findUnique: ReturnType<typeof vi.fn> };
        subscription: {
            findFirst: ReturnType<typeof vi.fn>;
            update: ReturnType<typeof vi.fn>;
            updateMany: ReturnType<typeof vi.fn>;
        };
        billingWebhookIdempotencyKey: { create: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };

    const signedCancellation = (overrides: Record<string, unknown> = {}) => request(app)
        .post("/api/webhooks/flutterwave")
        .set("Content-Type", "application/json")
        .set("verif-hash", SECRET_HASH)
        .send({
            event: "subscription.cancelled",
            data: {
                id: 9001,
                customer: { id: "flw-customer-trusted", email: "victim@example.test" },
                ...overrides,
            },
        });

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;
        prismaMock.billingWebhookIdempotencyKey.create.mockResolvedValue({ id: "idempotency-1" });
        prismaMock.billingWebhookIdempotencyKey.delete.mockResolvedValue(undefined);
        prismaMock.subscription.findFirst.mockResolvedValue(null);
        prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("does not let a body email select a foreign subscription", async () => {
        // A forged email must never be queried as an ownership selector. The
        // only accepted binding is the stored Flutterwave provider customer ID.
        prismaMock.user.findUnique.mockResolvedValue({ id: "victim-user" });

        const res = await signedCancellation();

        expect(res.status).toBe(200);
        expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                billingProvider: "FLUTTERWAVE",
                providerCustomerId: "flw-customer-trusted",
            }),
        }));
        expect(prismaMock.subscription.update).not.toHaveBeenCalled();
        expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
        expect(syncBillingEntitlementState).not.toHaveBeenCalled();
        expect(recordBillingEvent).not.toHaveBeenCalled();
    });

    it("applies cancellation only to the matching persisted provider binding", async () => {
        prismaMock.subscription.findFirst.mockResolvedValue({ id: "sub-1", userId: "owner-1" });
        prismaMock.subscription.updateMany.mockResolvedValue({ count: 1 });

        const res = await signedCancellation({
            customer: { id: "flw-customer-trusted", email: "attacker@example.test" },
        });

        expect(res.status).toBe(200);
        expect(prismaMock.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: "sub-1",
                billingProvider: "FLUTTERWAVE",
                providerCustomerId: "flw-customer-trusted",
            }),
        }));
        expect(syncBillingEntitlementState).toHaveBeenCalledWith("owner-1", "flutterwave_subscription_cancelled");
        expect(recordBillingEvent).toHaveBeenCalledWith(expect.objectContaining({
            userId: "owner-1",
            subscriptionId: "sub-1",
            outcome: "PROCESSED",
        }));
    });

    it("does not synchronize or audit a cancellation when the conditional write affects zero rows", async () => {
        prismaMock.subscription.findFirst.mockResolvedValue({ id: "sub-1", userId: "owner-1" });
        prismaMock.subscription.updateMany.mockResolvedValue({ count: 0 });

        const res = await signedCancellation();

        expect(res.status).toBe(200);
        expect(syncBillingEntitlementState).not.toHaveBeenCalled();
        expect(recordBillingEvent).not.toHaveBeenCalled();
    });

    it("ignores missing or mismatched provider bindings without using body-controlled identifiers", async () => {
        const missingBinding = await signedCancellation({
            customer: { email: "victim@example.test" },
            userId: "victim-user",
            employerId: "foreign-employer",
            subscriptionId: "foreign-subscription",
        });
        expect(missingBinding.status).toBe(200);
        expect(prismaMock.subscription.findFirst).not.toHaveBeenCalled();

        vi.clearAllMocks();
        prismaMock.billingWebhookIdempotencyKey.create.mockResolvedValue({ id: "idempotency-2" });
        prismaMock.subscription.findFirst.mockResolvedValue(null);
        const mismatchedBinding = await signedCancellation({
            id: 9002,
            customer: { id: "flw-customer-foreign", email: "victim@example.test" },
        });
        expect(mismatchedBinding.status).toBe(200);
        expect(prismaMock.subscription.updateMany).not.toHaveBeenCalled();
        expect(syncBillingEntitlementState).not.toHaveBeenCalled();
        expect(recordBillingEvent).not.toHaveBeenCalled();
    });
});

describe("validateRuntimeEnv — Flutterwave webhook secret fail-fast", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    function setBaseDeployEnv(nodeEnv: string) {
        process.env.NODE_ENV = nodeEnv;
        process.env.DATABASE_URL = "postgres://test";
        process.env.FRONTEND_URL = "https://example.com";
        process.env.JWT_SECRET = "x".repeat(32);
        // Other production-critical vars validateRuntimeEnv() requires, so these
        // tests isolate the Flutterwave secret behavior rather than tripping on them.
        process.env.ANTHROPIC_API_KEY = "sk-ant-test";
        process.env.SENTRY_DSN = "https://test@sentry.example.com/1";
    }

    it("throws in production when Flutterwave is enabled but FLUTTERWAVE_SECRET_HASH is unset", () => {
        setBaseDeployEnv("production");
        process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-abc";
        delete process.env.FLUTTERWAVE_SECRET_HASH;

        expect(() => validateRuntimeEnv()).toThrow(/FLUTTERWAVE_SECRET_HASH/);
    });

    it("throws in staging when Flutterwave is enabled but FLUTTERWAVE_SECRET_HASH is unset", () => {
        setBaseDeployEnv("staging");
        process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-abc";
        delete process.env.FLUTTERWAVE_SECRET_HASH;

        expect(() => validateRuntimeEnv()).toThrow(/FLUTTERWAVE_SECRET_HASH/);
    });

    it("passes in production when Flutterwave is enabled and the hash is set", () => {
        setBaseDeployEnv("production");
        process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-abc";
        process.env.FLUTTERWAVE_SECRET_HASH = SECRET_HASH;

        expect(() => validateRuntimeEnv()).not.toThrow();
    });

    it("passes in production when Flutterwave is not enabled at all", () => {
        setBaseDeployEnv("production");
        delete process.env.FLUTTERWAVE_SECRET_KEY;
        delete process.env.FLUTTERWAVE_SECRET_HASH;

        expect(() => validateRuntimeEnv()).not.toThrow();
    });
});
