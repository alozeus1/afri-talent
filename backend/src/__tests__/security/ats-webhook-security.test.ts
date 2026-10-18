import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaMock = {
  aTSConnection: { findUnique: vi.fn() },
  aTSWebhookEvent: { create: vi.fn() },
};

vi.mock("../../lib/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../lib/secure-string.js", () => ({ decryptString: vi.fn(() => "ats-webhook-secret") }));

const { processAtsWebhook } = await import("../../lib/ats/service.js");

describe("ATS webhook connection boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a disabled connection before parsing or persisting a webhook", async () => {
    prismaMock.aTSConnection.findUnique.mockResolvedValue({
      id: "connection-1",
      provider: "GREENHOUSE",
      webhookSyncEnabled: false,
      encryptedWebhookSecret: null,
    });

    await expect(processAtsWebhook({
      provider: "greenhouse",
      connectionId: "connection-1",
      rawBody: '{"payload":"untrusted"}',
      body: { payload: "untrusted" },
      headers: {},
    })).rejects.toThrow("disabled");

    expect(prismaMock.aTSWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("treats only the webhook event identity constraint as an authenticated replay", async () => {
    prismaMock.aTSConnection.findUnique.mockResolvedValue({
      id: "connection-1",
      provider: "LEVER",
      webhookSyncEnabled: true,
      encryptedWebhookSecret: "encrypted-secret",
    });
    prismaMock.aTSWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate delivery", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["connectionId", "eventKey"] },
      }),
    );

    await expect(processAtsWebhook({
      provider: "lever",
      connectionId: "connection-1",
      rawBody: '{"event":"candidate.updated"}',
      body: { event: "candidate.updated" },
      headers: { "x-afritalent-ats-secret": "ats-webhook-secret" },
    })).resolves.toMatchObject({ duplicate: true, eventType: "candidate.updated" });

    expect(prismaMock.aTSWebhookEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        connectionId: "connection-1",
        eventKey: expect.stringMatching(/^sha256:/),
      }),
    }));
  });

  it("fails closed on an unrelated unique conflict instead of suppressing it as a replay", async () => {
    prismaMock.aTSConnection.findUnique.mockResolvedValue({
      id: "connection-1",
      provider: "LEVER",
      webhookSyncEnabled: true,
      encryptedWebhookSecret: "encrypted-secret",
    });
    prismaMock.aTSWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("foreign unique conflict", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["foreignUniqueField"] },
      }),
    );

    await expect(processAtsWebhook({
      provider: "lever",
      connectionId: "connection-1",
      rawBody: '{"event":"candidate.updated"}',
      body: { event: "candidate.updated" },
      headers: { "x-afritalent-ats-secret": "ats-webhook-secret" },
    })).rejects.toThrow("foreign unique conflict");
  });
});
