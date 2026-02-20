/**
 * Health endpoint tests.
 *
 * These tests do not require a database or Claude API key.
 * NODE_ENV=test is set by vitest.config.ts, which makes /health and /ready
 * skip the real DB check and respond with status "ok"/"ready" unconditionally.
 */

import { vi, describe, it, expect } from "vitest";

// Mock prisma so importing app.ts never attempts a DB connection.
vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock persistence to satisfy the orchestrator route import chain.
vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

import request from "supertest";
import app from "../app.js";

describe("health endpoints", () => {
  it("GET /live → 200 with alive status (no DB required)", async () => {
    const res = await request(app).get("/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("alive");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("GET /health → 200 in test mode (DB check skipped)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it("GET /ready → 200 in test mode (DB check skipped)", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });

  it("GET /unknown-path → 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
