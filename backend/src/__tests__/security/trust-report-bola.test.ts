import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../middleware/account-standing.js", () => ({
  requireAccountStanding: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../lib/trust/service.js", () => ({
  addTrustCaseAction: vi.fn(),
  createTrustCase: vi.fn(),
  recordTrustRiskEvent: vi.fn(),
  refreshCandidateTrustProfile: vi.fn(),
  refreshEmployerTrustProfile: vi.fn(),
  scoreDeltaForReport: vi.fn(),
  trustPriorityForReport: vi.fn(),
  candidateTrustSummary: vi.fn(),
  employerTrustSummary: vi.fn(),
  ensureCandidateTrustProfile: vi.fn(),
  ensureEmployerTrustProfile: vi.fn(),
}));
vi.mock("../../lib/prisma.js", () => ({ default: {
  user: { findUnique: vi.fn() },
  employer: { findUnique: vi.fn() },
  application: { findUnique: vi.fn() },
  messageThread: { findUnique: vi.fn() },
  abuseReport: { create: vi.fn() },
  $queryRaw: vi.fn().mockResolvedValue([]), $disconnect: vi.fn(),
} }));

import request from "supertest";
import app from "../../app.js";
import prisma from "../../lib/prisma.js";
import { AbuseReportReason, Role } from "@prisma/client";
import { signToken } from "../../lib/jwt.js";

const reporterId = "b5d85bd5-d493-45a6-a93c-12e978166001";
const otherCandidateId = "b5d85bd5-d493-45a6-a93c-12e978166002";
const foreignEmployerId = "b5d85bd5-d493-45a6-a93c-12e978166003";
const applicationId = "b5d85bd5-d493-45a6-a93c-12e978166004";
const threadId = "b5d85bd5-d493-45a6-a93c-12e978166005";
const token = signToken({ userId: reporterId, role: Role.CANDIDATE, email: "reporter@example.test" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: reporterId, email: "reporter@example.test", role: Role.CANDIDATE,
    deletedAt: null, accountRestrictionStatus: "ACTIVE",
  } as never);
});

describe("trust report BOLA", () => {
  it("does not let a candidate create a case against another employer's application", async () => {
    vi.mocked(prisma.application.findUnique).mockResolvedValue({
      id: applicationId,
      candidateId: otherCandidateId,
      job: { employerId: foreignEmployerId },
      candidate: { candidateTrustProfile: null },
    } as never);

    const response = await request(app)
      .post("/api/trust/reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: AbuseReportReason.SCAM, targetApplicationId: applicationId });

    expect(response.status).toBe(404);
    expect(prisma.abuseReport.create).not.toHaveBeenCalled();
  });

  it("does not let a non-participant create a case against a private conversation", async () => {
    vi.mocked(prisma.messageThread.findUnique).mockResolvedValue({
      id: threadId,
      participants: [{ userId: otherCandidateId }],
    } as never);

    const response = await request(app)
      .post("/api/trust/reports")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: AbuseReportReason.SCAM, targetThreadId: threadId });

    expect(response.status).toBe(404);
    expect(prisma.abuseReport.create).not.toHaveBeenCalled();
  });
});
