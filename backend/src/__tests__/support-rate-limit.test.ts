/**
 * POST /api/support/tickets is rate limited per IP. The cap is read from
 * SUPPORT_CONTACT_RATE_LIMIT_MAX at module load, so it is set before the app
 * is imported (this file runs in its own module graph).
 */
import { vi, describe, it, expect } from "vitest";

vi.hoisted(() => {
  process.env.SUPPORT_CONTACT_RATE_LIMIT_MAX = "2";
});

vi.mock("../lib/prisma.js", () => ({
  default: {
    supportTicket: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "tkt_rl",
        status: "OPEN",
        createdAt: new Date(),
        ...data,
      })),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/email.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/email.js")>("../lib/email.js");
  return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

import request from "supertest";
import app from "../app.js";

const body = () => ({
  name: "Kofi Mensah",
  email: "kofi@example.com",
  topic: "GENERAL",
  message: "Hello team, I have a question about relocation support.",
  botShield: { website: "", startedAt: Date.now() - 5_000 },
});

describe("support contact rate limit", () => {
  it("allows the configured number of submissions, then returns 429", async () => {
    const first = await request(app).post("/api/support/tickets").send(body());
    const second = await request(app).post("/api/support/tickets").send(body());
    const third = await request(app).post("/api/support/tickets").send(body());

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe("SUPPORT_RATE_LIMITED");
  });
});
