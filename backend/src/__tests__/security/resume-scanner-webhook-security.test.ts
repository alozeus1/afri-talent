import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const db = vi.hoisted(() => ({
  resumeScanDelivery: { findUnique: vi.fn(), create: vi.fn() },
  resumeScanJob: { findUnique: vi.fn(), updateMany: vi.fn() },
  resume: { update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
}));

vi.mock("../../lib/prisma.js", () => ({ default: db }));
vi.mock("../../lib/stripe.js", () => ({ getStripe: vi.fn(), getPlanFromPriceId: vi.fn(), isStripeConfigured: () => false }));
vi.mock("../../lib/notifications.js", () => ({ createUserNotification: vi.fn() }));
vi.mock("../../lib/redis.js", () => ({ redisClient: null }));
vi.mock("../../lib/ops/events.js", () => ({ recordOpsEvent: vi.fn() }));
vi.mock("../../lib/ops/resilience.js", () => ({ pushDeadLetter: vi.fn() }));
vi.mock("../../lib/flutterwave.js", () => ({ getFlutterwaveSecretHash: vi.fn(), verifyFlutterwaveTransaction: vi.fn() }));
vi.mock("../../lib/billing/region-resolver.js", () => ({ updateStripeCountry: vi.fn() }));
vi.mock("../../lib/billing/index.js", () => ({ mapStripeSubscriptionStatus: vi.fn(), recordBillingEvent: vi.fn(), syncBillingEntitlementState: vi.fn(), upsertBillingDiscrepancy: vi.fn() }));

import express from "express";
import request from "supertest";
import router from "../../routes/webhooks.js";

const secret = "resume-scanner-test-secret-with-sufficient-length"; // secret-scan:allow synthetic test value
const app = express();
app.use(express.raw({ type: "application/json", limit: "100kb" }));
app.use("/api/webhooks", router);

const job = {
  id: "job-a", resumeId: "resume-a", bucket: "test-private-resumes", objectKey: "resumes/candidate-a/resume.pdf",
  objectVersion: null, status: "PENDING", attemptCount: 0, maxAttempts: 3, startedAt: null,
  resume: { id: "resume-a", securityStatus: "PENDING_SCAN", isActive: false },
};

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ jobId: "job-a", resumeId: "resume-a", bucket: job.bucket, objectKey: job.objectKey, objectVersion: null, result: "CLEAN", ...overrides });
}
function signed(payload: string, timestamp = Math.floor(Date.now() / 1000), deliveryId = "delivery-a") {
  return {
    "x-afritalent-scan-timestamp": String(timestamp),
    "x-afritalent-scan-delivery-id": deliveryId,
    "x-afritalent-scan-signature": `v1=${createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest("hex")}`,
  };
}
function send(payload = body(), headers = signed(payload)) {
  return request(app).post("/api/webhooks/resume-scanner").set("content-type", "application/json").set(headers).send(payload);
}

describe("POST /api/webhooks/resume-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESUME_SCANNER_WEBHOOK_SECRET = secret;
    db.resumeScanDelivery.findUnique.mockResolvedValue(null);
    db.resumeScanDelivery.create.mockResolvedValue({ id: "delivery-row" });
    db.resumeScanJob.findUnique.mockResolvedValue(job);
    db.resumeScanJob.updateMany.mockResolvedValue({ count: 1 });
    db.resume.update.mockResolvedValue({ id: "resume-a" });
    db.auditLog.create.mockResolvedValue({ id: "audit-a" });
  });

  it("fails closed before persistence for missing secret, malformed/altered signatures, timestamps, and delivery identity", async () => {
    const payload = body();
    const denied = [
      () => { delete process.env.RESUME_SCANNER_WEBHOOK_SECRET; return send(payload, signed(payload)); },
      () => send(payload, { ...signed(payload), "x-afritalent-scan-signature": "v1=not-hex" }),
      () => send(`${payload} `, signed(payload)),
      () => send(payload, signed(payload, Math.floor(Date.now() / 1000) - 301)),
      () => send(payload, signed(payload, Math.floor(Date.now() / 1000) + 301)),
      () => send(payload, { ...signed(payload), "x-afritalent-scan-timestamp": "not-a-timestamp" }),
      () => send(payload, { ...signed(payload), "x-afritalent-scan-timestamp": "9007199254740993" }),
      () => send(payload, { ...signed(payload), "x-afritalent-scan-delivery-id": "" }),
    ];
    for (const requestFactory of denied) {
      const response = await requestFactory();
      expect(response.status).toBe(401);
      expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it("rejects authenticated malformed JSON, unsupported results, and query-string authentication without persistence", async () => {
    const malformed = "{not-json";
    const malformedResponse = await send(malformed, signed(malformed));
    expect(malformedResponse.status).toBe(400);

    const invalidResult = body({ result: "INFECTED" });
    const invalidResultResponse = await send(invalidResult, signed(invalidResult));
    expect(invalidResultResponse.status).toBe(400);

    const queryOnly = await request(app)
      .post("/api/webhooks/resume-scanner?token=synthetic-test-token")
      .set("content-type", "application/json")
      .send(body());
    expect(queryOnly.status).toBe(401);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
    expect(db.resumeScanJob.updateMany).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects unknown or mismatched resources without a delivery, transition, audit, or resume write", async () => {
    db.resumeScanJob.findUnique.mockResolvedValueOnce(null);
    const unknown = await send();
    expect(unknown.status).toBe(409);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
    expect(db.resumeScanJob.updateMany).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();

    vi.clearAllMocks();
    db.resumeScanDelivery.findUnique.mockResolvedValue(null);
    db.resumeScanJob.findUnique.mockResolvedValue({ ...job, objectKey: "resumes/candidate-b/foreign.pdf" });
    const foreign = await send();
    expect(foreign.status).toBe(409);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();

    vi.clearAllMocks();
    db.resumeScanDelivery.findUnique.mockResolvedValue(null);
    db.resumeScanJob.findUnique.mockResolvedValue({ ...job, objectVersion: "trusted-version" });
    const wrongVersionPayload = body({ objectVersion: "replacement-version" });
    const wrongVersion = await send(wrongVersionPayload, signed(wrongVersionPayload));
    expect(wrongVersion.status).toBe(409);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
  });

  it("accepts an authenticated trusted CLEAN result atomically", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(db.resumeScanDelivery.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ jobId: "job-a", deliveryId: "delivery-a", result: "CLEAN" }) }));
    expect(db.resumeScanJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "job-a" }) }));
    expect(db.resume.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ securityStatus: "CLEAN", isActive: true }) }));
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it("returns idempotent success only for an exact delivery replay and rejects conflicting reuse", async () => {
    const payload = body();
    const payloadHash = createHmac("sha256", "irrelevant").update(payload).digest("hex");
    // A different hash models a conflicting body for the same durable delivery ID.
    db.resumeScanDelivery.findUnique.mockResolvedValueOnce({ jobId: "job-a", payloadHash, result: "CLEAN" });
    const conflict = await send(payload);
    expect(conflict.status).toBe(409);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();

    const crypto = await import("node:crypto");
    db.resumeScanDelivery.findUnique.mockResolvedValueOnce({ jobId: "job-a", payloadHash: crypto.createHash("sha256").update(payload).digest("hex"), result: "CLEAN" });
    const duplicate = await send(payload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toEqual({ received: true, duplicate: true });
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
  });

  it("keeps ERROR retryable, increments attempts, and exhausts only at the configured bound", async () => {
    const errorPayload = body({ result: "ERROR", errorCode: "SCANNER_TIMEOUT" });
    const retryable = await send(errorPayload, signed(errorPayload, Math.floor(Date.now() / 1000), "delivery-error-1"));
    expect(retryable.status).toBe(200);
    expect(db.resumeScanJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", resultDeliveryId: null, attemptCount: 1 }) }));
    expect(db.resume.update).not.toHaveBeenCalled();

    vi.clearAllMocks();
    db.resumeScanDelivery.findUnique.mockResolvedValue(null);
    db.resumeScanJob.findUnique.mockResolvedValue({ ...job, status: "FAILED", attemptCount: 2 });
    db.resumeScanDelivery.create.mockResolvedValue({ id: "delivery-row" });
    db.resumeScanJob.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.create.mockResolvedValue({ id: "audit-a" });
    const exhausted = await send(errorPayload, signed(errorPayload, Math.floor(Date.now() / 1000), "delivery-error-3"));
    expect(exhausted.status).toBe(200);
    expect(db.resumeScanJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "EXHAUSTED", attemptCount: 3 }) }));
  });

  it("rolls back a failed transaction so an authenticated provider retry remains processable", async () => {
    db.$transaction.mockRejectedValueOnce(new Error("audit persistence failed"));
    const failed = await send();
    expect(failed.status).toBe(500);

    db.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(db));
    db.resumeScanDelivery.findUnique.mockResolvedValue(null);
    const retried = await send(body(), signed(body(), Math.floor(Date.now() / 1000), "delivery-retry"));
    expect(retried.status).toBe(200);
    expect(db.resumeScanDelivery.create).toHaveBeenCalledOnce();
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it("rejects stale or terminal results before every durable side effect", async () => {
    db.resumeScanJob.findUnique.mockResolvedValue({ ...job, status: "COMPLETED", attemptCount: 1 });
    const response = await send();
    expect(response.status).toBe(409);
    expect(db.resumeScanDelivery.create).not.toHaveBeenCalled();
    expect(db.resumeScanJob.updateMany).not.toHaveBeenCalled();
    expect(db.resume.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
