import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  startApplicationApproval,
  resumeApplicationApproval,
  type SubmissionDeps,
} from "../graphs/applicationSubmission.graph.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";
import { _setIdempotencyLedger, _resetIdempotencyLedger, type IdempotencyLedger, type LedgerRow } from "../tools/idempotency.js";
import { REQUIRED_ACKNOWLEDGEMENTS } from "../tools/applyTools.js";

function memoryLedger(): IdempotencyLedger {
  const rows = new Map<string, LedgerRow>();
  const k = (s: string, key: string) => `${s}::${key}`;
  return {
    async create(scope, key) {
      const id = k(scope, key);
      if (rows.has(id)) throw new (await import("../tools/idempotency.js")).LedgerDuplicateError();
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

const goodAcks = [...REQUIRED_ACKNOWLEDGEMENTS];

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
  _setIdempotencyLedger(memoryLedger());
});
afterEach(() => _resetIdempotencyLedger());

describe("application submission graph (human-in-the-loop)", () => {
  it("pauses at the approval interrupt with required acknowledgements", async () => {
    const appId = randomUUID();
    const deps: SubmissionDeps = {
      onApprovedSubmit: async () => ({ proofRef: "ses-1", track: "EMAIL_DRAFT" }),
    };
    const res = await startApplicationApproval(appId, deps);
    expect(res.status).toBe("AWAITING_APPROVAL");
    if (res.status !== "AWAITING_APPROVAL") throw new Error("unreachable");
    expect(res.request.required).toEqual(goodAcks);
  });

  it("does NOT submit before approval", async () => {
    const appId = randomUUID();
    let submitted = false;
    const deps: SubmissionDeps = {
      onApprovedSubmit: async () => {
        submitted = true;
        return { proofRef: "ses", track: "EMAIL_DRAFT" };
      },
    };
    await startApplicationApproval(appId, deps);
    expect(submitted).toBe(false);
  });

  it("resumes and submits once when correct acknowledgements are given", async () => {
    const appId = randomUUID();
    let calls = 0;
    const deps: SubmissionDeps = {
      onApprovedSubmit: async () => {
        calls += 1;
        return { proofRef: "ses-ok", track: "EMAIL_DRAFT" };
      },
    };
    await startApplicationApproval(appId, deps);
    const out = await resumeApplicationApproval(appId, goodAcks, deps);
    expect(out.status).toBe("SUBMITTED");
    if (out.status === "SUBMITTED") {
      expect(out.proofRef).toBe("ses-ok");
      expect(out.track).toBe("EMAIL_DRAFT");
    }
    expect(calls).toBe(1);
  });

  it("rejects when acknowledgements are missing (no submit)", async () => {
    const appId = randomUUID();
    let submitted = false;
    const deps: SubmissionDeps = {
      onApprovedSubmit: async () => {
        submitted = true;
        return { proofRef: "x", track: "EMAIL_DRAFT" };
      },
    };
    await startApplicationApproval(appId, deps);
    const out = await resumeApplicationApproval(appId, ["I confirm the apply target"], deps);
    expect(out.status).toBe("REJECTED");
    if (out.status === "REJECTED") {
      expect(out.missing).toContain("I have reviewed the cover letter");
    }
    expect(submitted).toBe(false);
  });

  it("surfaces FAILED when the side effect throws", async () => {
    const appId = randomUUID();
    const deps: SubmissionDeps = {
      onApprovedSubmit: async () => {
        throw new Error("SES unavailable");
      },
    };
    await startApplicationApproval(appId, deps);
    const out = await resumeApplicationApproval(appId, goodAcks, deps);
    expect(out.status).toBe("FAILED");
  });
});
