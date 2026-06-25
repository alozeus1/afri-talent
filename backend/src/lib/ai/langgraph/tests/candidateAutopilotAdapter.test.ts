import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluateAutopilotGate,
  profileCompletenessFrom,
} from "../integration/candidateAutopilotAdapter.js";
import type { AutopilotDeps } from "../graphs/candidateAutopilot.graph.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";
import { _setIdempotencyLedger, _resetIdempotencyLedger, LedgerDuplicateError, type IdempotencyLedger, type LedgerRow } from "../tools/idempotency.js";

function memoryLedger(): IdempotencyLedger {
  const rows = new Map<string, LedgerRow>();
  const k = (s: string, key: string) => `${s}::${key}`;
  return {
    async create(scope, key) { const id = k(scope, key); if (rows.has(id)) throw new LedgerDuplicateError(); rows.set(id, { status: "RESERVED", resultRef: null, createdAt: new Date() }); },
    async find(scope, key) { return rows.get(k(scope, key)) ?? null; },
    async update(scope, key, data) { const id = k(scope, key); const cur = rows.get(id); if (cur) rows.set(id, { ...cur, status: data.status, resultRef: data.resultRef ?? cur.resultRef }); },
  };
}

// Gate-only deps: generation is inert; gate values are supplied per test.
function gateDeps(over: Partial<AutopilotDeps> = {}): AutopilotDeps {
  return {
    getOptIn: async () => ({ enabled: true, userId: "u1" }),
    getEntitlements: async () => ({ autopilot: true, billingValid: true, applyPacksRemaining: 999 }),
    getProfileCompleteness: async () => 90,
    getCandidateRisk: async () => 10,
    getRemainingCapacity: async () => 1,
    findStrongMatches: async () => [],
    generateApplyPack: async () => ({ packRef: "" }),
    notifyCandidate: async () => "",
    scheduleFollowUps: async () => {},
    ...over,
  };
}

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
  _setIdempotencyLedger(memoryLedger());
});
afterEach(() => _resetIdempotencyLedger());

describe("profileCompletenessFrom", () => {
  it("scores present signals", () => {
    expect(profileCompletenessFrom({ headline: "x", bio: "y", skills: ["a"], yearsExperience: 2, resumes: [{}] })).toBe(100);
    expect(profileCompletenessFrom({})).toBe(0);
    expect(profileCompletenessFrom({ headline: "x", skills: ["a"] })).toBe(40);
  });
});

describe("evaluateAutopilotGate", () => {
  it("allows when all gates pass", async () => {
    const r = await evaluateAutopilotGate("cand-1", gateDeps());
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it.each([
    ["not_opted_in", { getOptIn: async () => ({ enabled: false, userId: "u1" }) }],
    ["plan_not_entitled", { getEntitlements: async () => ({ autopilot: false, billingValid: true, applyPacksRemaining: 0 }) }],
    ["profile_incomplete", { getProfileCompleteness: async () => 40 }],
    ["trust_blocked", { getCandidateRisk: async () => 70 }],
    ["apply_cap_reached", { getRemainingCapacity: async () => 0 }],
  ] as const)("blocks with reason %s", async (reason, over) => {
    const r = await evaluateAutopilotGate("cand-x", gateDeps(over as Partial<AutopilotDeps>));
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(reason);
  });
});
