/**
 * POST /api/chat/message — history window, no-key/mock fallback and
 * "persist only on success" behaviour.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { db, createMock } = vi.hoisted(() => {
  const db = {
    chatConsent: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn() },
    chatConversation: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    chatMessage: { count: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return { db, createMock: vi.fn() };
});

vi.mock("../lib/prisma.js", () => ({ default: db }));
vi.mock("../lib/ai/chat-context.js", () => ({
  buildChatContext: vi.fn().mockResolvedValue({ systemPrompt: "SYS", tokenEstimate: 10 }),
}));
vi.mock("../lib/ai/anthropic-client.js", () => ({
  getAnthropicClient: () => ({ messages: { create: createMock } }),
}));

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { buildChatMessages } from "../routes/chat.js";
import { Role } from "@prisma/client";

const CONV_ID = "conv-1";

function token(): string {
  return signToken({ userId: "chat-user-uid", email: "c@test.com", role: Role.CANDIDATE });
}

/** 40 alternating messages, chronological, oldest first. */
function makeConversation(n: number): { role: string; content: string; createdAt: Date }[] {
  const base = Date.now() - n * 60_000;
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "USER" : "ASSISTANT",
    content: `msg-${i}`,
    createdAt: new Date(base + i * 60_000),
  }));
}

const envBackup = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  db.chatConsent.findUnique.mockResolvedValue({
    privacyNotice: true, termsOfUse: true, dataStorage: true, revokedAt: null,
  });
  db.subscription.findUnique.mockResolvedValue(null);
  db.chatMessage.count.mockResolvedValue(0);
  db.chatConversation.findFirst.mockResolvedValue({ id: CONV_ID, title: "Existing" });
  db.chatMessage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: `id-${String(data.role)}`, createdAt: new Date(), ...data,
  }));
  db.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));

  // Emulate Prisma: orderBy createdAt desc + take
  const convo = makeConversation(40);
  db.chatMessage.findMany.mockImplementation(
    ({ orderBy, take }: { orderBy: { createdAt: "asc" | "desc" }; take: number }) => {
      const sorted = [...convo].sort((a, b) =>
        orderBy.createdAt === "desc"
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime()
      );
      return Promise.resolve(sorted.slice(0, take).map(({ role, content }) => ({ role, content })));
    }
  );
});

afterEach(() => {
  process.env = { ...envBackup };
});

describe("POST /api/chat/message — real model path", () => {
  beforeEach(() => {
    delete process.env.MOCK_AI;
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("sends the most recent history ending with the new message for a 40-message conversation", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "reply" }],
      usage: { output_tokens: 5 },
    });

    const res = await request(app)
      .post("/api/chat/message")
      .set("Authorization", `Bearer ${token()}`)
      .send({ message: "the newest question", conversationId: CONV_ID });

    expect(res.status).toBe(200);
    expect(res.body.message.content).toBe("reply");

    const sent = createMock.mock.calls[0][0].messages as { role: string; content: string }[];
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent[0].role).toBe("user");
    expect(sent[sent.length - 1]).toEqual({ role: "user", content: "the newest question" });
    // The newest stored message (msg-39, an assistant turn) is included; the oldest are not.
    expect(sent[sent.length - 2]).toEqual({ role: "assistant", content: "msg-39" });
    expect(sent.some((m) => m.content === "msg-0")).toBe(false);
    for (let i = 1; i < sent.length; i++) {
      expect(sent[i].role).not.toBe(sent[i - 1].role);
    }

    // Both messages are written only after the model succeeded.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const roles = db.chatMessage.create.mock.calls.map((c) => c[0].data.role);
    expect(roles).toEqual(["USER", "ASSISTANT"]);
  });

  it("leaves no orphan USER message when the model call fails", async () => {
    createMock.mockRejectedValue(new Error("Could not resolve authentication method"));

    const res = await request(app)
      .post("/api/chat/message")
      .set("Authorization", `Bearer ${token()}`)
      .send({ message: "hello", conversationId: CONV_ID });

    expect(res.status).toBe(500);
    expect(db.chatMessage.create).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/message — no key / MOCK_AI", () => {
  it("returns a canned reply without calling the model when no key is configured", async () => {
    delete process.env.MOCK_AI;
    delete process.env.ANTHROPIC_API_KEY;

    const res = await request(app)
      .post("/api/chat/message")
      .set("Authorization", `Bearer ${token()}`)
      .send({ message: "hello", conversationId: CONV_ID });

    expect(res.status).toBe(200);
    expect(res.body.message.content).toMatch(/demo mode/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns a canned reply when MOCK_AI=1 even with a key", async () => {
    process.env.MOCK_AI = "1";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await request(app)
      .post("/api/chat/message")
      .set("Authorization", `Bearer ${token()}`)
      .send({ message: "hello", conversationId: CONV_ID });
    expect(res.status).toBe(200);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("buildChatMessages", () => {
  it("drops a leading assistant turn and merges an orphan user turn", () => {
    const out = buildChatMessages(
      [
        { role: "ASSISTANT", content: "a0" },
        { role: "USER", content: "u1" },
        { role: "ASSISTANT", content: "a1" },
        { role: "USER", content: "orphan" },
      ],
      "new"
    );
    expect(out[0]).toEqual({ role: "user", content: "u1" });
    expect(out[out.length - 1].role).toBe("user");
    expect(out[out.length - 1].content.endsWith("new")).toBe(true);
  });
});
