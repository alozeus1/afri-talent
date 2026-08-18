import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  n8nCallbackDecision: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  graphRun: { findUnique: vi.fn(), updateMany: vi.fn() },
  graphRunEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../../lib/prisma.js", () => ({ default: db }));
vi.mock("../../lib/ops/events.js", () => ({ recordOpsEvent: vi.fn() }));

import express from "express";
import request from "supertest";
import router from "../../routes/n8n-webhooks.js";
import { mintDecisionToken } from "../../lib/notifications/approvalWebhook.js";
import { createHash } from "node:crypto";

const secret = "n8n-test-secret";
const graphRunId = "run-p2002";
const app = express();
app.use(express.raw({ type: "application/json" }));
app.use("/api/webhooks/n8n", router);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.N8N_APPROVAL_HMAC_SECRET = secret;
  db.n8nCallbackDecision.findUnique.mockResolvedValue(null);
  db.graphRun.findUnique.mockResolvedValue({ graphRunId, workflowType: "test" });
  db.graphRun.updateMany.mockResolvedValue({ count: 1 });
  db.graphRunEvent.create.mockResolvedValue({ id: "event-1" });
  db.n8nCallbackDecision.create.mockResolvedValue({ id: "callback-1" });
  db.n8nCallbackDecision.update.mockResolvedValue({ id: "callback-1", completedAt: new Date() });
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
});

describe("n8n callback durable replay", () => {
  it("concurrent exact replay handles callback-digest P2002 idempotently", async () => {
    const token = mintDecisionToken(graphRunId, "deny", secret, Math.floor(Date.now() / 1000));
    const tokenDigest = createHash("sha256").update(token).digest("hex");
    const tokenJti = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).jti;
    db.$transaction.mockRejectedValue({ code: "P2002", meta: { target: ["tokenDigest"] } });
    db.n8nCallbackDecision.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ tokenDigest, graphRunId, action: "deny", tokenJti, completedAt: new Date() });

    const response = await request(app).post("/api/webhooks/n8n/approval").send({ token });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("already_processed");
    expect(db.graphRun.updateMany).not.toHaveBeenCalled();
    expect(db.graphRunEvent.create).not.toHaveBeenCalled();

    db.n8nCallbackDecision.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ tokenDigest: "other", graphRunId: "other-run", action: "deny", tokenJti: "other", completedAt: new Date() });
    const conflict = await request(app).post("/api/webhooks/n8n/approval").send({ token });
    expect(conflict.status).toBe(409);
    expect(db.graphRun.updateMany).not.toHaveBeenCalled();
    expect(db.graphRunEvent.create).not.toHaveBeenCalled();
  });

  it("keeps the callback retryable when the transactional denial event fails", async () => {
    const token = mintDecisionToken(graphRunId, "deny", secret, Math.floor(Date.now() / 1000));
    db.graphRunEvent.create.mockRejectedValueOnce(new Error("event write failed"));
    const failed = await request(app).post("/api/webhooks/n8n/approval").send({ token });
    expect(failed.status).toBe(500);
    expect(db.n8nCallbackDecision.update).not.toHaveBeenCalled();

    const retry = await request(app).post("/api/webhooks/n8n/approval").send({ token });
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("denied");
    expect(db.graphRun.updateMany).toHaveBeenCalledTimes(2);
    expect(db.graphRunEvent.create).toHaveBeenCalledTimes(2);
  });

  it("returns one terminal result for controlled concurrent exact callbacks", async () => {
    const token = mintDecisionToken(graphRunId, "deny", secret, Math.floor(Date.now() / 1000));
    const digest = createHash("sha256").update(token).digest("hex");
    const jti = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).jti;
    let first = true;
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => {
      if (first) { first = false; return callback(db); }
      throw { code: "P2002", meta: { target: ["tokenDigest"] } };
    });
    db.n8nCallbackDecision.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ tokenDigest: digest, graphRunId, action: "deny", tokenJti: jti, completedAt: new Date() });
    const [a, b] = await Promise.all([request(app).post("/api/webhooks/n8n/approval").send({ token }), request(app).post("/api/webhooks/n8n/approval").send({ token })]);
    expect([a.body.status, b.body.status].sort()).toEqual(["already_processed", "denied"]);
    expect(db.graphRun.updateMany).toHaveBeenCalledOnce();
    expect(db.graphRunEvent.create).toHaveBeenCalledOnce();
  });
});
