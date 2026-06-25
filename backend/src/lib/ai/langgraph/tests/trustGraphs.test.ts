import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  startEmployerVerification,
  resumeEmployerVerification,
  type EmployerVerificationDeps,
} from "../graphs/employerVerification.graph.js";
import {
  startTrustModeration,
  resumeTrustModeration,
  type TrustModerationDeps,
} from "../graphs/trustModeration.graph.js";
import {
  startCandidateVerification,
  resumeCandidateVerification,
  type CandidateVerificationDeps,
  type CandidateSignals,
} from "../graphs/candidateVerification.graph.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";
import type { AdminDecision } from "../tools/trustTools.js";

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
});

const totp = (decision: "approve" | "reject"): AdminDecision => ({ decision, adminId: "admin-1", totpVerified: true });
const noTotp = (decision: "approve" | "reject"): AdminDecision => ({ decision, adminId: "admin-1", totpVerified: false });

function employerDeps(over: Partial<EmployerVerificationDeps> = {}): EmployerVerificationDeps {
  return {
    assessEmployer: async () => ({ riskScore: 10 }),
    allowPublishing: async () => {},
    restrictPublishing: async () => {},
    suspendEmployer: async () => {},
    recordEvent: async () => {},
    ...over,
  };
}

describe("employer verification graph", () => {
  it("approves a LOW-risk employer", async () => {
    let allowed = false;
    const out = await startEmployerVerification(randomUUID(), employerDeps({ allowPublishing: async () => { allowed = true; } }));
    expect(out.status).toBe("COMPLETE");
    if (out.status === "COMPLETE") expect(out.decision).toBe("approved");
    expect(allowed).toBe(true);
  });

  it("auto-suspends a CRITICAL-risk employer (no human)", async () => {
    let suspended = false;
    const out = await startEmployerVerification(randomUUID(), employerDeps({ assessEmployer: async () => ({ riskScore: 90 }), suspendEmployer: async () => { suspended = true; } }));
    expect(out.status).toBe("BLOCKED");
    if (out.status !== "AWAITING_ADMIN") expect(out.decision).toBe("suspended");
    expect(suspended).toBe(true);
  });

  it("pauses a HIGH-risk employer for admin review, then approves with TOTP", async () => {
    const id = randomUUID();
    const deps = employerDeps({ assessEmployer: async () => ({ riskScore: 65 }) });
    const start = await startEmployerVerification(id, deps);
    expect(start.status).toBe("AWAITING_ADMIN");
    const done = await resumeEmployerVerification(id, totp("approve"), deps);
    expect(done.status).toBe("COMPLETE");
    if (done.status === "COMPLETE") expect(done.decision).toBe("approved");
  });

  it("refuses the admin action without TOTP", async () => {
    const id = randomUUID();
    const deps = employerDeps({ assessEmployer: async () => ({ riskScore: 65 }) });
    await startEmployerVerification(id, deps);
    const done = await resumeEmployerVerification(id, noTotp("approve"), deps);
    expect(done.status).toBe("BLOCKED");
    if (done.status !== "AWAITING_ADMIN") expect(done.decision).toBe("totp_required");
  });
});

function modDeps(over: Partial<TrustModerationDeps> = {}): TrustModerationDeps {
  return {
    getSeverity: async () => ({ severityScore: 10, subjectType: "USER", subjectId: "u1" }),
    logEvent: async () => {},
    openCase: async () => "case-1",
    restrictSubject: async () => {},
    suspendSubject: async () => {},
    notifyAdmin: async () => {},
    recordCaseAction: async () => {},
    ...over,
  };
}

describe("trust moderation graph", () => {
  it("logs a LOW-severity event", async () => {
    const out = await startTrustModeration(randomUUID(), modDeps());
    expect(out.status).toBe("COMPLETE");
    if (out.status === "COMPLETE") expect(out.outcome).toBe("logged");
  });

  it("queues a MEDIUM-severity case", async () => {
    let opened = false;
    const out = await startTrustModeration(randomUUID(), modDeps({ getSeverity: async () => ({ severityScore: 40, subjectType: "USER", subjectId: "u1" }), openCase: async () => { opened = true; return "c"; } }));
    expect(out.status).toBe("COMPLETE");
    if (out.status === "COMPLETE") expect(out.outcome).toBe("queued");
    expect(opened).toBe(true);
  });

  it("auto-suspends on CRITICAL severity", async () => {
    let suspended = false;
    const out = await startTrustModeration(randomUUID(), modDeps({ getSeverity: async () => ({ severityScore: 90, subjectType: "USER", subjectId: "u1" }), suspendSubject: async () => { suspended = true; } }));
    expect(out.status).toBe("BLOCKED");
    if (out.status !== "AWAITING_ADMIN") expect(out.outcome).toBe("suspended");
    expect(suspended).toBe(true);
  });

  it("pauses HIGH severity for admin review; TOTP approve actions it", async () => {
    const ref = randomUUID();
    let suspended = false;
    const deps = modDeps({ getSeverity: async () => ({ severityScore: 70, subjectType: "USER", subjectId: "u1" }), suspendSubject: async () => { suspended = true; } });
    const start = await startTrustModeration(ref, deps);
    expect(start.status).toBe("AWAITING_ADMIN");
    const done = await resumeTrustModeration(ref, totp("approve"), deps);
    expect(done.status).toBe("COMPLETE");
    if (done.status === "COMPLETE") expect(done.outcome).toBe("actioned");
    expect(suspended).toBe(true);
  });

  it("HIGH severity without TOTP is refused", async () => {
    const ref = randomUUID();
    const deps = modDeps({ getSeverity: async () => ({ severityScore: 70, subjectType: "USER", subjectId: "u1" }) });
    await startTrustModeration(ref, deps);
    const done = await resumeTrustModeration(ref, noTotp("approve"), deps);
    expect(done.status).toBe("BLOCKED");
    if (done.status !== "AWAITING_ADMIN") expect(done.outcome).toBe("totp_required");
  });
});

function candDeps(signals: CandidateSignals, over: Partial<CandidateVerificationDeps> = {}): CandidateVerificationDeps {
  return {
    getSignals: async () => signals,
    setVerification: async () => {},
    recordEvent: async () => {},
    ...over,
  };
}

const baseSignals: CandidateSignals = { emailVerified: true, phoneVerified: true, linkedinVerified: false, partnerBadge: false };

describe("candidate verification graph", () => {
  it("scores deterministically with no document (email+phone = 40)", async () => {
    const out = await startCandidateVerification(randomUUID(), candDeps(baseSignals));
    expect(out.status).toBe("COMPLETE");
    if (out.status === "COMPLETE") {
      expect(out.score).toBe(40);
      expect(out.documentVerified).toBe(false);
    }
  });

  it("requires admin review for a submitted document; TOTP approve adds +30", async () => {
    const id = randomUUID();
    const deps = candDeps({ ...baseSignals, documentRef: "s3://doc-key" });
    const start = await startCandidateVerification(id, deps);
    expect(start.status).toBe("AWAITING_ADMIN");
    if (start.status === "AWAITING_ADMIN") expect(start.review.documentRef).toBe("s3://doc-key");
    const done = await resumeCandidateVerification(id, totp("approve"), deps);
    expect(done.status).toBe("COMPLETE");
    if (done.status === "COMPLETE") {
      expect(done.documentVerified).toBe(true);
      expect(done.score).toBe(70); // 40 + 30
    }
  });

  it("does not credit the document without TOTP", async () => {
    const id = randomUUID();
    const deps = candDeps({ ...baseSignals, documentRef: "s3://doc-key" });
    await startCandidateVerification(id, deps);
    const done = await resumeCandidateVerification(id, noTotp("approve"), deps);
    expect(done.status).toBe("COMPLETE");
    if (done.status === "COMPLETE") {
      expect(done.documentVerified).toBe(false);
      expect(done.score).toBe(40);
    }
  });
});
