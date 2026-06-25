import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { startFollowUp, resumeFollowUp, type FollowUpDeps } from "../graphs/followUp.graph.js";
import { runInterviewPrep, readiness, type InterviewPrepDeps } from "../graphs/interviewPrep.graph.js";
import { runBillingRecovery, type BillingRecoveryDeps } from "../graphs/billingRecovery.graph.js";
import { GRAPH_CATALOG, missingWorkflows, interruptibleWorkflows } from "../registry/graphInventory.js";
import { WorkflowTypeSchema } from "../state/schemas.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";
import {
  _setIdempotencyLedger,
  _resetIdempotencyLedger,
  LedgerDuplicateError,
  type IdempotencyLedger,
  type LedgerRow,
} from "../tools/idempotency.js";

function memoryLedger(): IdempotencyLedger {
  const rows = new Map<string, LedgerRow>();
  const k = (s: string, key: string) => `${s}::${key}`;
  return {
    async create(scope, key) {
      const id = k(scope, key);
      if (rows.has(id)) throw new LedgerDuplicateError();
      rows.set(id, { status: "RESERVED", resultRef: null, createdAt: new Date() });
    },
    async find(scope, key) { return rows.get(k(scope, key)) ?? null; },
    async update(scope, key, data) {
      const id = k(scope, key);
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, status: data.status, resultRef: data.resultRef ?? cur.resultRef });
    },
  };
}

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
  _setIdempotencyLedger(memoryLedger());
});
afterEach(() => _resetIdempotencyLedger());

describe("graph catalog", () => {
  it("covers all 12 workflow types", () => {
    expect(missingWorkflows()).toEqual([]);
    expect(GRAPH_CATALOG).toHaveLength(WorkflowTypeSchema.options.length);
  });
  it("flags the human-in-the-loop graphs", () => {
    const i = interruptibleWorkflows();
    for (const wf of ["apply_pack", "employer_verification", "candidate_verification", "follow_up", "blog_automation", "trust_moderation"] as const) {
      expect(i).toContain(wf);
    }
  });
  it("every entry has a working thread-id builder", () => {
    for (const e of GRAPH_CATALOG) {
      const tid = e.threadId({ userId: "u", resumeId: "r", candidateId: "c", jobId: "j", applicationId: "a", employerId: "e", resourceId: "res", caseRef: "case", fingerprint: "fp" });
      expect(typeof tid).toBe("string");
      expect(tid.length).toBeGreaterThan(0);
    }
  });
});

describe("follow-up graph", () => {
  function deps(spy: { sent: number }, over: Partial<FollowUpDeps> = {}): FollowUpDeps {
    return {
      daysSinceStage: async () => 7,
      generateDraft: async () => ({ draftRef: "d1" }),
      send: async () => { spy.sent += 1; return "msg-1"; },
      recordEvent: async () => {},
      ...over,
    };
  }
  it("is a no-op when not at a cadence day", async () => {
    const spy = { sent: 0 };
    const out = await startFollowUp(randomUUID(), deps(spy, { daysSinceStage: async () => 4 }));
    expect(out.status).toBe("COMPLETE");
    if (out.status !== "AWAITING_APPROVAL") expect(out.outcome).toBe("not_due");
  });
  it("pauses for approval and sends only after approval (once)", async () => {
    const spy = { sent: 0 };
    const id = randomUUID();
    const start = await startFollowUp(id, deps(spy));
    expect(start.status).toBe("AWAITING_APPROVAL");
    expect(spy.sent).toBe(0);
    const done = await resumeFollowUp(id, { approved: true }, deps(spy));
    expect(done.status).toBe("COMPLETE");
    if (done.status !== "AWAITING_APPROVAL") expect(done.outcome).toBe("sent");
    expect(spy.sent).toBe(1);
  });
  it("does not send when declined", async () => {
    const spy = { sent: 0 };
    const id = randomUUID();
    await startFollowUp(id, deps(spy));
    const done = await resumeFollowUp(id, { approved: false }, deps(spy));
    expect(done.status).toBe("BLOCKED");
    expect(spy.sent).toBe(0);
  });
});

describe("interview prep graph", () => {
  it("computes deterministic readiness", () => {
    expect(readiness(100, true, true)).toBe(100);
    expect(readiness(50, false, false)).toBe(30);
  });
  it("produces a prep pack", async () => {
    const deps: InterviewPrepDeps = {
      loadContext: async () => ({ profileCompleteness: 80, hasApplicationMaterials: true, companyDataAvailable: true }),
      generateQuestions: async () => ({ questionsRef: "q1", count: 10 }),
      recordEvent: async () => {},
    };
    const out = await runInterviewPrep(randomUUID(), randomUUID(), deps);
    expect(out.status).toBe("COMPLETE");
    expect(out.questionCount).toBe(10);
    expect(out.readinessScore).toBe(88); // 80*0.6 + 20 + 20
  });
});

describe("billing recovery graph", () => {
  function deps(spy: { paused: number; resumed: number }, providerActive: boolean, localEntitled: boolean): BillingRecoveryDeps {
    return {
      getProviderActive: async () => providerActive,
      getLocalEntitled: async () => localEntitled,
      resumeAutomation: async () => { spy.resumed += 1; },
      pauseAutomation: async () => { spy.paused += 1; },
      notify: async () => {},
      recordReconciliation: async () => {},
    };
  }
  it("pauses premium automation when unpaid but entitled", async () => {
    const spy = { paused: 0, resumed: 0 };
    const out = await runBillingRecovery(randomUUID(), deps(spy, false, true));
    expect(out.outcome).toBe("paused");
    expect(spy.paused).toBe(1);
  });
  it("resumes when paid but not entitled", async () => {
    const spy = { paused: 0, resumed: 0 };
    const out = await runBillingRecovery(randomUUID(), deps(spy, true, false));
    expect(out.outcome).toBe("resumed");
    expect(spy.resumed).toBe(1);
  });
  it("is a no-op when consistent", async () => {
    const spy = { paused: 0, resumed: 0 };
    const out = await runBillingRecovery(randomUUID(), deps(spy, true, true));
    expect(out.outcome).toBe("consistent");
    expect(spy.paused + spy.resumed).toBe(0);
  });
});
