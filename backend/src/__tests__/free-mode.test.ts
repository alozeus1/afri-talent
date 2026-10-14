/**
 * FREE_MODE — read-time overlay that fully entitles every user without
 * touching Subscription rows. Each test toggles process.env.FREE_MODE.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { db } = vi.hoisted(() => {
  const db = {
    subscription: { findUnique: vi.fn(), findFirst: vi.fn() },
    planEntitlement: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    employer: { findUnique: vi.fn() },
    job: { findFirst: vi.fn() },
    application: { findMany: vi.fn() },
    aiRun: { count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return { db };
});

vi.mock("../lib/prisma.js", () => ({ default: db }));

import request from "supertest";
import { AiRunType, Role, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { requirePlan } from "../middleware/subscription.js";
import { makeMonthlySkillQuota } from "../middleware/quotas.js";
import { getUserEntitlements } from "../lib/billing/entitlements.js";
import { isFreeMode, topTierPlanForRole } from "../lib/billing/free-mode.js";
import {
  employerUpgradeJourney,
  isPlanSelectionDone,
} from "../lib/employer/onboarding.js";
import { billingIsRequiredForHealth } from "../lib/platform/health.js";

const envBackup = { ...process.env };

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function runMiddleware(
  mw: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  userId = "user-free-1",
) {
  const req = { user: { userId, email: "u@test.com", role: Role.CANDIDATE } } as unknown as Request;
  const res = mockRes();
  const next = vi.fn();
  return mw(req, res as unknown as Response, next).then(() => ({ res, next }));
}

function employerToken(): string {
  return signToken({ userId: "employer-uid", email: "e@test.com", role: Role.EMPLOYER });
}

const APPLICATION = {
  id: "app-1",
  jobId: "job-1",
  status: "PENDING",
  cvUrl: "https://cdn.example.com/cv.pdf",
  coverLetter: "Hello",
  candidate: { id: "cand-1", name: "Ada Lovelace", email: "ada@example.com" },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.planEntitlement.findUnique.mockResolvedValue(null);
  // A brand-new user: FREE plan, no paid subscription.
  db.subscription.findUnique.mockResolvedValue({
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.INACTIVE,
  });
  db.subscription.findFirst.mockResolvedValue({
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.INACTIVE,
  });
  db.user.findUnique.mockResolvedValue({ role: Role.CANDIDATE, emailVerified: true, email: "u@test.com" });
  db.employer.findUnique.mockResolvedValue({ id: "emp-1", userId: "employer-uid" });
  db.job.findFirst.mockResolvedValue({ id: "job-1", employerId: "emp-1" });
  db.application.findMany.mockResolvedValue([APPLICATION]);
  db.aiRun.count.mockResolvedValue(0);
});

afterEach(() => {
  process.env = { ...envBackup };
});

describe("free-mode helpers", () => {
  it("reads FREE_MODE on every call", () => {
    process.env.FREE_MODE = "true";
    expect(isFreeMode()).toBe(true);
    process.env.FREE_MODE = "1";
    expect(isFreeMode()).toBe(false);
    delete process.env.FREE_MODE;
    expect(isFreeMode()).toBe(false);
  });

  it("maps roles to the top tier", () => {
    expect(topTierPlanForRole(Role.CANDIDATE)).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(topTierPlanForRole(Role.EMPLOYER)).toBe(SubscriptionPlan.EMPLOYER_PREMIUM);
    expect(topTierPlanForRole(Role.ADMIN)).toBe(SubscriptionPlan.PROFESSIONAL);
  });
});

describe("FREE_MODE=true", () => {
  beforeEach(() => {
    process.env.FREE_MODE = "true";
  });

  it("requirePlan passes a FREE user without a DB lookup", async () => {
    const { res, next } = await runMiddleware(requirePlan(SubscriptionPlan.PROFESSIONAL));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
  });

  it("requirePlan still returns 401 without a user", async () => {
    const res = mockRes();
    const next = vi.fn();
    await requirePlan(SubscriptionPlan.PROFESSIONAL)(
      {} as Request,
      res as unknown as Response,
      next,
    );
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("getUserEntitlements returns the top tier by role and leaves the DB plan alone", async () => {
    db.user.findUnique.mockResolvedValueOnce({ role: Role.CANDIDATE });
    const candidate = await getUserEntitlements("cand-1");
    expect(candidate.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(candidate.autopilot).toBe(true);

    db.user.findUnique.mockResolvedValueOnce({ role: Role.EMPLOYER });
    const employer = await getUserEntitlements("emp-1");
    expect(employer.plan).toBe(SubscriptionPlan.EMPLOYER_PREMIUM);
    expect(employer.talentSearch).toBe(true);

    // Read-time overlay only: subscription rows are neither read nor written.
    expect(db.subscription.findUnique).not.toHaveBeenCalled();
  });

  it("employers see unmasked applicants", async () => {
    const res = await request(app)
      .get("/api/applications/job/job-1")
      .set("Authorization", `Bearer ${employerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0].candidate.name).toBe("Ada Lovelace");
    expect(res.body[0].candidate.email).toBe("ada@example.com");
    expect(res.body[0].cvUrl).toBe("https://cdn.example.com/cv.pdf");
    expect(res.body[0].locked).toBeUndefined();
  });

  it("checkout returns 409 billing_paused before any provider logic", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${employerToken()}`)
      .send({ plan: "EMPLOYER_PREMIUM" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("billing_paused");
    expect(res.body.message).toMatch(/free for everyone/);
  });

  it("monthly skill quota uses the free-mode limit with neutral copy", async () => {
    const mw = makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3);

    db.aiRun.count.mockResolvedValueOnce(3);
    const under = await runMiddleware(mw);
    expect(under.next).toHaveBeenCalledTimes(1);

    db.aiRun.count.mockResolvedValueOnce(30);
    const over = await runMiddleware(mw);
    expect(over.next).not.toHaveBeenCalled();
    expect(over.res.statusCode).toBe(429);
    const body = over.res.body as { message: string; quota: { limit: number } };
    expect(body.quota.limit).toBe(30);
    expect(body.message).toBe("Monthly limit reached for this tool. It resets on the 1st.");
    expect(body.message).not.toMatch(/Upgrade/);
  });

  it("honours FREE_MODE_MONTHLY_SKILL_LIMIT", async () => {
    process.env.FREE_MODE_MONTHLY_SKILL_LIMIT = "5";
    db.aiRun.count.mockResolvedValueOnce(5);
    const { res } = await runMiddleware(makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3));
    expect(res.statusCode).toBe(429);
    expect((res.body as { quota: { limit: number } }).quota.limit).toBe(5);
  });

  it("employer onboarding has no plan step blocker and no upsell", () => {
    expect(isPlanSelectionDone(SubscriptionPlan.EMPLOYER_FREE, null)).toBe(true);
    const journey = employerUpgradeJourney({
      plan: SubscriptionPlan.EMPLOYER_FREE,
      publishedJobs: 0,
      qualifiedApplicants: 0,
      candidateFiltersDone: false,
    });
    expect(journey.targetPlan).toBeNull();
    expect(journey.headline).toBe("Everything is unlocked");
    expect(journey.ctaLabel).toBe("");
  });

  it("billing is not required for health unless explicitly requested", () => {
    expect(billingIsRequiredForHealth({ FREE_MODE: "true", NODE_ENV: "production" })).toBe(false);
    expect(
      billingIsRequiredForHealth({ FREE_MODE: "true", NODE_ENV: "production", HEALTHCHECK_REQUIRE_BILLING: "1" }),
    ).toBe(true);
  });
});

describe("FREE_MODE off — existing behaviour unchanged", () => {
  beforeEach(() => {
    delete process.env.FREE_MODE;
  });

  it("requirePlan returns 403 for a FREE user", async () => {
    const { res, next } = await runMiddleware(requirePlan(SubscriptionPlan.PROFESSIONAL));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("getUserEntitlements uses the real subscription", async () => {
    const ent = await getUserEntitlements("cand-1");
    expect(ent.plan).toBe(SubscriptionPlan.FREE);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("employers without a paid plan see masked applicants", async () => {
    const res = await request(app)
      .get("/api/applications/job/job-1")
      .set("Authorization", `Bearer ${employerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body[0].candidate.name).toBe("Candidate 1");
    expect(res.body[0].cvUrl).toBeNull();
    expect(res.body[0].locked).toBe(true);
  });

  it("checkout does not return billing_paused", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${employerToken()}`)
      .send({ plan: "EMPLOYER_PREMIUM" });

    expect(res.status).not.toBe(409);
    expect(res.body.error).not.toBe("billing_paused");
  });

  it("monthly skill quota caps FREE users at the free limit with upgrade copy", async () => {
    db.aiRun.count.mockResolvedValueOnce(3);
    const { res, next } = await runMiddleware(makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    const body = res.body as { message: string; quota: { limit: number } };
    expect(body.quota.limit).toBe(3);
    expect(body.message).toMatch(/Upgrade to Professional/);
  });

  it("monthly skill quota bypass requires an ACTIVE paid plan (bug fix)", async () => {
    db.subscription.findUnique.mockResolvedValueOnce({
      plan: SubscriptionPlan.PROFESSIONAL,
      status: SubscriptionStatus.CANCELLED,
    });
    db.aiRun.count.mockResolvedValueOnce(3);
    const cancelled = await runMiddleware(makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3));
    expect(cancelled.res.statusCode).toBe(429);

    db.subscription.findUnique.mockResolvedValueOnce({
      plan: SubscriptionPlan.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
    });
    const active = await runMiddleware(makeMonthlySkillQuota(AiRunType.CAREER_GAP_EXPLAIN, 3));
    expect(active.next).toHaveBeenCalledTimes(1);
  });

  it("employer upgrade journey still upsells", () => {
    expect(isPlanSelectionDone(SubscriptionPlan.EMPLOYER_FREE, null)).toBe(false);
    const journey = employerUpgradeJourney({
      plan: SubscriptionPlan.EMPLOYER_FREE,
      publishedJobs: 0,
      qualifiedApplicants: 0,
      candidateFiltersDone: false,
    });
    expect(journey.targetPlan).toBe(SubscriptionPlan.EMPLOYER_BASIC);
  });
});
