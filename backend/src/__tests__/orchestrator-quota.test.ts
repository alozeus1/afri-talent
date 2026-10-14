/**
 * AiRun quota + failure bookkeeping for POST /api/orchestrator/run.
 *
 * - checkDailyQuota counts COMPLETE/PARTIAL rows and RUNNING rows from the
 *   last 15 minutes (in-flight runs), so concurrent requests can't all slip
 *   past the check.
 * - A run that throws is marked BLOCKED via failAiRun, and an agent schema
 *   failure ("... failed schema validation: ...") maps to a friendly 502.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const { aiRunCount, runOrchestratorMock, persistence } = vi.hoisted(() => ({
  aiRunCount: vi.fn(),
  runOrchestratorMock: vi.fn(),
  persistence: {
    createAiRun: vi.fn().mockResolvedValue(undefined),
    completeAiRun: vi.fn().mockResolvedValue(undefined),
    failAiRun: vi.fn().mockResolvedValue(undefined),
    getRunHistory: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../lib/ai/persistence.js", () => persistence);

vi.mock("../lib/prisma.js", () => ({
  default: {
    aiRun: { count: aiRunCount },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/ai/orchestrator/index.js", () => ({
  runOrchestrator: runOrchestratorMock,
}));

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

function token(): string {
  return signToken({ userId: "quota-candidate-uid", email: "q@test.com", role: Role.CANDIDATE });
}

const RESUME = "A".repeat(100);

beforeEach(() => {
  aiRunCount.mockReset();
  runOrchestratorMock.mockReset();
  persistence.createAiRun.mockClear();
  persistence.failAiRun.mockClear();
  persistence.completeAiRun.mockClear();
});

describe("checkDailyQuota", () => {
  it("counts COMPLETE/PARTIAL plus RUNNING rows from the last 15 minutes", async () => {
    aiRunCount.mockResolvedValue(0);
    runOrchestratorMock.mockResolvedValue({
      status: "ok",
      run_id: "x",
      budget: { token_budget_total: 60000, token_used_estimate: 0, stopped_reason: null },
      ranked_jobs: [],
      tailored_outputs: [],
      notes_for_ui: [],
    });

    const before = Date.now();
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token()}`)
      .send({ run_type: "resume_review", resume_text: RESUME });
    expect(res.status).toBe(200);

    const where = aiRunCount.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { status: { in: ["COMPLETE", "PARTIAL"] } },
      { status: "RUNNING", createdAt: { gte: expect.any(Date) } },
    ]);
    const runningSince: Date = where.OR[1].createdAt.gte;
    const windowMs = before - runningSince.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
    expect(windowMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);

    // createAiRun is awaited before the orchestrator runs
    expect(persistence.createAiRun).toHaveBeenCalledTimes(1);
    expect(persistence.createAiRun.mock.invocationCallOrder[0]).toBeLessThan(
      runOrchestratorMock.mock.invocationCallOrder[0]
    );
  });

  it("returns 429 when the count (including in-flight runs) reaches the limit", async () => {
    aiRunCount.mockResolvedValue(10); // DAILY_RESUME_REVIEW_LIMIT default
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token()}`)
      .send({ run_type: "resume_review", resume_text: RESUME });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("daily_quota_exceeded");
    expect(runOrchestratorMock).not.toHaveBeenCalled();
  });
});

describe("orchestrator failures", () => {
  it("maps 'failed schema validation' to a friendly 502 and marks the run BLOCKED", async () => {
    aiRunCount.mockResolvedValue(0);
    runOrchestratorMock.mockRejectedValue(
      new Error("ResumeParserAgent output failed schema validation: [experience.0.start_date] bad")
    );

    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token()}`)
      .send({ run_type: "resume_review", resume_text: RESUME });

    expect(res.status).toBe(502);
    expect(res.body.budget.stopped_reason).toBe("agent_schema_error");
    expect(res.body.error).not.toContain("experience.0");
    expect(persistence.failAiRun).toHaveBeenCalledTimes(1);
    expect(persistence.failAiRun.mock.calls[0][0]).toBe(res.body.run_id);
    expect(persistence.completeAiRun).not.toHaveBeenCalled();
  });

  it("marks the run BLOCKED on a generic failure (500)", async () => {
    aiRunCount.mockResolvedValue(0);
    runOrchestratorMock.mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .post("/api/orchestrator/run")
      .set("Authorization", `Bearer ${token()}`)
      .send({ run_type: "resume_review", resume_text: RESUME });
    expect(res.status).toBe(500);
    expect(persistence.failAiRun).toHaveBeenCalledTimes(1);
  });
});
