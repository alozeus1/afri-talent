import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  const del = () => vi.fn().mockResolvedValue({ count: 0 });
  return {
    mockPrisma: {
      user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
      candidateProfile: { updateMany: del() },
      resume: { deleteMany: del() },
      verificationArtifact: { deleteMany: del() },
      mockInterviewSession: { deleteMany: del() },
      oAuthAccount: { deleteMany: del() },
      passwordResetToken: { deleteMany: del() },
      emailVerificationToken: { deleteMany: del() },
      userPhoneOtp: { deleteMany: del() },
      $transaction: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("../../prisma.js", () => ({ default: mockPrisma }));

import { anonymizeUser, ACCOUNT_DELETION_WINDOW_DAYS } from "../anonymize.js";
import { runAccountDeletionCycle } from "../../../workers/account-deletion.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe("anonymizeUser", () => {
  it("scrubs identity, cuts access, and stamps deletedAt", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", deletedAt: null });
    const res = await anonymizeUser("u1");
    expect(res.status).toBe("anonymized");
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    const updateArg = mockPrisma.user.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    expect(updateArg.data.email).toContain("removed.invalid");
    expect(updateArg.data.password).toBe("");
    expect(updateArg.data.accountRestrictionStatus).toBe("SUSPENDED");
    // Access paths cut.
    expect(mockPrisma.oAuthAccount.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockPrisma.verificationArtifact.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("is idempotent — skips a user already soft-deleted", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "u1", deletedAt: new Date() });
    const res = await anonymizeUser("u1");
    expect(res.status).toBe("already_deleted");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns not_found for a missing user", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect((await anonymizeUser("ghost")).status).toBe("not_found");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("runAccountDeletionCycle", () => {
  it("selects only requests past the window that are not yet deleted", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    await runAccountDeletionCycle();

    const where = mockPrisma.user.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.deletionRequestedAt.lte).toBeInstanceOf(Date);
    // cutoff is ~30 days ago
    const daysAgo = (Date.now() - where.deletionRequestedAt.lte.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(daysAgo)).toBe(ACCOUNT_DELETION_WINDOW_DAYS);
  });

  it("anonymizes each due account", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "x", deletedAt: null });
    await runAccountDeletionCycle();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("continues the batch when one account fails", async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "x", deletedAt: null });
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db blip")).mockResolvedValueOnce([]);
    await expect(runAccountDeletionCycle()).resolves.toBeUndefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
