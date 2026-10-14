/**
 * P2 route fixes — status codes and data integrity on core routes:
 *   - global error handler maps body-parser / CORS errors to 4xx
 *   - path-scoped body limits for long-text AI endpoints
 *   - DELETE /api/jobs/:id closes jobs that have applications; PUT can close/reopen
 *   - company review moderation recomputes aggregates; helpful votes scoped + 404
 *   - message pagination guards against NaN / zero pages
 *   - duplicate applies return 409 (pre-check and P2002 race)
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../middleware/account-standing.js", () => ({
  requireAccountStanding: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/trust/risk.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/trust/risk.js")>("../lib/trust/risk.js");
  return {
    ...actual,
    assessApplicationRisk: vi.fn(() => ({ score: 0, level: "LOW", flags: [], autoHold: false })),
  };
});

vi.mock("../lib/trust/service.js", () => ({
  addTrustCaseAction: vi.fn().mockResolvedValue(undefined),
  createTrustCase: vi.fn().mockResolvedValue({ id: "case_1" }),
  recordTrustRiskEvent: vi.fn().mockResolvedValue(undefined),
  refreshCandidateTrustProfile: vi.fn().mockResolvedValue({ id: "ctp_1", riskScore: 0 }),
  refreshEmployerTrustProfile: vi.fn().mockResolvedValue({ id: "etp_1", postingEligibility: true }),
  employerTrustSummary: vi.fn(() => ({})),
  jobTrustSummary: vi.fn(() => ({})),
}));

vi.mock("../lib/prisma.js", () => ({
  default: {
    job: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employer: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    application: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    companyReview: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    companyRatingAggregate: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    interviewExperience: { updateMany: vi.fn() },
    messageThread: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from "../lib/prisma.js";
import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function token(role: Role, userId: string): string {
  return signToken({ userId, email: `${userId}@test.com`, role });
}

const employerToken = () => token(Role.EMPLOYER, "emp_user");
const candidateToken = () => token(Role.CANDIDATE, "cand_user");
const adminToken = () => token(Role.ADMIN, "admin_user");

const APPLY_JOB_ID = "11111111-1111-4111-8111-111111111111";
const OWNED_JOB = { id: "job_1", slug: "job-1-slug", employerId: "emp_1", status: "PUBLISHED" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("global error handler", () => {
  it("returns 400 with a generic message for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": bad json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request body");
    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|Expected/);
  });

  it("returns 413 for a body over the global 10kb limit", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@b.com", password: "x".repeat(20 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("Request body too large");
  });

  it("returns 403 for a disallowed CORS origin", async () => {
    const res = await request(app).get("/api/jobs").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe("Not allowed by CORS");
  });
});

describe("path-scoped body limits", () => {
  it("does not reject a 40KB job-extract body with 413", async () => {
    const res = await request(app)
      .post("/api/job-extract")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ text: "a".repeat(40 * 1024) }));
    expect(res.status).not.toBe(413);
  });

  it("does not reject a 40KB resume-builder body with 413", async () => {
    const res = await request(app)
      .post("/api/skills/resume-builder/save")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ rawText: "a".repeat(40 * 1024) }));
    expect(res.status).not.toBe(413);
  });
});

describe("DELETE /api/jobs/:id", () => {
  beforeEach(() => {
    db.employer.findUnique.mockResolvedValue({ id: "emp_1", userId: "emp_user" });
    db.job.findFirst.mockResolvedValue(OWNED_JOB);
  });

  it("closes (unpublishes) a job that has applications instead of deleting it", async () => {
    db.application.count.mockResolvedValueOnce(3);
    db.job.update.mockResolvedValueOnce({ ...OWNED_JOB, status: "DRAFT" });

    const res = await request(app)
      .delete("/api/jobs/job_1")
      .set("Authorization", `Bearer ${employerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(true);
    expect(db.job.delete).not.toHaveBeenCalled();
    expect(db.job.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: { status: "DRAFT" },
    });
  });

  it("hard-deletes a job with no applications", async () => {
    db.application.count.mockResolvedValueOnce(0);
    db.job.delete.mockResolvedValueOnce(OWNED_JOB);

    const res = await request(app)
      .delete("/api/jobs/job_1")
      .set("Authorization", `Bearer ${employerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.closed).toBeUndefined();
    expect(db.job.delete).toHaveBeenCalledWith({ where: { id: "job_1" } });
  });

  it("maps a foreign-key violation (P2003) to 409", async () => {
    db.application.count.mockResolvedValueOnce(0);
    db.job.delete.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "P2003" }));

    const res = await request(app)
      .delete("/api/jobs/job_1")
      .set("Authorization", `Bearer ${employerToken()}`);

    expect(res.status).toBe(409);
  });
});

describe("PUT /api/jobs/:id status", () => {
  it("closes a job when status DRAFT is sent, without re-running publish logic", async () => {
    db.employer.findUnique.mockResolvedValueOnce({ id: "emp_1", userId: "emp_user" });
    db.job.findFirst.mockResolvedValueOnce(OWNED_JOB);
    db.job.update.mockResolvedValueOnce({ ...OWNED_JOB, status: "DRAFT" });

    const res = await request(app)
      .put("/api/jobs/job_1")
      .set("Authorization", `Bearer ${employerToken()}`)
      .send({ status: "DRAFT" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.closed).toBe(true);
    expect(db.job.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: { status: "DRAFT" },
    });
  });

  it("rejects non-closable status values", async () => {
    const res = await request(app)
      .put("/api/jobs/job_1")
      .set("Authorization", `Bearer ${employerToken()}`)
      .send({ status: "REJECTED" });

    expect(res.status).toBe(400);
    expect(db.job.update).not.toHaveBeenCalled();
  });
});

describe("company review moderation", () => {
  it("validates the body", async () => {
    const res = await request(app)
      .patch("/api/companies/co_1/reviews/rev_1/moderate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ approved: "yes" });
    expect(res.status).toBe(400);
    expect(db.companyReview.update).not.toHaveBeenCalled();
  });

  it("recomputes aggregates on reject and deletes the aggregate when no approved reviews remain", async () => {
    db.companyReview.update.mockResolvedValueOnce({ id: "rev_1", companyId: "co_1", isApproved: false });
    db.companyReview.findMany.mockResolvedValueOnce([]);
    db.companyRatingAggregate.deleteMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .patch("/api/companies/co_1/reviews/rev_1/moderate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ approved: false });

    expect(res.status).toBe(200);
    expect(db.companyRatingAggregate.deleteMany).toHaveBeenCalledWith({ where: { companyId: "co_1" } });
    expect(db.companyRatingAggregate.upsert).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown review id (P2025)", async () => {
    db.companyReview.update.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "P2025" }));

    const res = await request(app)
      .patch("/api/companies/co_1/reviews/missing/moderate")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ approved: true });

    expect(res.status).toBe(404);
  });
});

describe("helpful endpoints", () => {
  it("scopes company review votes to the company and approved reviews", async () => {
    db.companyReview.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post("/api/companies/co_1/reviews/rev_1/helpful")
      .set("Authorization", `Bearer ${candidateToken()}`);

    expect(res.status).toBe(200);
    expect(db.companyReview.updateMany).toHaveBeenCalledWith({
      where: { id: "rev_1", companyId: "co_1", isApproved: true },
      data: { helpfulCount: { increment: 1 } },
    });
  });

  it("returns 404 when the company review does not match", async () => {
    db.companyReview.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post("/api/companies/co_1/reviews/nope/helpful")
      .set("Authorization", `Bearer ${candidateToken()}`);

    expect(res.status).toBe(404);
  });

  it("returns 404 when the interview experience is missing or unapproved", async () => {
    db.interviewExperience.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post("/api/interview-experiences/exp_1/helpful")
      .set("Authorization", `Bearer ${candidateToken()}`);

    expect(res.status).toBe(404);
    expect(db.interviewExperience.updateMany).toHaveBeenCalledWith({
      where: { id: "exp_1", isApproved: true },
      data: { helpfulCount: { increment: 1 } },
    });
  });
});

describe("message pagination", () => {
  it.each(["abc", "0", "-3"])("treats page=%s as page 1", async (page) => {
    db.messageThread.findMany.mockResolvedValueOnce([]);
    db.messageThread.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .get(`/api/messages/threads?page=${page}`)
      .set("Authorization", `Bearer ${candidateToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(db.messageThread.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });
});

describe("POST /api/applications duplicate handling", () => {
  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ emailVerified: true, email: "cand_user@test.com" });
    db.job.findUnique.mockResolvedValue({ id: "job_1", status: "PUBLISHED", isExpired: false });
  });

  it("returns 409 when the candidate already applied (pre-check)", async () => {
    db.application.findFirst.mockResolvedValueOnce({ id: "app_1" });

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${candidateToken()}`)
      .send({ jobId: APPLY_JOB_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("You have already applied to this job");
  });

  it("returns 409 when a concurrent duplicate hits the unique constraint (P2002)", async () => {
    db.application.findFirst.mockResolvedValueOnce(null);
    db.application.count.mockResolvedValueOnce(0);
    db.application.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", `Bearer ${candidateToken()}`)
      .send({ jobId: APPLY_JOB_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("You have already applied to this job");
  });
});
