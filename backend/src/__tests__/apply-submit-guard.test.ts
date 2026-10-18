/**
 * Shared apply guard (lib/apply/submit-guard.ts) and the paths that use it:
 * autopilot batch (cap / verified email / expired job) and quick-apply.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// authenticate rehydrates the account per request; model the account behind
// every token this suite mints (see helpers/current-account.ts).
vi.mock("../lib/jwt.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockJwtModule(importOriginal));
vi.mock("../lib/account-access.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockAccountAccessModule(importOriginal));

const { db, coverLetter } = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn() },
    job: { findUnique: vi.fn() },
    application: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    autoApplyBatch: { create: vi.fn(), update: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    employer: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return { db, coverLetter: vi.fn() };
});

vi.mock("../lib/prisma.js", () => ({ default: db }));
vi.mock("../lib/trust/service.js", () => ({
  refreshCandidateTrustProfile: vi.fn().mockResolvedValue({ riskScore: 0 }),
  recordTrustRiskEvent: vi.fn().mockResolvedValue(undefined),
  createTrustCase: vi.fn().mockResolvedValue({ id: "case-1" }),
  addTrustCaseAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/ai/cover-letter.js", () => ({ generateQuickCoverLetter: coverLetter }));
vi.mock("../lib/queues/apply-queues.js", () => ({
  getApplyQueue: () => null,
  isApplyQueuesEnabled: () => false,
}));
vi.mock("../lib/billing/entitlements.js", () => ({
  getUserEntitlements: vi.fn().mockResolvedValue({ plan: "FREE", autopilot: false, videoMockInterviews: 0 }),
}));

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";
import { SubmitGuardError, assertCanSubmitApplication } from "../lib/apply/submit-guard.js";

const USER_ID = "guard-user-uid";
const JOB_A = "11111111-1111-4111-8111-111111111111";
const JOB_B = "22222222-2222-4222-8222-222222222222";

function token(): string {
  return signToken({ userId: USER_ID, email: "g@test.com", role: Role.CANDIDATE });
}

function publishedJob(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: "Engineer",
    description: "desc",
    status: "PUBLISHED",
    isExpired: false,
    employerId: null,
    sourceName: "Acme",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: USER_ID,
    name: "Guard User",
    email: "g@test.com",
    emailVerified: true,
    accountRestrictionStatus: "CLEAR",
    accountRestrictionReason: null,
  });
  db.job.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(publishedJob(where.id)),
  );
  db.application.findFirst.mockResolvedValue(null);
  db.application.findMany.mockResolvedValue([]);
  db.application.count.mockResolvedValue(0);
  db.application.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "app-1", ...data }),
  );
  db.autoApplyBatch.create.mockResolvedValue({ id: "batch-1" });
  db.autoApplyBatch.update.mockResolvedValue({});
  db.candidateProfile.findUnique.mockResolvedValue({
    headline: "Dev", skills: ["ts"], bio: null, yearsExperience: 3, resumes: [{ s3Key: "cv.pdf" }],
  });
  coverLetter.mockResolvedValue({ coverLetter: "Dear team", source: "template" });
});

describe("assertCanSubmitApplication", () => {
  it("passes for a verified user and a published, unexpired job", async () => {
    const res = await assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A });
    expect(res.job.id).toBe(JOB_A);
  });

  it("rejects an expired job with JOB_NOT_AVAILABLE", async () => {
    db.job.findUnique.mockResolvedValue(publishedJob(JOB_A, { isExpired: true }));
    await expect(assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A })).rejects.toMatchObject({
      code: "JOB_NOT_AVAILABLE",
      httpStatus: 404,
    });
  });

  it("rejects an unverified user with 403", async () => {
    db.user.findUnique.mockResolvedValue({ emailVerified: false, accountRestrictionStatus: "CLEAR" });
    const err = await assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A }).catch((e) => e);
    expect(err).toBeInstanceOf(SubmitGuardError);
    expect(err.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(err.httpStatus).toBe(403);
  });

  it("rejects a suspended account", async () => {
    db.user.findUnique.mockResolvedValue({ emailVerified: true, accountRestrictionStatus: "SUSPENDED" });
    await expect(assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A })).rejects.toMatchObject({
      code: "ACCOUNT_SUSPENDED",
    });
  });

  it("rejects a duplicate application", async () => {
    db.application.findFirst.mockResolvedValue({ id: "existing" });
    await expect(assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A })).rejects.toMatchObject({
      code: "ALREADY_APPLIED",
      httpStatus: 409,
    });
  });

  it("rejects once the daily automated-apply cap is reached", async () => {
    db.application.count.mockResolvedValue(20);
    await expect(assertCanSubmitApplication({ userId: USER_ID, jobId: JOB_A })).rejects.toMatchObject({
      code: "DAILY_APPLY_CAP",
      httpStatus: 429,
    });
  });
});

describe("POST /api/autopilot/batch", () => {
  it("returns 429 when the batch would exceed the daily cap", async () => {
    db.application.count.mockResolvedValue(18); // 18 + 5 > 20
    const jobIds = Array.from({ length: 5 }, (_, i) => `job-${i}`);
    const res = await request(app)
      .post("/api/autopilot/batch")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobIds, confirm: true });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("DAILY_APPLY_CAP");
    expect(db.autoApplyBatch.create).not.toHaveBeenCalled();
  });

  it("rejects more than 10 jobs per batch", async () => {
    const jobIds = Array.from({ length: 11 }, (_, i) => `job-${i}`);
    const res = await request(app)
      .post("/api/autopilot/batch")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobIds, confirm: true });
    expect(res.status).toBe(400);
  });

  it("returns 403 for an unverified user", async () => {
    db.user.findUnique.mockResolvedValue({
      id: USER_ID, emailVerified: false, email: "g@test.com", accountRestrictionStatus: "CLEAR",
    });
    const res = await request(app)
      .post("/api/autopilot/batch")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobIds: [JOB_A], confirm: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });

  it("skips an expired job and applies to the valid one", async () => {
    db.job.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(publishedJob(where.id, where.id === JOB_A ? { isExpired: true } : {})),
    );
    const res = await request(app)
      .post("/api/autopilot/batch")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobIds: [JOB_A, JOB_B], confirm: true });
    expect(res.status).toBe(202);

    await vi.waitFor(() => {
      expect(db.autoApplyBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }),
      );
    });
    expect(db.application.create).toHaveBeenCalledTimes(1);
    expect(db.application.create.mock.calls[0][0].data.jobId).toBe(JOB_B);
    expect(db.application.create.mock.calls[0][0].data.riskLevel).toBeDefined();
    expect(db.autoApplyBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { jobsFailed: { increment: 1 } } }),
    );
  });
});

describe("POST /api/quick-apply", () => {
  it("returns 403 for an unverified user", async () => {
    db.user.findUnique.mockResolvedValue({
      id: USER_ID, emailVerified: false, email: "g@test.com", accountRestrictionStatus: "CLEAR",
    });
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_A, confirm: true });
    expect(res.status).toBe(403);
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an expired job without generating a cover letter", async () => {
    db.job.findUnique.mockResolvedValue(publishedJob(JOB_A, { isExpired: true }));
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_A, confirm: true });
    expect(res.status).toBe(404);
    expect(coverLetter).not.toHaveBeenCalled();
  });

  it("creates the application with risk fields when allowed", async () => {
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_A, confirm: true });
    expect(res.status).toBe(201);
    const data = db.application.create.mock.calls[0][0].data;
    expect(data.notes).toBe("[Quick Apply]");
    expect(data.riskLevel).toBeDefined();
  });
});
