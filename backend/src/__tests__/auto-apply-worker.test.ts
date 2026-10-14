/**
 * Auto-apply worker: env kill switch, explicit opt-in eligibility and job
 * status filtering.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { db, guard } = vi.hoisted(() => ({
  db: {
    subscription: { findMany: vi.fn() },
    candidateAutopilotProfile: { findMany: vi.fn() },
    jobAlert: { findMany: vi.fn(), update: vi.fn() },
    application: { count: vi.fn(), create: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
  guard: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ default: db }));
vi.mock("../lib/ai/cover-letter.js", () => ({
  generateQuickCoverLetter: vi.fn().mockResolvedValue({ coverLetter: "Hi", source: "template" }),
}));
vi.mock("../lib/apply/submit-guard.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apply/submit-guard.js")>(
    "../lib/apply/submit-guard.js",
  );
  return {
    ...actual,
    assertCanSubmitApplication: guard,
    recordSubmissionTrust: vi.fn().mockResolvedValue(undefined),
  };
});

import { runAutoApplyCycle } from "../workers/auto-apply.js";
import { SubmitGuardError } from "../lib/apply/submit-guard.js";

const savedEnv = process.env.AUTO_APPLY_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  db.candidateAutopilotProfile.findMany.mockResolvedValue([{ userId: "u1" }]);
  db.jobAlert.findMany.mockResolvedValue([]);
  db.application.count.mockResolvedValue(0);
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.AUTO_APPLY_ENABLED;
  else process.env.AUTO_APPLY_ENABLED = savedEnv;
});

describe("runAutoApplyCycle", () => {
  it("does nothing unless AUTO_APPLY_ENABLED=1", async () => {
    delete process.env.AUTO_APPLY_ENABLED;
    await runAutoApplyCycle();
    expect(db.candidateAutopilotProfile.findMany).not.toHaveBeenCalled();
    expect(db.jobAlert.findMany).not.toHaveBeenCalled();
    expect(db.application.create).not.toHaveBeenCalled();
  });

  it("selects only users who explicitly opted in, never by plan", async () => {
    process.env.AUTO_APPLY_ENABLED = "1";
    await runAutoApplyCycle();
    expect(db.subscription.findMany).not.toHaveBeenCalled();
    expect(db.candidateAutopilotProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { autoApplyEnabled: true } }),
    );
  });

  it("only considers alerts for published, unexpired jobs", async () => {
    process.env.AUTO_APPLY_ENABLED = "1";
    await runAutoApplyCycle();
    const where = db.jobAlert.findMany.mock.calls[0][0].where;
    expect(where.job).toEqual({ status: "PUBLISHED", isExpired: false });
    expect(where.userId).toEqual({ in: ["u1"] });
  });

  it("skips an alert the shared guard rejects without creating an application", async () => {
    process.env.AUTO_APPLY_ENABLED = "1";
    db.jobAlert.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u1",
        jobId: "j1",
        matchScore: 90,
        user: { id: "u1", name: "U", email: "u@test.com" },
        job: { id: "j1", title: "T", slug: "t", description: "d", employer: null, sourceName: "S" },
      },
    ]);
    guard.mockRejectedValue(new SubmitGuardError("EMAIL_VERIFICATION_REQUIRED", "verify"));
    await runAutoApplyCycle();
    expect(guard).toHaveBeenCalledWith({ userId: "u1", jobId: "j1" });
    expect(db.application.create).not.toHaveBeenCalled();
  });
});
