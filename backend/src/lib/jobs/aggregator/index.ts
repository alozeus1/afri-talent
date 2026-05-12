// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator Service - Coordinates all job sources
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import logger from "../../logger.js";
import { recordLatencyMetric, recordOpsEvent } from "../../ops/events.js";
import type {
  AggregatedJob,
  AggregationDiagnostics,
  AggregatorResult,
  JobSource,
  JobRegion,
  SourceFetchDiagnostics,
} from "./types.js";
import { AFRICA_FRIENDLY_KEYWORDS } from "./types.js";
import { buildJobIntelligenceUpdate, buildSourceFingerprint } from "../discovery.js";
import { RemoteOKSource } from "./sources/remoteok.js";
import { WeWorkRemotelySource } from "./sources/weworkremotely.js";
import { AdzunaSource } from "./sources/adzuna.js";
import { JobbermanSource } from "./sources/jobberman.js";
import { HimalayasSource } from "./sources/himalayas.js";
import { ArbeitnowSource } from "./sources/arbeitnow.js";
import { RemotiveSource } from "./sources/jobsincyprus.js";
import { ApifySource, parseApifyTaskConfigs } from "./sources/apify.js";
import { GreenhouseSource } from "./sources/greenhouse.js";
import { LeverSource } from "./sources/lever.js";
import { WorkableSource } from "./sources/workable.js";
import {
  CompanyCareerApiSource,
  parseCompanyCareerSourceConfigs,
  type CompanyCareerSourceConfig,
} from "./sources/company-careers.js";
import type { BaseJobSource, JobQuery } from "./sources/base.js";
import { classifyJobField, normalizeWorkplaceType } from "./taxonomy.js";
import { classifyJobField as classifyTaxonomyField } from "../../ai/skills/job-field-classifier.js";
import { classifyApplyStrategy } from "../apply-strategy.js";
import { normalizeCompany, normalizeLocation } from "../normalize.js";
import { buildDedupKeys, findDuplicate, type DedupMatch } from "../dedup.js";

interface AggregatedJobGroup {
  canonical: AggregatedJob;
  variants: AggregatedJob[];
}

const DEFAULT_GREENHOUSE_BOARD_TOKENS = [
  "coinbase",
  "reddit",
  "moniepoint",
  "cloudflare",
  "canonical",
  "duolingo",
  "airtable",
  "brex",
  "vercel",
  "checkr",
  "stripe",
  "figma",
  "clickhouse",
  "elastic",
  "datadog",
  "dropbox",
];

const DEFAULT_LEVER_SITE_TOKENS = [
  "plaid",
  "spreetail",
  "yubico",
  "pointclickcare",
  "levelai",
  "enter-rcm-llc",
];

const DEFAULT_COMPANY_CAREER_SOURCES = [
  { provider: "ASHBY", companyName: "Anthropic", providerKey: "anthropic", careersUrl: "https://www.anthropic.com/careers" },
  { provider: "ASHBY", companyName: "Linear", providerKey: "linear", careersUrl: "https://linear.app/careers" },
  { provider: "GREENHOUSE", companyName: "Nubank", providerKey: "nubank", careersUrl: "https://nubank.com.br/en/careers/" },
  { provider: "GREENHOUSE", companyName: "Wise", providerKey: "wise", careersUrl: "https://wise.jobs/" },
  { provider: "LEVER", companyName: "Spotify", providerKey: "spotify", careersUrl: "https://www.lifeatspotify.com/jobs" },
  { provider: "SMARTRECRUITERS", companyName: "Visa", providerKey: "Visa", careersUrl: "https://usa.visa.com/careers.html" },
  { provider: "SMARTRECRUITERS", companyName: "Bosch Group", providerKey: "BoschGroup", careersUrl: "https://www.bosch.com/careers/" },
  { provider: "RECRUITEE", companyName: "Mews", providerKey: "mews", careersUrl: "https://www.mews.com/en/careers" },
] as const;

function parseTokenList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function mergeUniqueTokens(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flatMap((group) => group)));
}

function classifyFailureReason(message: string): string {
  const normalized = message.toLowerCase();

  const httpMatch = normalized.match(/http\s+(\d{3})/);
  if (httpMatch) {
    const status = Number.parseInt(httpMatch[1], 10);
    if (!Number.isNaN(status)) {
      if (status >= 500) return "http_5xx";
      if (status === 429) return "rate_limited";
      if (status === 401 || status === 403) return "auth";
      if (status >= 400) return "http_4xx";
    }
  }

  if (
    normalized.includes("fetch failed") ||
    normalized.includes("econnreset") ||
    normalized.includes("etimedout") ||
    normalized.includes("enotfound") ||
    normalized.includes("eai_again") ||
    normalized.includes("network")
  ) {
    return "network";
  }

  if (normalized.includes("timeout")) {
    return "timeout";
  }

  if (normalized.includes("unauthorized") || normalized.includes("forbidden") || normalized.includes("token")) {
    return "auth";
  }

  return "unknown";
}

export function resolveSourceCatalog(
  raw: string | undefined,
  defaults: string[],
  options?: { includeDefaults?: boolean },
): string[] {
  const configured = parseTokenList(raw);
  if (options?.includeDefaults === false) {
    return configured;
  }

  return mergeUniqueTokens(configured, defaults);
}

export class JobAggregator {
  private sources: BaseJobSource[] = [];
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient, private readonly extraCompanyCareerSources: CompanyCareerSourceConfig[] = []) {
    this.prisma = prisma;
    this.initializeSources();
  }

  private initializeSources(): void {
    const apiBackedSources: BaseJobSource[] = [];
    const includeDefaultBoardCatalog = process.env.AGGREGATOR_INCLUDE_DEFAULT_BOARD_CATALOG !== "0";

    // API-based sources (require keys)
    const adzunaAppId = process.env.ADZUNA_APP_ID;
    const adzunaApiKey = process.env.ADZUNA_API_KEY;
    if (adzunaAppId && adzunaApiKey) {
      apiBackedSources.push(new AdzunaSource(adzunaAppId, adzunaApiKey));
    }

    const apifyToken = process.env.APIFY_TOKEN?.trim();
    const apifyTasks = parseApifyTaskConfigs(process.env.APIFY_JOB_TASKS_JSON);
    if (apifyToken && apifyTasks.length > 0) {
      apiBackedSources.push(new ApifySource(apifyToken, apifyTasks));
    }

    const greenhouseBoards = resolveSourceCatalog(process.env.GREENHOUSE_BOARD_TOKENS, DEFAULT_GREENHOUSE_BOARD_TOKENS, {
      includeDefaults: includeDefaultBoardCatalog,
    });
    if (greenhouseBoards.length > 0) {
      apiBackedSources.push(new GreenhouseSource(greenhouseBoards));
    }

    const leverSites = resolveSourceCatalog(process.env.LEVER_SITE_TOKENS, DEFAULT_LEVER_SITE_TOKENS, {
      includeDefaults: includeDefaultBoardCatalog,
    });
    if (leverSites.length > 0) {
      apiBackedSources.push(new LeverSource(leverSites));
    }

    const workableAccounts = (process.env.WORKABLE_COMPANY_TOKENS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((entry) => {
        const [account, token] = entry.split(":");
        return {
          account: account?.trim() || "",
          token: token?.trim() || undefined,
        };
      })
      .filter((item) => item.account.length > 0);

    if (workableAccounts.length > 0) {
      apiBackedSources.push(new WorkableSource(workableAccounts));
    }

    const companyCareerSources = parseCompanyCareerSourceConfigs(
      process.env.COMPANY_CAREER_SOURCES_JSON,
      [
        ...(includeDefaultBoardCatalog ? [...DEFAULT_COMPANY_CAREER_SOURCES] : []),
        ...this.extraCompanyCareerSources,
      ],
    );
    if (companyCareerSources.length > 0) {
      apiBackedSources.push(new CompanyCareerApiSource(companyCareerSources));
    }

    const preferApiOnly = apiBackedSources.length > 0 && process.env.AGGREGATOR_INCLUDE_SCRAPED_SOURCES !== "1";
    if (preferApiOnly) {
      this.sources.push(...apiBackedSources);
    } else {
      // Always-on free sources (no API key required)
      this.sources.push(new RemoteOKSource());
      this.sources.push(new WeWorkRemotelySource());
      this.sources.push(new JobbermanSource());
      this.sources.push(new HimalayasSource());
      this.sources.push(new ArbeitnowSource());
      this.sources.push(new RemotiveSource());
      this.sources.push(...apiBackedSources);
    }

    logger.info(
      {
        sourceCount: this.sources.length,
        enabledSources: this.sources.map((source) => source.source),
        apiBackedSourceCount: apiBackedSources.length,
        preferApiOnly,
        includeDefaultBoardCatalog,
        greenhouseBoardCount: greenhouseBoards.length,
        leverSiteCount: leverSites.length,
        workableAccountCount: workableAccounts.length,
        companyCareerSourceCount: companyCareerSources.length,
      },
      "[aggregator] Initialized job sources",
    );

    if (apiBackedSources.length === 0) {
      logger.warn(
        "[aggregator] No API-backed job sources are configured; staging will rely on fragile public scraping only",
      );
    }
  }

  private emitSourceMetrics(diagnostics: SourceFetchDiagnostics): void {
    recordLatencyMetric("source_fetch_latency", diagnostics.durationMs, {
      source: diagnostics.source,
      status: diagnostics.status,
    });

    if (diagnostics.status === "success") {
      recordOpsEvent({
        metricName: "source_fetch_success",
        category: "ingestion",
        details: {
          source: diagnostics.source,
          jobs_fetched: diagnostics.jobsFetched,
          error_count: diagnostics.errorCount,
        },
      });
    } else {
      recordOpsEvent({
        metricName: "source_fetch_failure",
        category: "ingestion",
        outcome: "failure",
        severity: "warning",
        details: {
          source: diagnostics.source,
          jobs_fetched: diagnostics.jobsFetched,
          error_count: diagnostics.errorCount,
          reason: diagnostics.failureReason ?? "unknown",
        },
      });
    }

    const reasonCounts = new Map<string, number>();
    for (const error of diagnostics.errors ?? []) {
      const reason = classifyFailureReason(error);
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }

    for (const [reason, count] of reasonCounts.entries()) {
      recordOpsEvent({
        metricName: "source_fetch_error",
        category: "ingestion",
        outcome: diagnostics.status === "failure" ? "failure" : "degraded",
        severity: diagnostics.status === "failure" ? "warning" : "info",
        value: count,
        details: {
          source: diagnostics.source,
          reason,
        },
      });
    }
  }

  async aggregateJobsWithDiagnostics(query: JobQuery): Promise<{
    results: AggregatorResult[];
    diagnostics: AggregationDiagnostics;
  }> {
    const results: AggregatorResult[] = [];
    const sourceDiagnostics: SourceFetchDiagnostics[] = [];

    for (const source of this.sources) {
      if (!source.isEnabled) continue;
      const startedAt = Date.now();

      try {
        const result = await source.fetchJobs(query);
        results.push(result);
        const errorCount = result.errors?.length ?? 0;
        const sourceStatus: SourceFetchDiagnostics["status"] =
          result.jobs.length === 0 && errorCount > 0 ? "failure" : "success";
        const failureReason =
          sourceStatus === "failure" ? classifyFailureReason(result.errors?.[0] ?? "unknown") : undefined;
        const diagnostics: SourceFetchDiagnostics = {
          source: source.source,
          status: sourceStatus,
          jobsFetched: result.jobs.length,
          errorCount,
          durationMs: Date.now() - startedAt,
          failureReason,
          errors: result.errors,
        };
        sourceDiagnostics.push(diagnostics);
        this.emitSourceMetrics(diagnostics);
        logger.info(
          {
            source: source.source,
            jobCount: result.jobs.length,
            durationMs: diagnostics.durationMs,
            errorCount,
            sourceStatus,
            failureReason,
          },
          "[aggregator] Source completed"
        );
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const errorMessage = String(error);
        const failureReason = classifyFailureReason(errorMessage);
        logger.error({ source: source.source, error: String(error) }, "[aggregator] Source failed");
        results.push({
          source: source.source,
          jobs: [],
          totalFound: 0,
          fetchedAt: new Date(),
          errors: [errorMessage],
        });
        const diagnostics: SourceFetchDiagnostics = {
          source: source.source,
          status: "failure",
          jobsFetched: 0,
          errorCount: 1,
          durationMs,
          failureReason,
          errors: [errorMessage],
        };
        sourceDiagnostics.push(diagnostics);
        this.emitSourceMetrics(diagnostics);
      }
    }

    const sourcesAttempted = sourceDiagnostics.length;
    const sourcesFailed = sourceDiagnostics.filter((entry) => entry.status === "failure").length;
    const sourcesSucceeded = sourcesAttempted - sourcesFailed;
    const jobsFetched = results.reduce((sum, result) => sum + result.jobs.length, 0);
    const hadErrors = sourceDiagnostics.some((entry) => entry.errorCount > 0);

    return {
      results,
      diagnostics: {
        sourcesAttempted,
        sourcesSucceeded,
        sourcesFailed,
        jobsFetched,
        // §4.2 — set by syncJobsToDatabase after the upsert pass; defaulted
        // here so callers that only read the diagnostics object never see
        // `undefined`.
        duplicatesRemoved: 0,
        hadErrors,
        sourceDiagnostics,
      },
    };
  }

  async aggregateJobs(query: JobQuery): Promise<AggregatorResult[]> {
    const { results } = await this.aggregateJobsWithDiagnostics(query);
    return results;
  }

  async syncJobsToDatabase(query: JobQuery): Promise<{
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    byRegion: Record<JobRegion, number>;
    bySource: Record<JobSource, number>;
    diagnostics: AggregationDiagnostics;
  }> {
    const { results, diagnostics } = await this.aggregateJobsWithDiagnostics(query);
    const allJobs = results.flatMap((r) => r.jobs);

    // Deduplicate by externalId
    const groupedJobs = this.groupDuplicateJobs(allJobs);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    // §4.2 — only K1 (cross-source title canonicalisation) and K3 (embedding
    // cosine ≥ 0.92) count as actual dedups. K2 is the same source's re-scrape
    // hitting the same fingerprint, which is normal traffic, not a duplicate.
    let duplicatesRemoved = 0;
    const byRegion: Record<JobRegion, number> = {
      AFRICA: 0,
      EUROPE: 0,
      NORTH_AMERICA: 0,
      REMOTE_GLOBAL: 0,
      OTHER: 0,
    };
    const bySource: Partial<Record<JobSource, number>> = {};

    for (const group of groupedJobs) {
      const job = group.canonical;
      try {
        const result = await this.upsertJob(job, group.variants);
        if (result.outcome === "inserted") inserted++;
        else if (result.outcome === "updated") updated++;
        else skipped++;

        if (result.dedupMatch && result.dedupMatch.matchedOn !== "K2") {
          duplicatesRemoved += 1;
        }

        byRegion[job.region]++;
        bySource[job.source] = (bySource[job.source] || 0) + 1;
      } catch (error) {
        logger.error({ jobId: job.externalId, error: String(error) }, "[aggregator] Failed to upsert job");
        skipped++;
      }
    }

    diagnostics.duplicatesRemoved = duplicatesRemoved;

    logger.info(
      { total: groupedJobs.length, inserted, updated, skipped },
      "[aggregator] Sync completed"
    );

    if (groupedJobs.length === 0) {
      logger.warn(
        {
          enabledSources: this.getEnabledSources(),
        },
        "[aggregator] Sync completed with zero jobs; verify source credentials and upstream availability",
      );
    }

    return {
      total: groupedJobs.length,
      inserted,
      updated,
      skipped,
      byRegion,
      bySource: bySource as Record<JobSource, number>,
      diagnostics,
    };
  }

  private groupDuplicateJobs(jobs: AggregatedJob[]): AggregatedJobGroup[] {
    const seen = new Map<string, AggregatedJobGroup>();

    for (const job of jobs) {
      const key = buildSourceFingerprint({
        title: job.title,
        description: job.description,
        location: job.location,
        sourceUrl: job.sourceUrl,
        sourceId: job.externalId,
        sourceName: job.company,
        jobSource: job.source,
      });

      if (!seen.has(key)) {
        seen.set(key, {
          canonical: job,
          variants: [job],
        });
      } else {
        const existing = seen.get(key)!;
        existing.variants.push(job);

        // Prefer jobs with more complete data, then fresher postings.
        if (
          this.jobCompleteness(job) > this.jobCompleteness(existing.canonical) ||
          (
            this.jobCompleteness(job) === this.jobCompleteness(existing.canonical) &&
            job.postedAt.getTime() > existing.canonical.postedAt.getTime()
          )
        ) {
          existing.canonical = job;
        }
      }
    }

    return Array.from(seen.values());
  }

  private jobCompleteness(job: AggregatedJob): number {
    let score = 0;
    if (job.description.length > 100) score += 2;
    if (job.salary) score += 2;
    if (job.skills.length > 0) score += 1;
    if (job.seniority) score += 1;
    if (job.visaSponsorship !== "UNKNOWN") score += 1;
    if (job.companyLogo) score += 1;
    return score;
  }

  private toJobDocument(job: AggregatedJob) {
    return {
      title: job.title,
      description: job.description,
      location: job.location,
      type: job.jobType,
      seniority: job.seniority,
      jobField: job.jobField ?? classifyJobField({
        title: job.title,
        description: job.description,
        tags: job.skills,
      }),
      workplaceType: job.workplaceType ?? normalizeWorkplaceType(job.locationType),
      tags: job.skills,
      salaryMin: job.salary?.min ?? null,
      salaryMax: job.salary?.max ?? null,
      currency: job.salary?.currency ?? null,
      visaSponsorship: job.visaSponsorship,
      relocationAssistance: job.relocationAssistance,
      eligibleCountries: job.eligibleCountries,
      sourceUrl: job.sourceUrl,
      sourceId: job.externalId,
      sourceName: job.company,
      jobSource: job.source,
      applicationUrl: job.applicationUrl,
      companyCareerSourceId: job.companyCareerSourceId ?? null,
      publishedAt: job.postedAt,
      sourceFirstSeenAt: job.postedAt,
      sourceLastSeenAt: new Date(),
      expiresAt: job.expiresAt ?? null,
      riskScore: 0,
      riskLevel: "LOW" as const,
    };
  }

  private async upsertJob(
    job: AggregatedJob,
    variants: AggregatedJob[] = [job],
  ): Promise<{ outcome: "inserted" | "updated" | "skipped"; dedupMatch?: DedupMatch }> {
    const fingerprint = buildSourceFingerprint(this.toJobDocument(job));

    // §4.2 — tri-key cascade. K1 (norm company:title:city) → K2
    // (sourceFingerprint) → K3 (embedding cosine ≥ 0.92).
    const dedupMatch = await findDuplicate(this.prisma, {
      title: job.title,
      description: job.description,
      company: job.company,
      location: job.location,
      sourceFingerprint: fingerprint,
      sourceName: job.company,
    });

    const existing = dedupMatch
      ? await this.prisma.job.findUnique({ where: { id: dedupMatch.jobId } })
      : null;

    // Generate slug
    const baseSlug = this.generateSlug(job.title, job.company);
    const slug = existing?.slug || await this.ensureUniqueSlug(baseSlug);

    const relatedJobs = variants.map((variant) => this.toJobDocument(variant));
    const intelligence = buildJobIntelligenceUpdate(
      this.toJobDocument(job),
      existing?.sourceLineage,
      relatedJobs,
    );

    // §4.1 — controlled taxonomy classification runs inline at ingest. Falls
    // back to keyword path when LLM is unavailable, MOCK_AI=1, or confidence
    // < 0.6. Legacy `jobField` stays alongside for back-compat until the
    // consumer cutover (separate frontend PR).
    const classification = await classifyTaxonomyField({
      title: job.title,
      description: job.description,
      companyName: job.company,
      seniority: job.seniority ?? undefined,
      tags: job.skills,
    });

    // §4.5 — write normalised canonical forms for company + location so the
    // dedup key (PR K) and search facets can match without re-running these.
    const normalizedCompany = normalizeCompany(job.company);
    const normalizedLocation = normalizeLocation(job.location, job.locationType);

    // §4.2 — persist K1 alongside the row so future inserts can short-circuit
    // to a text-index hit.
    const dedupKeys = buildDedupKeys({
      title: job.title,
      description: job.description,
      company: job.company,
      location: job.location,
      sourceFingerprint: fingerprint,
      sourceName: job.company,
    });

    // §5.2 — apply pathway routing. Uses the vendor on `job.source`
    // (GREENHOUSE/LEVER/...) — not the DB `jobSource: "AGGREGATED"` we write
    // below — so the classifier can match per-vendor ATS partner flags.
    const applyDecision = classifyApplyStrategy({
      jobSource: job.source,
      description: job.description,
      sourceUrl: job.sourceUrl,
      applicationUrl: job.applicationUrl,
    });

    const jobData = {
      title: job.title,
      slug,
      description: job.description,
      location: normalizedLocation.display || job.location,
      type: job.jobType,
      jobField: job.jobField ?? classifyJobField({
        title: job.title,
        description: job.description,
        tags: job.skills,
      }),
      taxonomyField: classification.field,
      taxonomyVersion: classification.version,
      taxonomyConfidence: classification.confidence,
      dedupKeyV2: dedupKeys.k1,
      applyStrategy: applyDecision.strategy,
      applyEmailDetected: applyDecision.applyEmailDetected ?? null,
      applyFormDomain: applyDecision.applyFormDomain ?? null,
      workplaceType: job.workplaceType ?? normalizeWorkplaceType(job.locationType),
      seniority: job.seniority || "Mid-level",
      salaryMin: job.salary?.min,
      salaryMax: job.salary?.max,
      currency: job.salary?.currency,
      tags: job.skills,
      status: "PUBLISHED" as const,
      publishedAt: job.postedAt,
      visaSponsorship: job.visaSponsorship,
      relocationAssistance: job.relocationAssistance,
      eligibleCountries: job.eligibleCountries,
      jobSource: "AGGREGATED" as const,
      sourceUrl: job.sourceUrl,
      sourceId: job.externalId,
      sourceName: normalizedCompany || job.company,
      expiresAt: job.expiresAt || null,
      companyCareerSourceId: job.companyCareerSourceId ?? null,
      lastCheckedAt: new Date(),
      isExpired: false,
      riskScore: 0,
      riskLevel: "LOW" as const,
      qualityCheckedAt: new Date(),
      ...intelligence,
    };

    if (existing) {
      await this.prisma.job.update({
        where: { id: existing.id },
        data: jobData,
      });
      return { outcome: "updated", dedupMatch: dedupMatch ?? undefined };
    }

    await this.prisma.job.create({
      data: jobData,
    });
    return { outcome: "inserted" };
  }

  private generateSlug(title: string, company: string): string {
    const combined = `${title} ${company}`;
    return combined
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
  }

  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.job.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // Filter jobs that are likely to accept African candidates
  filterAfricaFriendly(jobs: AggregatedJob[]): AggregatedJob[] {
    return jobs.filter((job) => {
      // Jobs from Africa are always included
      if (job.region === "AFRICA") return true;

      // Remote global jobs are included
      if (job.region === "REMOTE_GLOBAL" && job.locationType === "remote") return true;

      // Jobs with visa sponsorship
      if (job.visaSponsorship === "YES") return true;

      // Jobs mentioning Africa-friendly keywords
      const text = `${job.title} ${job.description}`.toLowerCase();
      return AFRICA_FRIENDLY_KEYWORDS.some((kw) => text.includes(kw));
    });
  }

  getEnabledSources(): JobSource[] {
    return this.sources.filter((s) => s.isEnabled).map((s) => s.source);
  }
}

// Export singleton factory
let aggregatorInstance: JobAggregator | null = null;

export function getJobAggregator(prisma: PrismaClient): JobAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new JobAggregator(prisma);
  }
  return aggregatorInstance;
}

export type { AggregatedJob, AggregatorResult, JobSource, JobRegion, JobQuery };
