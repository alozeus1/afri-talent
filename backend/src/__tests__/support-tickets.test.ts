/**
 * Customer support desk:
 *   - POST /api/support/tickets: validation, bot shield, guest + signed-in context,
 *     fire-and-forget email + n8n side effects
 *   - /api/admin/support/*: admin-only list/filter, triage update, reply
 *     (email + in-app notification for registered submitters)
 *   - n8n webhook signing contract
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("../lib/prisma.js", () => ({
  default: {
    supportTicket: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    supportTicketReply: { create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/email.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/email.js")>("../lib/email.js");
  return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../lib/notifications.js", () => ({
  createUserNotification: vi.fn().mockResolvedValue({ id: "notif_1" }),
}));

import prisma from "../lib/prisma.js";
import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";
import { sendEmail } from "../lib/email.js";
import { createUserNotification } from "../lib/notifications.js";
import { emitSupportWebhook, escapeHtml, generateTicketReference } from "../lib/support/tickets.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const token = (role: Role, userId: string) => signToken({ userId, email: `${userId}@test.com`, role });
const adminToken = () => token(Role.ADMIN, "admin_user");
const candidateToken = () => token(Role.CANDIDATE, "cand_user");

const validBody = {
  name: "Amina Okafor",
  email: "Amina@Example.com",
  topic: "ACCOUNT",
  message: "I cannot verify my email address after signing up yesterday.",
  locale: "fr",
  botShield: { website: "", startedAt: Date.now() - 10_000 },
};

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "tkt_1",
    reference: "AT-ABC234",
    name: "Amina Okafor",
    email: "amina@example.com",
    topic: "ACCOUNT",
    subject: null,
    message: validBody.message,
    status: "OPEN",
    priority: "NORMAL",
    userId: null,
    userRole: null,
    assigneeId: null,
    internalNotes: null,
    locale: "fr",
    firstResponseAt: null,
    lastReplyAt: null,
    resolvedAt: null,
    createdAt: new Date("2026-10-14T10:00:00Z"),
    updatedAt: new Date("2026-10-14T10:00:00Z"),
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops));
});

describe("POST /api/support/tickets", () => {
  it("creates a guest ticket, normalizes email and acknowledges it", async () => {
    db.supportTicket.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) =>
      ticketRow({ ...data, id: "tkt_1" }),
    );

    const res = await request(app).post("/api/support/tickets").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.ticket.reference).toMatch(/^AT-[2-9A-Z]{6}$/);
    const data = db.supportTicket.create.mock.calls[0][0].data;
    expect(data.email).toBe("amina@example.com");
    expect(data.topic).toBe("ACCOUNT");
    expect(data.userId).toBeNull();
    expect(data.locale).toBe("fr");
    expect(data.priority).toBe("NORMAL");

    await flush();
    // Acknowledgement to the submitter (admin alert is skipped without SUPPORT_ADMIN_EMAIL).
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "amina@example.com", templateName: "support_ack" }));
  });

  it("attaches the signed-in user's context and raises trust & safety priority", async () => {
    db.supportTicket.create.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ticketRow(data));

    const res = await request(app)
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${candidateToken()}`)
      .send({ ...validBody, topic: "TRUST_SAFETY" });

    expect(res.status).toBe(201);
    const data = db.supportTicket.create.mock.calls[0][0].data;
    expect(data.userId).toBe("cand_user");
    expect(data.userRole).toBe("CANDIDATE");
    expect(data.priority).toBe("HIGH");
  });

  it.each([
    ["missing name", { name: "" }],
    ["invalid email", { email: "not-an-email" }],
    ["short message", { message: "help" }],
    ["unknown topic", { topic: "BILLING_HACK" }],
  ])("rejects %s with 400 and field details", async (_label, patch) => {
    const res = await request(app).post("/api/support/tickets").send({ ...validBody, ...patch });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(db.supportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects a filled honeypot", async () => {
    const res = await request(app)
      .post("/api/support/tickets")
      .send({ ...validBody, botShield: { website: "https://spam.example", startedAt: Date.now() - 10_000 } });
    expect(res.status).toBe(400);
    expect(db.supportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects an implausibly fast submission", async () => {
    const res = await request(app)
      .post("/api/support/tickets")
      .send({ ...validBody, botShield: { website: "", startedAt: Date.now() } });
    expect(res.status).toBe(400);
    expect(db.supportTicket.create).not.toHaveBeenCalled();
  });

  it("retries on a reference collision", async () => {
    const { Prisma } = await import("@prisma/client");
    db.supportTicket.create
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ticketRow(data));

    const res = await request(app).post("/api/support/tickets").send(validBody);
    expect(res.status).toBe(201);
    expect(db.supportTicket.create).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/support/tickets/mine", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/support/tickets/mine");
    expect(res.status).toBe(401);
  });

  it("lists only the caller's tickets without internal notes", async () => {
    db.supportTicket.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get("/api/support/tickets/mine").set("Authorization", `Bearer ${candidateToken()}`);
    expect(res.status).toBe(200);
    const args = db.supportTicket.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "cand_user" });
    expect(args.select.internalNotes).toBeUndefined();
  });
});

describe("admin support API", () => {
  it("is admin-only", async () => {
    const res = await request(app).get("/api/admin/support/tickets").set("Authorization", `Bearer ${candidateToken()}`);
    expect(res.status).toBe(403);
  });

  it("lists with filters and status counts", async () => {
    db.supportTicket.findMany.mockResolvedValueOnce([ticketRow()]);
    db.supportTicket.count.mockResolvedValueOnce(1);
    db.supportTicket.groupBy.mockResolvedValueOnce([
      { status: "OPEN", _count: { _all: 4 } },
      { status: "RESOLVED", _count: { _all: 2 } },
    ]);

    const res = await request(app)
      .get("/api/admin/support/tickets?status=OPEN&priority=HIGH&assigneeId=unassigned&q=amina")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ OPEN: 4, PENDING: 0, RESOLVED: 2 });
    const where = db.supportTicket.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("OPEN");
    expect(where.priority).toBe("HIGH");
    expect(where.assigneeId).toBeNull();
    expect(where.OR).toHaveLength(5);
  });

  it("rejects invalid filters", async () => {
    const res = await request(app)
      .get("/api/admin/support/tickets?status=CLOSED")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("updates triage fields and stamps resolvedAt", async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(ticketRow());
    db.user.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
    db.supportTicket.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) =>
      ticketRow({ ...data, assignee: { id: "admin_2", name: "Ops", email: "ops@test.com" } }),
    );

    const res = await request(app)
      .patch("/api/admin/support/tickets/tkt_1")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "RESOLVED", priority: "HIGH", assigneeId: "admin_2", internalNotes: "Verified manually" });

    expect(res.status).toBe(200);
    const data = db.supportTicket.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "RESOLVED", priority: "HIGH", assigneeId: "admin_2", internalNotes: "Verified manually" });
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it("refuses to assign a ticket to a non-admin", async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(ticketRow());
    db.user.findUnique.mockResolvedValueOnce({ role: "CANDIDATE" });

    const res = await request(app)
      .patch("/api/admin/support/tickets/tkt_1")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ assigneeId: "cand_user" });

    expect(res.status).toBe(400);
    expect(db.supportTicket.update).not.toHaveBeenCalled();
  });

  it("rejects an empty update and returns 404 for unknown tickets", async () => {
    const empty = await request(app)
      .patch("/api/admin/support/tickets/tkt_1")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({});
    expect(empty.status).toBe(400);

    db.supportTicket.findUnique.mockResolvedValueOnce(null);
    const missing = await request(app)
      .patch("/api/admin/support/tickets/nope")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ status: "PENDING" });
    expect(missing.status).toBe(404);
  });

  it("replies: stores the reply, emails the submitter and notifies a registered user in-app", async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(ticketRow({ userId: "cand_user" }));
    db.supportTicketReply.create.mockResolvedValueOnce({ id: "rep_1", body: "Fixed!", emailSent: false });
    db.supportTicket.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) =>
      ticketRow({ ...data, userId: "cand_user" }),
    );

    const res = await request(app)
      .post("/api/admin/support/tickets/tkt_1/replies")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ body: "We re-sent your verification link. Fixed!" });

    expect(res.status).toBe(201);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "amina@example.com", templateName: "support_reply" }));
    expect(createUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "cand_user", type: "SUPPORT_REPLY" }),
    );
    const update = db.supportTicket.update.mock.calls[0][0].data;
    expect(update.status).toBe("PENDING");
    expect(update.firstResponseAt).toBeInstanceOf(Date);
    expect(update.assigneeId).toBe("admin_user");
    expect(res.body.delivery.inApp).toBe(true);
  });

  it("replies to a guest ticket without an in-app notification", async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(ticketRow());
    db.supportTicketReply.create.mockResolvedValueOnce({ id: "rep_2", body: "Hi" });
    db.supportTicket.update.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ticketRow(data));

    const res = await request(app)
      .post("/api/admin/support/tickets/tkt_1/replies")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ body: "Thanks for reaching out.", status: "RESOLVED" });

    expect(res.status).toBe(201);
    expect(createUserNotification).not.toHaveBeenCalled();
    expect(db.supportTicket.update.mock.calls[0][0].data.status).toBe("RESOLVED");
  });
});

describe("support helpers", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.N8N_SUPPORT_WEBHOOK_URL;
    delete process.env.N8N_SUPPORT_HMAC_SECRET;
  });

  it("generates unambiguous references and escapes HTML", () => {
    for (let i = 0; i < 50; i += 1) expect(generateTicketReference()).toMatch(/^AT-[2-9A-HJKMNP-Z]{6}$/);
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  });

  it("does nothing when the n8n webhook is not configured", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await emitSupportWebhook("support.ticket_created", { id: "tkt_1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to send unsigned events (URL without secret)", async () => {
    process.env.N8N_SUPPORT_WEBHOOK_URL = "https://n8n.example/webhook/support";
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await emitSupportWebhook("support.ticket_created", { id: "tkt_1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs timestamp.body with HMAC-SHA256 and never throws on failure", async () => {
    process.env.N8N_SUPPORT_WEBHOOK_URL = "https://n8n.example/webhook/support";
    process.env.N8N_SUPPORT_HMAC_SECRET = "s3cret";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await emitSupportWebhook("support.ticket_created", { id: "tkt_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://n8n.example/webhook/support");
    const ts = init.headers["x-afritalent-timestamp"];
    const expected = createHmac("sha256", "s3cret").update(`${ts}.${init.body}`).digest("hex");
    expect(init.headers["x-afritalent-signature"]).toBe(expected);
    expect(init.headers["x-afritalent-event"]).toBe("support.ticket_created");
    expect(JSON.parse(init.body).data).toEqual({ id: "tkt_1" });

    fetchMock.mockRejectedValueOnce(new Error("boom"));
    await expect(emitSupportWebhook("support.ticket_created", { id: "tkt_2" })).resolves.toBeUndefined();
  });
});
