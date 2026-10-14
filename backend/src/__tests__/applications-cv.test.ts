/**
 * GET /api/applications/:id/cv — ownership check and the three resolution
 * modes (http URL, presigned S3 GET, resume-builder text fallback).
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    employer: { findUnique: vi.fn() },
    application: { findUnique: vi.fn() },
    userResume: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/prisma.js", () => ({ default: db }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://s3.example.com/signed-get"),
}));

import request from "supertest";
import app from "../app.js";
import { signToken } from "../lib/jwt.js";
import { Role } from "@prisma/client";

const APP_ID = "app-cv-1";

function employerToken(userId: string) {
  return signToken({ userId, email: `${userId}@test.com`, role: Role.EMPLOYER });
}

function applicationWith(cvUrl: string | null, riskLevel = "LOW") {
  return { id: APP_ID, cvUrl, candidateId: "cand-1", riskLevel, job: { employerId: "employer-owner" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("S3_UPLOADS_BUCKET", "");
  db.employer.findUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
    Promise.resolve(where.userId === "owner-user" ? { id: "employer-owner" } : { id: "employer-other" }),
  );
  db.application.findUnique.mockResolvedValue(applicationWith("resumes/cand-1/cv.pdf"));
  db.userResume.findUnique.mockResolvedValue({ rawText: "Ada Lovelace\nEngineer" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/applications/:id/cv", () => {
  it("returns 403 for an employer who does not own the job", async () => {
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("other-user")}`);
    expect(res.status).toBe(403);
    expect(db.userResume.findUnique).not.toHaveBeenCalled();
  });

  it("returns 403 for a candidate", async () => {
    const token = signToken({ userId: "cand-1", email: "c@test.com", role: Role.CANDIDATE });
    const res = await request(app).get(`/api/applications/${APP_ID}/cv`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing application", async () => {
    db.application.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(404);
  });

  it("hides held (HIGH risk) applications from the owner", async () => {
    db.application.findUnique.mockResolvedValue(applicationWith("https://cv.example.com/a.pdf", "HIGH"));
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(404);
  });

  it("returns an http(s) cvUrl as-is", async () => {
    db.application.findUnique.mockResolvedValue(applicationWith("https://cv.example.com/a.pdf"));
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://cv.example.com/a.pdf" });
  });

  it("presigns an S3 key when S3 is configured", async () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "uploads-bucket");
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://s3.example.com/signed-get");
  });

  it("falls back to the candidate's resume text when S3 is not configured", async () => {
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "Ada Lovelace\nEngineer" });
  });

  it("lets an admin read any CV", async () => {
    const token = signToken({ userId: "admin-1", email: "a@test.com", role: Role.ADMIN });
    const res = await request(app).get(`/api/applications/${APP_ID}/cv`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(db.employer.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 CV_NOT_AVAILABLE when nothing is attached", async () => {
    db.application.findUnique.mockResolvedValue(applicationWith(null));
    db.userResume.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/applications/${APP_ID}/cv`)
      .set("Authorization", `Bearer ${employerToken("owner-user")}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CV_NOT_AVAILABLE");
  });
});
