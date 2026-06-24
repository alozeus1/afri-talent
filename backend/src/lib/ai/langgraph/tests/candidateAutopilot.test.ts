import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  runCandidateAutopilot,
  type AutopilotDeps,
} from "../graphs/candidateAutopilot.graph.js";
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
    async find(scope, key) {
      return rows.get(k(scope, key)) ?? null;
    },
    async update(scope, key, data) {
      const id = k(scope, key);
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, status: data.status, resultRef: data.resultRef ?? cur.resultRef });
    },
  };
}

interface Spy {
  packsGenerated: number;
  notified: number;
  followUps: number;
}

function baseDeps(spy: Spy, overrides: Partial<AutopilotDeps> = {}): AutopilotDeps {
  return {
    getOptIn: async () => ({ enabled: true, userId: "u1" }),
    getEntitlements: async () => ({ autopilot: true, billingValid: true, applyPacksRemaining: 5 }),
    getProfileCompleteness: async () => 90,
    getCandidateRisk: async () => 10, // LOW
    getRemainingCapacity: async () => 5,
    findStrongMatches: async () => [
      { jobId: "j1", score: 80 },
      { jobId: "j2", score: 85 },
    ],
    generateApplyPack: async (_c, j) => {
      spy.packsGenerated += 1;
      return { packRef: `pack-${j}` };
    },
    notifyCandidate: async () => {
      spy.notified += 1;
      return "notif-1";
    },
    scheduleFollowUps: async () => {
      spy.followUps += 1;
    },
    ...overrides,
  };
}

const run = (deps: AutopilotDeps) => runCandidateAutopilot(randomUUID(), deps, { graphRunId: randomUUID() });

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
  _setIdempotencyLedger(memoryLedger());
});
afterEach(() => _resetIdempotencyLedger());

describe("candidate autopilot gates", () => {
  it("generates packs on the happy path (and never submits — no submit dep exists)", async () => {
    const spy: Spy = { packsGenerated: 0, notified: 0, followUps: 0 };
    const out = await run(baseDeps(spy));
    expect(out.status).toBe("COMPLETE");
    expect(out.generatedPackCount).toBe(2);
    expect(spy.packsGenerated).toBe(2);
    expect(spy.notified).toBe(1);
    expect(spy.followUps).toBe(1);
  });

  it.each([
    ["not_opted_in", { getOptIn: async () => ({ enabled: false, userId: "u1" }) }],
    ["plan_not_entitled", { getEntitlements: async () => ({ autopilot: false, billingValid: true, applyPacksRemaining: 5 }) }],
    ["billing_invalid", { getEntitlements: async () => ({ autopilot: true, billingValid: false, applyPacksRemaining: 5 }) }],
    ["profile_incomplete", { getProfileCompleteness: async () => 50 }],
    ["trust_blocked", { getCandidateRisk: async () => 60 }], // HIGH tier
    ["apply_cap_reached", { getRemainingCapacity: async () => 0 }],
  ] as const)("blocks with reason %s and generates nothing", async (reason, override) => {
    const spy: Spy = { packsGenerated: 0, notified: 0, followUps: 0 };
    const out = await run(baseDeps(spy, override as Partial<AutopilotDeps>));
    expect(out.status).toBe("BLOCKED");
    expect(out.blockedReason).toBe(reason);
    expect(out.generatedPackCount).toBe(0);
    expect(spy.packsGenerated).toBe(0);
    expect(spy.notified).toBe(0);
  });

  it("never exceeds remaining apply capacity", async () => {
    const spy: Spy = { packsGenerated: 0, notified: 0, followUps: 0 };
    const deps = baseDeps(spy, {
      getRemainingCapacity: async () => 1,
      findStrongMatches: async () => [
        { jobId: "j1", score: 80 },
        { jobId: "j2", score: 85 },
        { jobId: "j3", score: 90 },
      ],
    });
    const out = await run(deps);
    expect(out.generatedPackCount).toBe(1);
    expect(spy.packsGenerated).toBe(1);
  });

  it("never exceeds the AI apply-pack quota", async () => {
    const spy: Spy = { packsGenerated: 0, notified: 0, followUps: 0 };
    const deps = baseDeps(spy, {
      getEntitlements: async () => ({ autopilot: true, billingValid: true, applyPacksRemaining: 2 }),
      getRemainingCapacity: async () => 10,
      findStrongMatches: async () => [
        { jobId: "j1", score: 80 },
        { jobId: "j2", score: 85 },
        { jobId: "j3", score: 90 },
        { jobId: "j4", score: 95 },
      ],
    });
    const out = await run(deps);
    expect(out.generatedPackCount).toBe(2);
  });
});
