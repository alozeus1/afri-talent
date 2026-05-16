/**
 * Health endpoint tests.
 *
 * These tests do not require a database or Claude API key.
 * NODE_ENV=test is set by vitest.config.ts, which makes /health, /ready, and
 * the verbose admin path skip the real DB check and respond synthetically.
 *
 * §2.6 info-leak fix: anonymous /health and /api/health return `{status:"ok"}`
 * only. The rich payload (release, commitSha, db/redis/billing) is admin-only
 * via `?verbose=1`.
 */

import { vi, describe, it, expect } from "vitest";
import { Role } from "@prisma/client";

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
import { signToken } from "../lib/jwt.js";

function adminToken(): string {
  return signToken({ userId: "admin-1", email: "admin@example.com", role: Role.ADMIN });
}

function candidateToken(): string {
  return signToken({ userId: "user-1", email: "user@example.com", role: Role.CANDIDATE });
}

describe("health endpoints", () => {
  it("GET /live → 200 with alive status (no DB required)", async () => {
    const res = await request(app).get("/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("alive");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("GET /health (anon) → 200 with minimal payload only", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/health (anon) → 200 with minimal payload only", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.body.checks).toBeUndefined();
    expect(res.body.commitSha).toBeUndefined();
    expect(res.body.release).toBeUndefined();
  });

  it("GET /api/health?verbose=1 (no auth) → 403", async () => {
    const res = await request(app).get("/api/health?verbose=1");
    expect(res.status).toBe(403);
  });

  it("GET /api/health?verbose=1 (candidate token) → 403", async () => {
    const res = await request(app)
      .get("/api/health?verbose=1")
      .set("Authorization", `Bearer ${candidateToken()}`);
    expect(res.status).toBe(403);
  });

  it("GET /api/health?verbose=1 (admin token) → 200 with rich payload", async () => {
    const res = await request(app)
      .get("/api/health?verbose=1")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.billing).toBe("skipped-in-test");
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.release).toBeDefined();
    expect(res.body.commitSha).toBeDefined();
  });

  it("GET /ready → 200 in test mode (DB check skipped)", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.billing).toBe("skipped-in-test");
  });

  it("GET /unknown-path → 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
