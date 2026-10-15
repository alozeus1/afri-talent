import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runIngestion, toAggregationDiagnostics } from "../pipeline.js";
import { CircuitBreakerRegistry } from "../circuit-breaker.js";
import { HttpClient, RobotsDisallowedError } from "../http.js";
import { EligibilityTieBreaker, clearTieBreakMemoryCache } from "../llm-tiebreak.js";
import { TaxonomyClassifier } from "../persist.js";
import { canonicalApplyUrl, identityKey } from "../dedupe.js";
import type { FeedSource, FeedSourceId, RawPosting } from "../types.js";

const NOW = new Date("2026-10-15T00:00:00Z");

function posting(id: string, overrides: Partial<RawPosting> = {}): RawPosting {
  return {
    externalId: `test:${id}`,
    scopeKey: "test:",
    title: `Backend Engineer ${id}`,
    company: "Acme",
    location: "Lagos, Nigeria",
    descriptionHtml: "<p>Build APIs in TypeScript and PostgreSQL for our payments platform.</p>",
    applyUrl: `https://jobs.example.com/${id}`,
    sourceUrl: `https://jobs.example.com/${id}`,
    postedAt: new Date("2026-10-10T00:00:00Z"),
    ...overrides,
  };
}

function feed(id: FeedSourceId, postings: RawPosting[] | (() => Promise<never>), extra: Partial<FeedSource> = {}): FeedSource {
  return {
    id,
    name: id,
    kind: "public_api",
    minIntervalMinutes: 0,
    async fetch() {
      if (typeof postings === "function") return postings();
      return { postings, scopes: [{ scopeKey: postings[0]?.scopeKey ?? `${id}:`, ok: true, complete: true }] };
    },
    ...extra,
  };
}

const http = new HttpClient({ fetchImpl: (async () => new Response("")) as unknown as typeof fetch });
const noLlm = () => new EligibilityTieBreaker({ enabled: false });

beforeEach(() => clearTieBreakMemoryCache());

describe("runIngestion (dry run)", () => {
  it("applies eligibility and reports per-source counts without touching a database", async () => {
    const report = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      tieBreaker: noLlm(),
      feeds: [
        feed("remotive", [
          posting("a"),
          posting("b", { location: "Remote - US", remote: true, title: "Support Agent" }),
          posting("c", { location: "Remote", remote: true, title: "Designer" }),
        ]),
      ],
    });
    expect(report.dryRun).toBe(true);
    expect(report.runId).toBeNull();
    expect(report.sources[0]).toMatchObject({ source: "remotive", fetched: 3, eligible: 1, rejected: 1, uncertain: 1, status: "success" });
    expect(report.totals).toMatchObject({ fetched: 3, eligible: 1, inserted: 0 });
  });

  it("dedupes across sources by identity key and canonical apply URL", async () => {
    const report = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      tieBreaker: noLlm(),
      feeds: [
        feed("greenhouse", [posting("1", { externalId: "greenhouse:acme:1", scopeKey: "greenhouse:acme:" })]),
        feed("remoteok", [
          posting("1", { externalId: "remoteok:9", scopeKey: "remoteok:", applyUrl: "https://jobs.example.com/1?utm_source=remoteok" }),
          posting("2", { externalId: "remoteok:10", scopeKey: "remoteok:", title: "Backend Engineer 1", applyUrl: "https://other.example/x" }),
        ]),
      ],
    });
    expect(report.totals.eligible).toBe(3);
    expect(report.totals.duplicates).toBe(2);
    expect(canonicalApplyUrl("https://www.Jobs.example.com/1/?utm_source=x&gh_src=y#apply")).toBe("jobs.example.com/1");
  });

  it("sends only uncertain postings to the LLM, in batches, and caches by content hash", async () => {
    const completer = vi.fn(async (prompt: string) => {
      const count = prompt.split("\n").filter((line) => line.startsWith("{")).length;
      return JSON.stringify(Array.from({ length: count }, (_value, id) => ({ id, eligible: id % 2 === 0, confidence: 0.9 })));
    });
    const uncertain = Array.from({ length: 5 }, (_value, index) =>
      posting(`u${index}`, { location: "Remote", remote: true, title: `Role ${index}` }),
    );
    const feeds = [feed("remoteok", [posting("eligible"), ...uncertain])];

    const first = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      feeds,
      tieBreaker: new EligibilityTieBreaker({ enabled: true, batchSize: 2, budget: 10, completer }),
    });
    expect(completer).toHaveBeenCalledTimes(3); // 5 uncertain postings / batch of 2
    expect(first.sources[0]).toMatchObject({ uncertain: 5, llmTieBreaks: 5, eligible: 1 + 3 });

    const second = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      feeds,
      tieBreaker: new EligibilityTieBreaker({ enabled: true, batchSize: 2, budget: 10, completer }),
    });
    expect(completer).toHaveBeenCalledTimes(3); // all answered from cache
    expect(second.totals.llmCacheHits).toBe(5);
  });

  it("respects the LLM budget and drops unresolved postings by default", async () => {
    const completer = vi.fn(async () => JSON.stringify([{ id: 0, eligible: true, confidence: 0.9 }]));
    const report = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      feeds: [feed("remoteok", [1, 2, 3].map((index) => posting(`r${index}`, { location: "Remote", remote: true, title: `Role ${index}` })))],
      tieBreaker: new EligibilityTieBreaker({ enabled: true, batchSize: 5, budget: 1, completer }),
    });
    expect(completer).toHaveBeenCalledTimes(1);
    expect(report.sources[0]).toMatchObject({ uncertain: 3, llmTieBreaks: 1, eligible: 1 });
  });

  it("opens the circuit after repeated failures and skips robots-blocked feeds without tripping it", async () => {
    const breakers = new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 60_000 });
    const failing = feed("jobicy", async () => {
      throw new Error("HTTP 503 for https://jobicy.com/api");
    });
    const blocked = feed("remotive", async () => {
      throw new RobotsDisallowedError("https://remotive.com/api/remote-jobs");
    });
    const options = { dryRun: true, now: NOW, http, breakers, tieBreaker: noLlm(), feeds: [failing, blocked] };

    const first = await runIngestion(options);
    expect(first.sources.map((metric) => [metric.source, metric.status, metric.skipReason])).toEqual([
      ["jobicy", "failure", undefined],
      ["remotive", "skipped", "robots"],
    ]);
    expect(first.status).toBe("failure");
    await runIngestion(options);
    const third = await runIngestion(options);
    expect(third.sources[0]).toMatchObject({ status: "skipped", skipReason: "circuit_open" });
    expect(breakers.stateOf("remotive")).toBe("closed");
  });

  it("honours per-feed minimum intervals unless ignored", async () => {
    const breakers = new CircuitBreakerRegistry();
    const slow = feed("remotive", [posting("x")], { minIntervalMinutes: 360 });
    await runIngestion({ dryRun: true, now: NOW, http, breakers, tieBreaker: noLlm(), feeds: [slow] });
    const again = await runIngestion({ dryRun: true, now: NOW, http, breakers, tieBreaker: noLlm(), feeds: [slow] });
    expect(again.sources[0]).toMatchObject({ status: "skipped", skipReason: "min_interval" });
    const manual = await runIngestion({ dryRun: true, now: NOW, http, breakers, tieBreaker: noLlm(), feeds: [slow], ignoreMinInterval: true });
    expect(manual.sources[0].status).toBe("success");
  });

  it("maps to the legacy diagnostics shape used by the cron evaluator", async () => {
    const report = await runIngestion({
      dryRun: true,
      now: NOW,
      http,
      breakers: new CircuitBreakerRegistry(),
      tieBreaker: noLlm(),
      feeds: [feed("greenhouse", [posting("g")])],
    });
    const diagnostics = toAggregationDiagnostics(report);
    expect(diagnostics.sourceDiagnostics[0]).toMatchObject({ source: "GREENHOUSE", status: "success", jobsFetched: 1 });
  });
});

// ── Persistence against an in-memory Prisma double ──────────────────────────
type Row = Record<string, unknown> & { id: string };

function fakePrisma(seed: Row[] = []) {
  const jobs = new Map<string, Row>(seed.map((row) => [row.id, { ...row }]));
  let nextId = 1;
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, condition]) => {
      const value = row[key];
      if (condition && typeof condition === "object" && !(condition instanceof Date)) {
        const c = condition as Record<string, unknown>;
        if ("in" in c) return (c.in as unknown[]).includes(value);
        if ("startsWith" in c) return typeof value === "string" && value.startsWith(String(c.startsWith));
        if ("lt" in c) return value instanceof Date && value < (c.lt as Date);
        if ("gte" in c) return value instanceof Date && value >= (c.gte as Date);
        return false;
      }
      return value === condition;
    });
  const project = (row: Row, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key] ?? null])) : row;

  const prisma = {
    job: {
      findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
        Array.from(jobs.values()).filter((row) => matches(row, where)).map((row) => project(row, select)),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `job-${nextId++}`, employerId: null, ...data } as Row;
        jobs.set(row.id, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...jobs.get(where.id)!, ...data } as Row;
        jobs.set(where.id, row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of jobs.values()) {
          if (matches(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
    },
    companyCareerSource: { findMany: vi.fn(async () => []) },
    employerApplyOptOut: { findUnique: vi.fn(async () => null) },
    aggregatorRun: { create: vi.fn(async () => ({ id: "run-1" })) },
  };
  return { prisma: prisma as unknown as PrismaClient, jobs, raw: prisma };
}

describe("runIngestion (persisting)", () => {
  const baseOptions = () => ({
    now: NOW,
    http,
    breakers: new CircuitBreakerRegistry(),
    tieBreaker: noLlm(),
    trigger: "manual" as const,
  });

  it("inserts new jobs, then only touches unchanged ones (no classification, no rewrite)", async () => {
    const { prisma, jobs, raw } = fakePrisma();
    const feeds = [feed("greenhouse", [posting("1", { externalId: "greenhouse:acme:1", scopeKey: "greenhouse:acme:" })])];
    const llm = vi.fn();

    const first = await runIngestion({ ...baseOptions(), prisma, feeds, classifier: new TaxonomyClassifier(10, llm, true) });
    expect(first.totals).toMatchObject({ inserted: 1, updated: 0, unchanged: 0 });
    expect(first.runId).toBe("run-1");
    const stored = Array.from(jobs.values())[0];
    expect(stored).toMatchObject({ jobSource: "AGGREGATED", hiresFromAfrica: true, status: "PUBLISHED", sourceId: "greenhouse:acme:1" });
    expect(typeof stored.contentHash).toBe("string");

    raw.job.create.mockClear();
    raw.job.update.mockClear();
    const classifier = new TaxonomyClassifier(10, llm, true);
    const classifySpy = vi.spyOn(classifier, "classify");
    const second = await runIngestion({ ...baseOptions(), prisma, feeds, classifier });
    expect(second.totals).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 });
    expect(classifySpy).not.toHaveBeenCalled();
    expect(raw.job.update).not.toHaveBeenCalled();
    expect(raw.job.create).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
  });

  it("updates changed jobs and never overwrites an employer-posted job", async () => {
    const { prisma, jobs } = fakePrisma([
      {
        id: "employer-job",
        slug: "backend-engineer-2-acme",
        sourceId: null,
        dedupKeyV2: identityKey({ title: "Backend Engineer 2", company: "Acme", location: "Lagos, Nigeria", description: "" }),
        sourceFingerprint: null,
        contentHash: null,
        sourceLineage: null,
        status: "PUBLISHED",
        isExpired: false,
        jobSource: "EMPLOYER_POSTED",
        employerId: "emp-1",
        title: "Backend Engineer 2",
      },
    ]);
    const report = await runIngestion({ ...baseOptions(), prisma, feeds: [feed("greenhouse", [posting("2")])] });
    expect(report.sources[0]).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(jobs.get("employer-job")).toMatchObject({ jobSource: "EMPLOYER_POSTED", title: "Backend Engineer 2" });

    const changed = await runIngestion({
      ...baseOptions(),
      prisma,
      feeds: [feed("greenhouse", [posting("3", { title: "Data Analyst" })])],
    });
    expect(changed.totals.inserted).toBe(1);
    const again = await runIngestion({
      ...baseOptions(),
      prisma,
      feeds: [feed("greenhouse", [posting("3", { title: "Data Analyst", descriptionHtml: "<p>Now with SQL and dbt.</p>" })])],
    });
    expect(again.totals).toMatchObject({ updated: 1, inserted: 0 });
  });

  it("expires jobs missing from a fully-read scope, but not from failed or partial scopes", async () => {
    const { prisma, jobs } = fakePrisma();
    await runIngestion({
      ...baseOptions(),
      now: new Date("2026-10-14T00:00:00Z"),
      prisma,
      feeds: [feed("greenhouse", [posting("keep"), posting("gone")])],
    });
    expect(jobs.size).toBe(2);

    await runIngestion({ ...baseOptions(), prisma, feeds: [feed("greenhouse", [posting("keep")])] });
    const byTitle = Object.fromEntries(Array.from(jobs.values()).map((row) => [row.title, row]));
    expect(byTitle["Backend Engineer keep"]).toMatchObject({ isExpired: false, status: "PUBLISHED" });
    expect(byTitle["Backend Engineer gone"]).toMatchObject({ isExpired: true, status: "REJECTED" });
  });

  it("uses the LLM classifier only for low-confidence postings within budget", async () => {
    const { prisma } = fakePrisma();
    const llm = vi.fn(async () => ({ field: "OTHER" as const, version: 1, confidence: 0.9, rationale: "x", source: "llm" as const }));
    const classifier = new TaxonomyClassifier(1, llm, true);
    await runIngestion({
      ...baseOptions(),
      prisma,
      classifier,
      feeds: [
        feed("greenhouse", [
          posting("x1", { title: "Zork Wrangler", descriptionHtml: "<p>Wrangle zorks.</p>" }),
          posting("x2", { title: "Blorp Herder", descriptionHtml: "<p>Herd blorps.</p>" }),
          posting("x3", { title: "Senior Software Engineer", descriptionHtml: "<p>React, Node.js and TypeScript.</p>" }),
        ]),
      ],
    });
    expect(llm).toHaveBeenCalledTimes(1); // budget = 1; confident keyword match never escalates
  });
});
