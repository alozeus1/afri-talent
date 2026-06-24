import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  runOnce,
  IdempotencyInProgressError,
  LedgerDuplicateError,
  _setIdempotencyLedger,
  _resetIdempotencyLedger,
  type IdempotencyLedger,
  type LedgerRow,
} from "../tools/idempotency.js";

// Simple in-memory ledger for deterministic, DB-free tests.
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

beforeEach(() => _setIdempotencyLedger(memoryLedger()));
afterEach(() => _resetIdempotencyLedger());

describe("runOnce idempotency", () => {
  it("runs fn once and returns its ref", async () => {
    let calls = 0;
    const r = await runOnce("ses", "app-1", async () => {
      calls += 1;
      return "msg-1";
    });
    expect(r).toEqual({ ref: "msg-1", deduped: false });
    expect(calls).toBe(1);
  });

  it("dedupes a second call with the same key (fn not run again)", async () => {
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return "msg-1";
    };
    await runOnce("ses", "app-2", fn);
    const second = await runOnce("ses", "app-2", fn);
    expect(second).toEqual({ ref: "msg-1", deduped: true });
    expect(calls).toBe(1);
  });

  it("allows retry after a failure (does not permanently lock)", async () => {
    await expect(
      runOnce("ses", "app-3", async () => {
        throw new Error("send failed");
      }),
    ).rejects.toThrow("send failed");
    // Retry succeeds (FAILED → reservable again).
    const r = await runOnce("ses", "app-3", async () => "msg-3");
    expect(r.ref).toBe("msg-3");
  });

  it("throws IdempotencyInProgressError on a concurrent reservation", async () => {
    // First call holds the reservation while a second starts.
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const first = runOnce("ses", "app-4", async () => {
      await gate;
      return "msg-4";
    });
    await expect(runOnce("ses", "app-4", async () => "dup")).rejects.toBeInstanceOf(
      IdempotencyInProgressError,
    );
    release();
    await first;
  });

  it("fails open when the ledger backend errors (still runs fn)", async () => {
    _setIdempotencyLedger({
      async create() {
        throw new Error("db down");
      },
      async find() {
        return null;
      },
      async update() {
        /* noop */
      },
    });
    const r = await runOnce("ses", "app-5", async () => "msg-5");
    expect(r).toEqual({ ref: "msg-5", deduped: false });
  });
});
