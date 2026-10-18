/**
 * Quick Apply preview step (POST /api/quick-apply/preview) and submit with a
 * candidate-reviewed cover letter.
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
    candidateProfile: { findUnique: vi.fn() },
    userResume: { findUnique: vi.fn() },
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

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

const USER_ID = "preview-user-uid";
const JOB_ID = "33333333-3333-4333-8333-333333333333";

function token(): string {
  return signToken({ userId: USER_ID, email: "p@test.com", role: Role.CANDIDATE });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: USER_ID,
    name: "Preview User",
    email: "p@test.com",
    emailVerified: true,
    accountRestrictionStatus: "CLEAR",
    accountRestrictionReason: null,
  });
  db.job.findUnique.mockResolvedValue({
    id: JOB_ID, title: "Engineer", description: "desc", status: "PUBLISHED",
    isExpired: false, employerId: null, sourceName: "Acme",
  });
  db.application.findFirst.mockResolvedValue(null);
  db.application.findMany.mockResolvedValue([]);
  db.application.count.mockResolvedValue(0);
  db.application.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "app-1", ...data }),
  );
  db.candidateProfile.findUnique.mockResolvedValue({
    headline: "Dev", skills: ["ts"], bio: null, yearsExperience: 3, profileCompleteness: 60,
    resumes: [{ id: "resume-1", fileName: "ada-cv.pdf", s3Key: "resumes/u/cv.pdf" }],
  });
  db.userResume.findUnique.mockResolvedValue(null);
  coverLetter.mockResolvedValue({ coverLetter: "Drafted letter", source: "template" });
});

describe("POST /api/quick-apply/preview", () => {
  it("returns the drafted letter and the resume to attach without creating an application", async () => {
    const res = await request(app)
      .post("/api/quick-apply/preview")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ coverLetter: "Drafted letter", resume: { id: "resume-1", name: "ada-cv.pdf" } });
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it("falls back to the resume-builder resume when no file is uploaded", async () => {
    db.candidateProfile.findUnique.mockResolvedValue({
      headline: null, skills: [], bio: null, yearsExperience: null, profileCompleteness: 40, resumes: [],
    });
    db.userResume.findUnique.mockResolvedValue({ id: "built-1" });
    const res = await request(app)
      .post("/api/quick-apply/preview")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID });
    expect(res.status).toBe(200);
    expect(res.body.resume.id).toBe("built-1");
  });

  it("returns resume null when the candidate has none", async () => {
    db.candidateProfile.findUnique.mockResolvedValue({
      headline: null, skills: [], bio: null, yearsExperience: null, profileCompleteness: 40, resumes: [],
    });
    const res = await request(app)
      .post("/api/quick-apply/preview")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID });
    expect(res.status).toBe(200);
    expect(res.body.resume).toBeNull();
  });

  it("applies the same guards as submit (duplicate -> 409)", async () => {
    db.application.findFirst.mockResolvedValue({ id: "existing" });
    const res = await request(app)
      .post("/api/quick-apply/preview")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID });
    expect(res.status).toBe(409);
    expect(coverLetter).not.toHaveBeenCalled();
  });

  it("rejects non-candidates", async () => {
    const employerToken = signToken({ userId: "emp", email: "e@test.com", role: Role.EMPLOYER });
    const res = await request(app)
      .post("/api/quick-apply/preview")
      .set("Authorization", `Bearer ${employerToken}`)
      .send({ jobId: JOB_ID });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/quick-apply with a reviewed letter", () => {
  it("stores the edited letter verbatim and does not regenerate", async () => {
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID, confirm: true, coverLetter: "  My edited letter.  " });
    expect(res.status).toBe(201);
    expect(coverLetter).not.toHaveBeenCalled();
    const data = db.application.create.mock.calls[0][0].data;
    expect(data.coverLetter).toBe("My edited letter.");
    expect(data.cvUrl).toBe("resumes/u/cv.pdf");
  });

  it("rejects a letter over 5000 characters", async () => {
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID, confirm: true, coverLetter: "x".repeat(5001) });
    expect(res.status).toBe(400);
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it("still drafts a letter when none is supplied", async () => {
    const res = await request(app)
      .post("/api/quick-apply")
      .set("Authorization", `Bearer ${token()}`)
      .send({ jobId: JOB_ID, confirm: true });
    expect(res.status).toBe(201);
    expect(coverLetter).toHaveBeenCalledTimes(1);
    expect(db.application.create.mock.calls[0][0].data.coverLetter).toBe("Drafted letter");
  });
});

describe("GET /api/quick-apply/eligible/:jobId", () => {
  it("is eligible without a resume when the profile is complete enough", async () => {
    db.job.findUnique.mockResolvedValue({ id: JOB_ID, status: "PUBLISHED" });
    db.candidateProfile.findUnique.mockResolvedValue({
      profileCompleteness: 50, skills: [], targetRoles: [], targetCountries: [], resumes: [],
    });
    const res = await request(app)
      .get(`/api/quick-apply/eligible/${JOB_ID}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eligible: true, hasActiveResume: false });
  });

  it("uses the live completeness score when the stored one is stale", async () => {
    db.job.findUnique.mockResolvedValue({ id: JOB_ID, status: "PUBLISHED" });
    db.candidateProfile.findUnique.mockResolvedValue({
      profileCompleteness: 0,
      headline: "Engineer",
      bio: "Builds things.",
      skills: ["ts"],
      targetRoles: [],
      targetCountries: [],
      resumes: [{ id: "r1", fileName: "cv.pdf", s3Key: "k" }],
    });
    const res = await request(app)
      .get(`/api/quick-apply/eligible/${JOB_ID}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eligible: true, hasActiveResume: true, profileCompleteness: 41 });
  });

  it("is not eligible when the profile is nearly empty", async () => {
    db.job.findUnique.mockResolvedValue({ id: JOB_ID, status: "PUBLISHED" });
    db.candidateProfile.findUnique.mockResolvedValue({
      profileCompleteness: 0, skills: [], targetRoles: [], targetCountries: [], resumes: [],
    });
    const res = await request(app)
      .get(`/api/quick-apply/eligible/${JOB_ID}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.body).toMatchObject({ eligible: false, profileCompleteness: 0 });
  });
});
