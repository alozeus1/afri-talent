/**
 * CSRF middleware tests (§2.3).
 *
 * The middleware exits early in NODE_ENV=test unless the request carries
 * `x-csrf-test-bypass: enforce`. These tests opt in to exercise the gate.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

import request from "supertest";
import app from "../app.js";

describe("CSRF middleware (§2.3)", () => {
  it("POST without token AND without test-bypass header → 403 CSRF_INVALID", async () => {
    const res = await request(app)
      .post("/api/jobs/saved-jobs")
      .set("x-csrf-test-bypass", "enforce")
      .send({ jobId: "anything" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_INVALID");
  });

  it("POST /api/auth/login is exempt — no CSRF token required even when enforced", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("x-csrf-test-bypass", "enforce")
      .send({ email: "x@y.io", password: "no" });
    // Login itself may return 400/401/etc., but it must NOT return 403 CSRF_INVALID.
    expect(res.status).not.toBe(403);
  });

  it("POST /api/auth/oauth/google/callback is exempt — uses OAuth state instead", async () => {
    const res = await request(app)
      .post("/api/auth/oauth/google/callback")
      .set("x-csrf-test-bypass", "enforce")
      .send({});
    // 400 (schema fail) or other OAuth-specific code, never 403 CSRF_INVALID.
    expect(res.body.code).not.toBe("CSRF_INVALID");
  });

  it("GET requests are never CSRF-gated", async () => {
    const res = await request(app)
      .get("/api/jobs")
      .set("x-csrf-test-bypass", "enforce");
    expect(res.status).not.toBe(403);
  });

  it("GET /api/auth/me returns a csrfToken value", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.body.csrfToken.length).toBeGreaterThan(0);
  });
});
