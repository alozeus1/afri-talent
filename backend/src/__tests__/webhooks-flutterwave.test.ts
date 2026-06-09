import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock Prisma — the signature tests never reach the DB, but the route module
// imports it transitively.
vi.mock("../lib/prisma.js", () => ({
    default: {
        user: { findUnique: vi.fn() },
        subscription: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
        userBillingProfile: { upsert: vi.fn() },
        billingEventAudit: { findFirst: vi.fn() },
        billingWebhookIdempotencyKey: { create: vi.fn().mockResolvedValue({ id: "idempotency-1" }) },
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

import request from "supertest";
import app from "../app.js";
import { validateRuntimeEnv } from "../config/env.js";

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
