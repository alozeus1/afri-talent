import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  startBlogAutomation,
  resumeBlogAutomation,
  aggregateCredibility,
  type BlogAutomationDeps,
  type VerifiedItem,
} from "../graphs/blogAutomation.graph.js";
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

interface Spy { drafts: number; published: number }

const credibleItems: VerifiedItem[] = [
  { domain: "afritalent.io", credibilityScore: 90, whitelisted: true },
  { domain: "news.com", credibilityScore: 75, whitelisted: false },
];

function deps(spy: Spy, over: Partial<BlogAutomationDeps> = {}): BlogAutomationDeps {
  return {
    sourceContent: async () => 3,
    factCheck: async () => credibleItems,
    writePost: async () => ({ draftRef: "draft-1", sourceRefs: ["s1", "s2"] }),
    createDraft: async () => { spy.drafts += 1; return "res-1"; },
    publish: async () => { spy.published += 1; },
    recordEvent: async () => {},
    ...over,
  };
}

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
  _setIdempotencyLedger(memoryLedger());
});
afterEach(() => _resetIdempotencyLedger());

describe("aggregateCredibility", () => {
  it("blends mean score with a whitelist-density bonus", () => {
    // mean = 82.5, whitelist share = 0.5, bonus 15 → 82.5 + 7.5 = 90
    expect(aggregateCredibility(credibleItems, 15)).toBeCloseTo(90, 5);
    expect(aggregateCredibility([], 15)).toBe(0);
  });
});

describe("blog automation graph", () => {
  it("stops when there is no content (no draft)", async () => {
    const spy: Spy = { drafts: 0, published: 0 };
    const out = await startBlogAutomation(randomUUID(), deps(spy, { sourceContent: async () => 0 }));
    expect(out.status).toBe("COMPLETE");
    if (out.status !== "AWAITING_ADMIN") expect(out.outcome).toBe("no_content");
    expect(spy.drafts).toBe(0);
  });

  it("blocks low-credibility runs before drafting", async () => {
    const spy: Spy = { drafts: 0, published: 0 };
    const out = await startBlogAutomation(randomUUID(), deps(spy, {
      factCheck: async () => [{ domain: "x.com", credibilityScore: 30, whitelisted: false }],
    }));
    expect(out.status).toBe("BLOCKED");
    if (out.status !== "AWAITING_ADMIN") expect(out.outcome).toBe("low_credibility");
    expect(spy.drafts).toBe(0);
    expect(spy.published).toBe(0);
  });

  it("creates a draft and PAUSES for admin approval — nothing published yet", async () => {
    const spy: Spy = { drafts: 0, published: 0 };
    const out = await startBlogAutomation(randomUUID(), deps(spy));
    expect(out.status).toBe("AWAITING_ADMIN");
    expect(spy.drafts).toBe(1);
    expect(spy.published).toBe(0); // critical: no publish before approval
  });

  it("publishes only after admin approval (once)", async () => {
    const spy: Spy = { drafts: 0, published: 0 };
    const key = randomUUID();
    await startBlogAutomation(key, deps(spy));
    const done = await resumeBlogAutomation(key, { approved: true, adminId: "admin-1" }, deps(spy));
    expect(done.status).toBe("COMPLETE");
    if (done.status !== "AWAITING_ADMIN") expect(done.outcome).toBe("published");
    expect(spy.published).toBe(1);
  });

  it("does not publish when the admin rejects", async () => {
    const spy: Spy = { drafts: 0, published: 0 };
    const key = randomUUID();
    await startBlogAutomation(key, deps(spy));
    const done = await resumeBlogAutomation(key, { approved: false, adminId: "admin-1" }, deps(spy));
    expect(done.status).toBe("BLOCKED");
    if (done.status !== "AWAITING_ADMIN") expect(done.outcome).toBe("rejected");
    expect(spy.published).toBe(0);
  });
});
