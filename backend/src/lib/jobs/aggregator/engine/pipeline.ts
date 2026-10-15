// ─────────────────────────────────────────────────────────────────────────────
// Aggregator engine — one ingestion run.
//
//   feeds ──(concurrency, circuit breaker, min-interval, time budget)──▶ raw
//   raw ──normalise──▶ eligibility rules ──uncertain──▶ batched LLM tie-break
//   eligible ──cross-source dedupe──▶ persist (skip unchanged) ──▶ expire stale
//   metrics per source ──▶ AggregatorRun row (+ ops events)
//
// dryRun: everything except persistence — no DB reads or writes at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import logger from "../../../logger.js";
import { recordLatencyMetric, recordOpsEvent } from "../../../ops/events.js";
import type { AggregationDiagnostics, SourceFetchDiagnostics } from "../types.js";
import { CircuitBreakerRegistry, getSharedCircuitBreakers, mapWithConcurrency } from "./circuit-breaker.js";
import { contentHash, groupDuplicates } from "./dedupe.js";
import { getSharedHttpClient, HttpClient, RobotsDisallowedError } from "./http.js";
import { EligibilityTieBreaker } from "./llm-tiebreak.js";
import { feedToJobSource, normalizePosting, type NormalizedPosting } from "./normalize-posting.js";
import { expireMissing, persistGroups, TaxonomyClassifier } from "./persist.js";
import { buildFeedSources } from "./registry.js";
import type {
  FeedScopeResult,
  FeedSource,
  FeedSourceId,
  IngestionRunReport,
  RunTotals,
  SourceRunMetrics,
} from "./types.js";

export interface RunIngestionOptions {
  prisma?: PrismaClient;
  dryRun?: boolean;
  trigger?: IngestionRunReport["trigger"];
  feeds?: FeedSource[];
  http?: HttpClient;
  breakers?: CircuitBreakerRegistry;
  tieBreaker?: EligibilityTieBreaker;
  classifier?: TaxonomyClassifier;
  now?: Date;
  postedWithinDays?: number;
  maxPostingsPerSource?: number;
  sourceConcurrency?: number;
  sourceTimeoutMs?: number;
  uncertainPolicy?: "drop" | "keep";
  /** Ignore per-feed minIntervalMinutes (manual runs). */
  ignoreMinInterval?: boolean;
  sampleSize?: number;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyMetrics(feed: FeedSource, circuit: SourceRunMetrics["circuit"]): SourceRunMetrics {
  return {
    source: feed.id,
    name: feed.name,
    status: "success",
    circuit,
    fetched: 0,
    eligible: 0,
    rejected: 0,
    uncertain: 0,
    llmTieBreaks: 0,
    duplicates: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    expired: 0,
    errors: 0,
    notModifiedScopes: 0,
    scopesOk: 0,
    scopesFailed: 0,
    durationMs: 0,
    errorSamples: [],
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`source time budget of ${ms}ms exhausted`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadCareerSourceRows(prisma: PrismaClient) {
  try {
    return await prisma.companyCareerSource.findMany({
      where: { active: true, allowedToCrawl: true },
      select: { id: true, provider: true, providerKey: true, companyName: true, careersUrl: true },
      orderBy: [{ priority: "asc" }, { companyName: "asc" }],
    });
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "[aggregator] could not load CompanyCareerSource rows");
    return [];
  }
}

export async function runIngestion(options: RunIngestionOptions = {}): Promise<IngestionRunReport> {
  const dryRun = Boolean(options.dryRun);
  const prisma = options.prisma;
  if (!dryRun && !prisma) throw new Error("runIngestion: prisma is required unless dryRun");

  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const http = options.http ?? getSharedHttpClient();
  const breakers = options.breakers ?? getSharedCircuitBreakers();
  const postedWithinDays = options.postedWithinDays ?? envInt("AGGREGATOR_POSTED_DAYS", 21);
  const postedAfter = new Date(now.getTime() - postedWithinDays * 86_400_000);
  const maxPostings = options.maxPostingsPerSource ?? envInt("AGGREGATOR_MAX_JOBS", 500);
  const sourceTimeoutMs = options.sourceTimeoutMs ?? envInt("AGGREGATOR_SOURCE_TIMEOUT_MS", 120_000);
  const uncertainPolicy = options.uncertainPolicy ?? (process.env.AGGREGATOR_UNCERTAIN_POLICY === "keep" ? "keep" : "drop");
  const trigger = options.trigger ?? (dryRun ? "dry_run" : "cron");

  const feeds =
    options.feeds ??
    buildFeedSources({ careerSourceRows: !dryRun && prisma ? await loadCareerSourceRows(prisma) : undefined }).feeds;

  const metrics = new Map<FeedSourceId, SourceRunMetrics>();
  const completeScopes: string[] = [];
  const allPostings: NormalizedPosting[] = [];

  // ── 1. Fetch
  await mapWithConcurrency(feeds, options.sourceConcurrency ?? envInt("AGGREGATOR_SOURCE_CONCURRENCY", 4), async (feed) => {
    const metric = emptyMetrics(feed, breakers.stateOf(feed.id));
    metrics.set(feed.id, metric);

    if (!breakers.canAttempt(feed.id)) {
      metric.status = "skipped";
      metric.skipReason = "circuit_open";
      return;
    }
    if (!options.ignoreMinInterval && !breakers.intervalElapsed(feed.id, feed.minIntervalMinutes)) {
      metric.status = "skipped";
      metric.skipReason = "min_interval";
      return;
    }

    const feedStarted = Date.now();
    const controller = new AbortController();
    let scopes: FeedScopeResult[] = [];
    try {
      const result = await withTimeout(
        feed.fetch({ http, signal: controller.signal, now, postedAfter, maxPostings }),
        sourceTimeoutMs,
        controller,
      );
      scopes = result.scopes;
      for (const raw of result.postings) {
        try {
          allPostings.push(normalizePosting(feed.id, raw, now));
          metric.fetched += 1;
        } catch (error) {
          metric.errors += 1;
          if (metric.errorSamples.length < 3) metric.errorSamples.push(`normalize: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      const robots = error instanceof RobotsDisallowedError;
      scopes = [{ scopeKey: `${feed.id}:`, ok: false, complete: false, error: robots ? `robots: ${(error as Error).message}` : (error as Error).message }];
    } finally {
      metric.durationMs = Date.now() - feedStarted;
    }

    metric.scopesOk = scopes.filter((scope) => scope.ok).length;
    metric.scopesFailed = scopes.length - metric.scopesOk;
    metric.notModifiedScopes = scopes.filter((scope) => scope.notModified).length;
    const failedScopes = scopes.filter((scope) => !scope.ok);
    metric.errors += failedScopes.length;
    metric.errorSamples.push(...failedScopes.slice(0, 5 - metric.errorSamples.length).map((scope) => scope.error ?? "unknown"));

    const robotsOnly = failedScopes.length > 0 && failedScopes.every((scope) => /robots/i.test(scope.error ?? ""));
    if (metric.scopesOk === 0 && robotsOnly) {
      metric.status = "skipped";
      metric.skipReason = "robots";
      return;
    }
    if (metric.scopesOk === 0) {
      metric.status = "failure";
      breakers.recordFailure(feed.id);
    } else {
      metric.status = metric.scopesFailed > 0 ? "partial" : "success";
      breakers.recordSuccess(feed.id);
      completeScopes.push(...scopes.filter((scope) => scope.ok && scope.complete).map((scope) => scope.scopeKey));
    }
    metric.circuit = breakers.stateOf(feed.id);
  });

  // ── 2. Eligibility (rules, then batched LLM tie-break for "uncertain")
  const tieBreaker = options.tieBreaker ?? new EligibilityTieBreaker();
  const uncertain = allPostings.filter((posting) => posting.eligibility.verdict === "uncertain");
  const uncertainKeys = new Map(uncertain.map((posting) => [posting, contentHash(posting.job)]));
  const resolved = uncertain.length > 0
    ? await tieBreaker.resolve(
        uncertain.map((posting) => ({
          key: uncertainKeys.get(posting)!,
          title: posting.job.title,
          company: posting.job.company,
          location: posting.job.location,
          excerpt: posting.job.description.slice(0, 600),
        })),
      )
    : new Map<string, boolean>();

  const kept: NormalizedPosting[] = [];
  for (const posting of allPostings) {
    const metric = metrics.get(posting.feed)!;
    const verdict = posting.eligibility.verdict;
    if (verdict === "eligible") {
      metric.eligible += 1;
      kept.push(posting);
      continue;
    }
    if (verdict === "ineligible") {
      metric.rejected += 1;
      continue;
    }
    metric.uncertain += 1;
    const answer = resolved.get(uncertainKeys.get(posting)!);
    if (answer !== undefined) {
      metric.llmTieBreaks += 1;
      posting.eligibility = {
        verdict: answer ? "eligible" : "ineligible",
        scopes: answer ? ["REMOTE_WORLDWIDE"] : [],
        reasons: [...posting.eligibility.reasons, `llm tie-break: ${answer ? "eligible" : "ineligible"}`],
        decidedBy: "llm",
      };
      if (answer) {
        metric.eligible += 1;
        kept.push(posting);
      } else {
        metric.rejected += 1;
      }
    } else if (uncertainPolicy === "keep") {
      // Persisted with hiresFromAfrica=false; candidates still see it in search.
      posting.eligibility = { ...posting.eligibility, decidedBy: "policy" };
      kept.push(posting);
    }
  }

  // ── 3. Cross-source dedupe
  const groups = groupDuplicates(kept);
  for (const group of groups) {
    for (const variant of group.variants) {
      if (variant !== group.canonical) metrics.get(variant.feed)!.duplicates += 1;
    }
  }

  // ── 4. Persist + expire (skipped entirely on dry runs)
  let llmClassifications = 0;
  if (!dryRun && prisma) {
    const classifier = options.classifier ?? new TaxonomyClassifier(envInt("AGGREGATOR_LLM_MAX_CLASSIFICATIONS_PER_RUN", 50));
    const persisted = await persistGroups(prisma, groups, { now, classifier });
    llmClassifications = persisted.llmClassifications;
    for (const [feed, counters] of persisted.byFeed) {
      const metric = metrics.get(feed);
      if (!metric) continue;
      metric.inserted += counters.inserted;
      metric.updated += counters.updated;
      metric.unchanged += counters.unchanged;
      metric.duplicates += counters.duplicates;
      metric.rejected += counters.qualityRejected;
      metric.errors += counters.failed;
    }
    const expired = await expireMissing(prisma, completeScopes, { runStartedAt: now, postedAfter });
    for (const [scopeKey, count] of expired) {
      const feedId = scopeKey.split(":")[0] as FeedSourceId;
      const metric = metrics.get(feedId);
      if (metric) metric.expired += count;
    }
  }

  // ── 5. Report
  const sources = feeds.map((feed) => metrics.get(feed.id)!).filter(Boolean);
  const sum = (key: keyof SourceRunMetrics) => sources.reduce((acc, metric) => acc + (Number(metric[key]) || 0), 0);
  const attempted = sources.filter((metric) => metric.status !== "skipped");
  const totals: RunTotals = {
    sourcesAttempted: attempted.length,
    sourcesSucceeded: attempted.filter((metric) => metric.status === "success" || metric.status === "partial").length,
    sourcesFailed: attempted.filter((metric) => metric.status === "failure").length,
    sourcesSkipped: sources.length - attempted.length,
    fetched: sum("fetched"),
    eligible: sum("eligible"),
    rejected: sum("rejected"),
    uncertain: sum("uncertain"),
    duplicates: sum("duplicates"),
    inserted: sum("inserted"),
    updated: sum("updated"),
    unchanged: sum("unchanged"),
    expired: sum("expired"),
    errors: sum("errors"),
    llmCalls: tieBreaker.stats.calls + llmClassifications,
    llmJobsClassified: tieBreaker.stats.jobsClassified + llmClassifications,
    llmCacheHits: tieBreaker.stats.cacheHits,
  };
  const status: IngestionRunReport["status"] =
    totals.sourcesAttempted > 0 && totals.sourcesSucceeded === 0
      ? "failure"
      : totals.sourcesFailed > 0 || sources.some((metric) => metric.status === "partial")
        ? "partial"
        : "success";

  const finishedAt = Date.now();
  const sampleSize = options.sampleSize ?? (dryRun ? 3 : 0);
  const sample: IngestionRunReport["sample"] = [];
  if (sampleSize > 0) {
    for (const feed of feeds) {
      groups
        .filter((group) => group.canonical.feed === feed.id && group.canonical.eligibility.verdict === "eligible")
        .slice(0, sampleSize)
        .forEach((group) =>
          sample.push({
            title: group.canonical.job.title,
            company: group.canonical.job.company,
            location: group.canonical.job.location,
            source: group.canonical.feed,
            scopes: group.canonical.eligibility.scopes,
            applyUrl: group.canonical.job.applicationUrl,
          }),
        );
    }
  }

  const report: IngestionRunReport = {
    runId: null,
    trigger,
    dryRun,
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    totals,
    sources,
    sample: sampleSize > 0 ? sample : undefined,
  };

  if (!dryRun) emitOpsMetrics(sources);

  if (!dryRun && prisma) {
    try {
      const row = await prisma.aggregatorRun.create({
        data: {
          trigger,
          dryRun,
          status,
          startedAt: new Date(startedAt),
          finishedAt: new Date(finishedAt),
          durationMs: report.durationMs,
          totals: totals as unknown as Prisma.InputJsonValue,
          sources: sources as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      report.runId = row.id;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "[aggregator] failed to persist AggregatorRun");
    }
  }

  logger.info(
    { trigger, dryRun, status, durationMs: report.durationMs, totals },
    "[aggregator] ingestion run complete",
  );
  return report;
}

function emitOpsMetrics(sources: SourceRunMetrics[]): void {
  for (const metric of sources) {
    if (metric.status === "skipped") continue;
    recordLatencyMetric("source_fetch_latency", metric.durationMs, { source: metric.source, status: metric.status });
    recordOpsEvent({
      metricName: metric.status === "failure" ? "source_fetch_failure" : "source_fetch_success",
      category: "ingestion",
      outcome: metric.status === "failure" ? "failure" : metric.status === "partial" ? "degraded" : "success",
      severity: metric.status === "failure" ? "warning" : "info",
      details: {
        source: metric.source,
        jobs_fetched: metric.fetched,
        eligible: metric.eligible,
        inserted: metric.inserted,
        updated: metric.updated,
        unchanged: metric.unchanged,
        error_count: metric.errors,
      },
    });
  }
}

/** Adapter for the cron's evaluateIngestionCycle (legacy diagnostics shape). */
export function toAggregationDiagnostics(report: IngestionRunReport): AggregationDiagnostics {
  const sourceDiagnostics: SourceFetchDiagnostics[] = report.sources
    .filter((metric) => metric.status !== "skipped")
    .map((metric) => ({
      source: feedToJobSource(metric.source),
      status: metric.status === "failure" ? "failure" : "success",
      jobsFetched: metric.fetched,
      errorCount: metric.errors,
      durationMs: metric.durationMs,
      failureReason: metric.status === "failure" ? "source_fetch_failed" : undefined,
      errors: metric.errorSamples.length > 0 ? metric.errorSamples : undefined,
    }));
  return {
    sourcesAttempted: report.totals.sourcesAttempted,
    sourcesSucceeded: report.totals.sourcesSucceeded,
    sourcesFailed: report.totals.sourcesFailed,
    jobsFetched: report.totals.fetched,
    duplicatesRemoved: report.totals.duplicates,
    hadErrors: report.totals.errors > 0,
    sourceDiagnostics,
  };
}
