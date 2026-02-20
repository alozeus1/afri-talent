/**
 * Orchestrator HTTP route tests.
 *
 * Environment (set by vitest.config.ts):
 *   MOCK_AI=1      → orchestrator returns deterministic stubs, no Claude calls
 *   NODE_ENV=test  → health/ready endpoints skip DB; rate limiters use in-memory store
 *
 * Auth: signToken() uses the fallback secret ("dev-only-secret-change-in-production")
 * when JWT_SECRET is not set, so test tokens are valid without any env var.
 *
 * Persistence: mocked below so no DB is required.
 */

import { vi, describe, it, expect } from "vitest";

// ── Mocks (hoisted by vitest before imports) ──────────────────────────────────

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a valid Bearer token for a CANDIDATE test user. */
function makeCandidateToken(): string {
  return signToken({
    userId: "test-candidate-uid",
    email: "candidate@test.com",
    role: Role.CANDIDATE,
  });
}

/** Minimum-length resume text (100 chars). */
const VALID_RESUME = "A".repeat(100);

/** Minimum-length job text (50 chars). */
const VALID_JOB = "B".repeat(50);

// ── Tests: POST /api/orchestrator/run ─────────────────────────────────────────

describe("POST /api/orchestrator/run — auth enforcement", () => {
  it("returns 401 with no auth token", async () => {
    const res = await request(app)
      .post("/api/orchestrator/run")
      .send({ run_type: "resume_review", resume_text: VALID_RESUME });
    expect(res.status).toBe(401);
  });

  it("returns 401 with a malformed Bearer token", async () => {
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", "Bearer not-a-valid-jwt")
      .send({ run_type: "resume_review", resume_text: VALID_RESUME });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/orchestrator/run — request validation (400)", () => {
  it("returns 400 with fieldErrors for empty body", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    // The response always includes `details` from Zod's flatten()
    expect(res.body.details).toBeDefined();
    expect(res.body.details.fieldErrors).toBeDefined();
  });

  it("returns 400 with resume_text fieldError when text is too short", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({ run_type: "resume_review", resume_text: "too short" });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.resume_text).toBeDefined();
  });

  // Note: testing resume_text > 30 000 chars via HTTP is not feasible here
  // because the general 10kb body-size guard fires first (Express returns 500
  // before Zod validation runs). The Zod max-length constraint is covered by
  // the pure unit tests in orchestrator-validators.test.ts instead.

  it("returns 400 when job_match is sent without jobs array", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({ run_type: "job_match", resume_text: VALID_RESUME });
    // Route rejects because job_match requires at least one job
    expect(res.status).toBe(400);
  });

  it("returns 400 when job raw_text is too short", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "job_match",
        resume_text: VALID_RESUME,
        jobs: [{ raw_text: "short" }], // < 50 chars
      });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it("returns 400 when token_budget_total exceeds schema max (120 000)", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "resume_review",
        resume_text: VALID_RESUME,
        limits: { token_budget_total: 999_999 },
      });
    expect(res.status).toBe(400);
    // Error is nested under limits — just verify the response shape is correct
    expect(res.body.details).toBeDefined();
  });
});

describe("POST /api/orchestrator/run — mock AI mode (200)", () => {
  it("returns 200 with mock resume_json for resume_review", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "resume_review",
        resume_text: VALID_RESUME,
        limits: { token_budget_total: 15_000 },
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.run_id).toBe("string");
    expect(res.body.resume_json).toBeDefined();
    expect(Array.isArray(res.body.ranked_jobs)).toBe(true);
    expect(res.body.ranked_jobs).toHaveLength(0); // resume_review has no jobs
  });

  it("returns 200 with ranked_jobs for job_match", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "job_match",
        resume_text: VALID_RESUME,
        jobs: [{ raw_text: VALID_JOB }],
        limits: { token_budget_total: 30_000 },
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.ranked_jobs)).toBe(true);
    expect(res.body.ranked_jobs.length).toBeGreaterThan(0);
    // Validate shape of the first ranked job
    const job = res.body.ranked_jobs[0];
    expect(typeof job.job_id).toBe("string");
    expect(typeof job.match.score).toBe("number");
    expect(["apply", "stretch", "skip"]).toContain(job.match.recommendation);
  });

  it("returns 200 with tailored_outputs for apply_pack", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "apply_pack",
        resume_text: VALID_RESUME,
        jobs: [{ raw_text: VALID_JOB }],
        limits: { max_tailored_jobs: 1, token_budget_total: 60_000 },
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(Array.isArray(res.body.tailored_outputs)).toBe(true);
    expect(res.body.tailored_outputs.length).toBeGreaterThan(0);
    // Validate apply pack output shape
    const output = res.body.tailored_outputs[0];
    expect(output.tailored_resume).toBeDefined();
    expect(output.cover_letter_pack).toBeDefined();
    expect(output.guard_report.verdict).toMatch(/^(PASS|FAIL)$/);
  });

  it("job_id passed by client is preserved in ranked_jobs", async () => {
    const token = makeCandidateToken();
    const CLIENT_JOB_ID = "slot-42";
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token}`)
      .send({
        run_type: "job_match",
        resume_text: VALID_RESUME,
        jobs: [{ raw_text: VALID_JOB, job_id: CLIENT_JOB_ID }],
        limits: { token_budget_total: 30_000 },
      });
    expect(res.status).toBe(200);
    const ids = res.body.ranked_jobs.map((j: { job_id: string }) => j.job_id);
    expect(ids).toContain(CLIENT_JOB_ID);
  });
});

// ── Tests: GET /api/orchestrator/runs ────────────────────────────────────────

describe("GET /api/orchestrator/runs", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/orchestrator/runs");
    expect(res.status).toBe(401);
  });

  it("returns 200 with a runs array for authenticated candidate", async () => {
    const token = makeCandidateToken();
    const res = await request(app)
      .get("/api/orchestrator/runs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
  });
});
