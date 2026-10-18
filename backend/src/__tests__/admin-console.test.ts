import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/redis.js", () => ({
  redisClient: null,
  blockToken: vi.fn(),
  isTokenBlocked: vi.fn().mockResolvedValue(false),
  isRedisConfigured: vi.fn().mockReturnValue(false),
  isRedisAvailable: vi.fn().mockReturnValue(false),
  isRedisRequired: vi.fn().mockReturnValue(false),
  redisHealthStatus: vi.fn().mockResolvedValue("not_configured"),
}));

vi.mock("../routes/email-verification.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../routes/email-verification.js")>();
  return { ...actual, issueEmailVerification: vi.fn().mockResolvedValue({ token: "t", expiresAt: new Date() }) };
});

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed"),
    compare: vi.fn().mockImplementation(async (pass: string) => pass === "Password123!"),
  },
  compare: vi.fn().mockImplementation(async (pass: string) => pass === "Password123!"),
  hash: vi.fn().mockResolvedValue("hashed"),
}));

vi.mock("../lib/prisma.js", () => {
  const db: Record<string, unknown> = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      groupBy: vi.fn(),
    },
    adminRole: { findUnique: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }), findMany: vi.fn().mockResolvedValue([]) },
    job: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    adminReview: { create: vi.fn().mockResolvedValue({}) },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notif-1" }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    messageThread: { create: vi.fn().mockResolvedValue({ id: "thread-1" }) },
    employer: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    employerTrustProfile: { upsert: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  db.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(db));
  return { default: db };
});

import request from "supertest";
import { AccountRestrictionStatus, AdminPermission, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { evaluateAccountAccess } from "../lib/account-access.js";

type Mocked = ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  user: Record<string, Mocked>;
  adminRole: Record<string, Mocked>;
  auditLog: Record<string, Mocked>;
  job: Record<string, Mocked>;
  notification: Record<string, Mocked>;
  messageThread: Record<string, Mocked>;
  employer: Record<string, Mocked>;
  employerTrustProfile: Record<string, Mocked>;
};

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";
const ALL_PERMISSIONS = Object.values(AdminPermission);

const adminToken = signToken({ userId: ADMIN_ID, email: "admin@test.com", role: Role.ADMIN });
const candidateToken = signToken({ userId: CANDIDATE_ID, email: "cand@test.com", role: Role.CANDIDATE });

type AccessState = {
  accountRestrictionStatus: AccountRestrictionStatus;
  accountRestrictionReason: string | null;
  accountRestrictedUntil: Date | null;
  sessionsRevokedAt: Date | null;
  deletedAt: Date | null;
};

const active = (): AccessState => ({
  accountRestrictionStatus: AccountRestrictionStatus.ACTIVE,
  accountRestrictionReason: null,
  accountRestrictedUntil: null,
  sessionsRevokedAt: null,
  deletedAt: null,
});

// Simulated persisted state for the candidate under test.
let candidateState: AccessState;

function candidateRecord() {
  return {
    id: CANDIDATE_ID,
    email: "cand@test.com",
    name: "Ada Candidate",
    role: Role.CANDIDATE,
    emailVerified: true,
    password: "hashed",
    employer: null,
    adminRole: null,
    oauthAccounts: [],
    totpEnrolledAt: null,
    totpGraceUntil: null,
    deletionRequestedAt: null,
    ...candidateState,
  };
}

function isCurrentAccountLookup(args: { select?: Record<string, boolean> }): boolean {
  return args.select?.sessionsRevokedAt === true && args.select?.accountRestrictionStatus === true;
}

function setAdminPermissions(permissions: AdminPermission[] | null) {
  db.adminRole.findUnique.mockResolvedValue(
    permissions === null
      ? null
      : { id: "admin-role-1", adminId: ADMIN_ID, title: "Ops", permissions, isActive: true },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  candidateState = active();
  setAdminPermissions(ALL_PERMISSIONS);

  db.user.findUnique.mockImplementation(async (args: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) => {
    // Current-account lookup used by `authenticate` (role + access gate).
    if (isCurrentAccountLookup(args)) {
      if (args.where.id === CANDIDATE_ID) {
        return { id: CANDIDATE_ID, email: "cand@test.com", role: Role.CANDIDATE, ...candidateState };
      }
      if (args.where.id === ADMIN_ID) return { id: ADMIN_ID, email: "admin@test.com", role: Role.ADMIN, ...active() };
      return null;
    }
    if (args.where.id === CANDIDATE_ID || args.where.email === "cand@test.com") return candidateRecord();
    return null;
  });

  // Persist lifecycle updates into the simulated state.
  db.user.update.mockImplementation(async (args: { data: Partial<AccessState> & { emailVerified?: boolean } }) => {
    candidateState = { ...candidateState, ...(args.data as Partial<AccessState>) };
    return { ...candidateRecord(), ...args.data };
  });
});

const lifecycle = (body: Record<string, unknown>, token = adminToken) =>
  request(app)
    .post(`/api/admin/console/users/${CANDIDATE_ID}/lifecycle`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

const login = () =>
  request(app).post("/api/auth/login").send({ email: "cand@test.com", password: "Password123!" });

const protectedCall = (token = candidateToken) =>
  request(app).get("/api/notifications/unread-count").set("Authorization", `Bearer ${token}`);

describe("admin console — authorization", () => {
  const endpoints: Array<[string, string, Record<string, unknown>?]> = [
    ["get", "/api/admin/console/overview"],
    ["get", "/api/admin/console/users"],
    ["get", `/api/admin/console/users/${CANDIDATE_ID}`],
    ["post", `/api/admin/console/users/${CANDIDATE_ID}/lifecycle`, { action: "ban", reason: "spam ring" }],
    ["post", `/api/admin/console/users/${CANDIDATE_ID}/message`, { subject: "Hello", body: "Hi" }],
    ["post", "/api/admin/console/messages/broadcast", { subject: "Hello", body: "Hi" }],
    ["get", "/api/admin/console/companies"],
    ["post", "/api/admin/console/companies/x/verification", { level: "UNVERIFIED", reason: "check" }],
    ["get", "/api/admin/console/jobs"],
    ["post", "/api/admin/console/jobs/x/action", { action: "feature", reason: "great role" }],
  ];

  it.each(endpoints)("%s %s returns 403 for a non-admin", async (method, path, body) => {
    const agent = request(app)[method as "get" | "post"](path).set("Authorization", `Bearer ${candidateToken}`);
    const res = body ? await agent.send(body) : await agent;
    expect(res.status).toBe(403);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/admin/console/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the admin role is inactive or missing", async () => {
    setAdminPermissions(null);
    const res = await request(app).get("/api/admin/console/users").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 403 when the admin lacks the specific permission", async () => {
    setAdminPermissions([AdminPermission.VIEW_USERS]);
    const res = await lifecycle({ action: "suspend", reason: "fraud signals" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("RESTRICT_USER_ACCOUNT");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("enforces the admin TOTP gate on console mutations", async () => {
    const defaultLookup = db.user.findUnique.getMockImplementation() as (args: unknown) => Promise<unknown>;
    db.user.findUnique.mockImplementation(async (args: { where: { id?: string }; select?: Record<string, boolean> }) =>
      isCurrentAccountLookup(args)
        ? defaultLookup(args)
        : { role: Role.ADMIN, totpEnrolledAt: null, totpGraceUntil: null, adminRole: { id: "admin-role-1" } },
    );
    const res = await lifecycle({ action: "ban", reason: "spam" }).set("x-admin-totp-test-bypass", "enforce");
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TOTP_ENROLMENT_REQUIRED");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("admin console — account lifecycle", () => {
  it("requires a reason", async () => {
    const res = await lifecycle({ action: "suspend" });
    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to act on the admin's own account", async () => {
    const res = await request(app)
      .post(`/api/admin/console/users/${ADMIN_ID}/lifecycle`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "suspend", reason: "testing self" });
    expect(res.status).toBe(400);
  });

  it("suspend -> login blocked + JWT rejected -> reactivate restores access, with audit entries", async () => {
    // Baseline: active candidate can log in and use protected routes.
    expect((await login()).status).toBe(200);
    expect((await protectedCall()).status).toBe(200);

    const suspend = await lifecycle({ action: "suspend", reason: "Suspicious payment requests" });
    expect(suspend.status).toBe(200);
    expect(candidateState.accountRestrictionStatus).toBe(AccountRestrictionStatus.SUSPENDED);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "USER_SUSPENDED",
          targetType: "USER",
          targetId: CANDIDATE_ID,
          adminId: "admin-role-1",
          reason: "Suspicious payment requests",
        }),
      }),
    );

    const blockedLogin = await login();
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.code).toBe("ACCOUNT_SUSPENDED");
    expect(blockedLogin.body.error).toMatch(/suspended/i);

    const blockedCall = await protectedCall();
    expect(blockedCall.status).toBe(403);
    expect(blockedCall.body.code).toBe("ACCOUNT_SUSPENDED");

    const reactivate = await lifecycle({ action: "reactivate", reason: "Cleared after review" });
    expect(reactivate.status).toBe(200);
    expect(candidateState.accountRestrictionStatus).toBe(AccountRestrictionStatus.ACTIVE);
    expect(db.auditLog.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_REACTIVATED", targetId: CANDIDATE_ID }) }),
    );

    expect((await login()).status).toBe(200);
    expect((await protectedCall()).status).toBe(200);
  });

  it("ban blocks login with ACCOUNT_BANNED and is audited", async () => {
    const res = await lifecycle({ action: "ban", reason: "Confirmed scam employer" });
    expect(res.status).toBe(200);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_BANNED" }) }),
    );
    const blocked = await login();
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("ACCOUNT_BANNED");
  });

  it("rejects a suspension end date in the past", async () => {
    const res = await lifecycle({
      action: "suspend",
      reason: "temp hold",
      until: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it("revoke_sessions invalidates tokens issued before the revocation", async () => {
    const res = await lifecycle({ action: "revoke_sessions", reason: "Possible credential leak" });
    expect(res.status).toBe(200);
    expect(candidateState.sessionsRevokedAt).toBeInstanceOf(Date);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_SESSIONS_REVOKED" }) }),
    );

    // Pin the revocation instant after the token's iat (second granularity).
    candidateState.sessionsRevokedAt = new Date(Date.now() + 2_000);
    const stale = await protectedCall();
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe("SESSION_REVOKED");
  });

  it("force_reverify clears email verification and is audited", async () => {
    const res = await lifecycle({ action: "force_reverify", reason: "Email bounced repeatedly" });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerified: false, emailVerifiedAt: null } }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_EMAIL_REVERIFICATION_FORCED" }) }),
    );
  });
});

describe("admin console — messaging and jobs", () => {
  it("messages a user in-app, skips email without SES, and audits", async () => {
    const res = await request(app)
      .post(`/api/admin/console/users/${CANDIDATE_ID}/message`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ subject: "Profile review", body: "Please update your CV." });
    expect(res.status).toBe(201);
    expect(res.body.threadId).toBe("thread-1");
    expect(res.body.email).toBe("skipped_not_configured");
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "ADMIN_MESSAGE", userId: CANDIDATE_ID }) }),
    );
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "USER_MESSAGED" }) }),
    );
  });

  it("features a published job with an audit entry, and refuses to feature a draft", async () => {
    db.job.findUnique.mockResolvedValueOnce({ id: "job-1", title: "Engineer", status: "PUBLISHED", isFeatured: false, publishedAt: new Date() });
    db.job.update.mockResolvedValueOnce({ id: "job-1", status: "PUBLISHED", isFeatured: true });
    const ok = await request(app)
      .post("/api/admin/console/jobs/job-1/action")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "feature", reason: "Strong Africa-friendly role" });
    expect(ok.status).toBe(200);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "JOB_FEATURED", targetType: "JOB", targetId: "job-1" }) }),
    );

    db.job.findUnique.mockResolvedValueOnce({ id: "job-2", title: "Draft", status: "DRAFT", isFeatured: false, publishedAt: null });
    const conflict = await request(app)
      .post("/api/admin/console/jobs/job-2/action")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ action: "feature", reason: "Strong Africa-friendly role" });
    expect(conflict.status).toBe(409);
  });
});

describe("evaluateAccountAccess", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("allows an expired temporary suspension and flags it for clearing", () => {
    const decision = evaluateAccountAccess(
      { ...active(), accountRestrictionStatus: "SUSPENDED", accountRestrictedUntil: new Date("2026-10-13T00:00:00Z") },
      { now },
    );
    expect(decision).toEqual({ allowed: true, suspensionExpired: true });
  });

  it("blocks an unexpired suspension and reports its end date", () => {
    const decision = evaluateAccountAccess(
      { ...active(), accountRestrictionStatus: "SUSPENDED", accountRestrictedUntil: new Date("2026-10-20T00:00:00Z") },
      { now },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.until).toBe("2026-10-20T00:00:00.000Z");
  });

  it("keeps LIMITED accounts signed in", () => {
    expect(evaluateAccountAccess({ ...active(), accountRestrictionStatus: "LIMITED" }, { now }).allowed).toBe(true);
  });

  it("rejects a soft-deleted account even when otherwise ACTIVE", () => {
    const decision = evaluateAccountAccess({ ...active(), deletedAt: new Date("2026-10-01T00:00:00Z") }, { now });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe(401);
      expect(decision.code).toBe("ACCOUNT_DELETED");
    }
  });

  it("reports ACCOUNT_DELETED ahead of the anonymization suspension", () => {
    const decision = evaluateAccountAccess(
      { ...active(), accountRestrictionStatus: "SUSPENDED", deletedAt: new Date("2026-10-01T00:00:00Z") },
      { now },
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("ACCOUNT_DELETED");
  });
});

describe("soft-deleted accounts", () => {
  it("authenticate rejects a still-valid token for a deleted account", async () => {
    candidateState = { ...active(), deletedAt: new Date() };
    const res = await protectedCall();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_DELETED");
  });

  it("optionalAuth treats a deleted account's token as anonymous", async () => {
    candidateState = { ...active(), deletedAt: new Date() };
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${candidateToken}`);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it("the same token works while the account is not deleted", async () => {
    const res = await protectedCall();
    expect(res.status).not.toBe(401);
  });
});
