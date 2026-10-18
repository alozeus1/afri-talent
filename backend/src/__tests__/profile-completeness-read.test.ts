/**
 * GET /api/profile reports the live profile-completeness score, not the
 * stored column, and backfills the column when it has drifted. Profiles
 * filled outside PUT /api/profile (quick apply, resume parsing, seeding)
 * used to read 0% on the candidate dashboard.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// authenticate rehydrates the account per request; model the account behind
// every token this suite mints (see helpers/current-account.ts).
vi.mock("../lib/jwt.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockJwtModule(importOriginal));
vi.mock("../lib/account-access.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockAccountAccessModule(importOriginal));

vi.mock("../lib/prisma.js", () => ({
  default: {
    user: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
    candidateProfile: { findUnique: vi.fn(), update: vi.fn() },
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
const token = () => signToken({ userId: "cand_user", email: "cand_user@test.com", role: Role.CANDIDATE });

const baseProfile = {
  id: "profile_1",
  userId: "cand_user",
  headline: "Backend engineer",
  bio: "I build APIs.",
  skills: ["node.js", "postgresql"],
  targetRoles: ["Backend Engineer"],
  targetCountries: ["DE"],
  yearsExperience: 5,
  visaStatus: null,
  linkedinUrl: null,
  githubUrl: null,
  portfolioUrl: null,
  workHistory: null,
  educationHistory: null,
  certifications: null,
  resumes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.candidateProfile.update.mockResolvedValue({});
});

describe("GET /api/profile completeness", () => {
  it("returns the computed score and backfills a stale stored value", async () => {
    db.candidateProfile.findUnique.mockResolvedValue({ ...baseProfile, profileCompleteness: 0 });

    const res = await request(app).get("/api/profile").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // headline 10 + bio 12 + skills 15 + roles 8 + countries 6 + years 8
    expect(res.body.profileCompleteness).toBe(59);
    expect(db.candidateProfile.update).toHaveBeenCalledWith({
      where: { id: "profile_1" },
      data: { profileCompleteness: 59 },
    });
  });

  it("does not write when the stored score is already current", async () => {
    db.candidateProfile.findUnique.mockResolvedValue({ ...baseProfile, profileCompleteness: 59 });

    const res = await request(app).get("/api/profile").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.profileCompleteness).toBe(59);
    expect(db.candidateProfile.update).not.toHaveBeenCalled();
  });

  it("still returns null for a candidate without a profile", async () => {
    db.candidateProfile.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/api/profile").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(db.candidateProfile.update).not.toHaveBeenCalled();
  });
});
