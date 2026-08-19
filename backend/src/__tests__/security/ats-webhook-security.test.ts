import { describe, expect, it, vi } from "vitest";

const prismaMock = {
  aTSConnection: { findUnique: vi.fn() },
  aTSWebhookEvent: { create: vi.fn() },
};

vi.mock("../../lib/prisma.js", () => ({ default: prismaMock }));

const { processAtsWebhook } = await import("../../lib/ats/service.js");

describe("ATS webhook connection boundary", () => {
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
});
