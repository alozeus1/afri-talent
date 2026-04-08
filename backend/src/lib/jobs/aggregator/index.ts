// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator Service - Coordinates all job sources
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import logger from "../../logger.js";
import type { AggregatedJob, AggregatorResult, JobSource, JobRegion } from "./types.js";
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
import type { BaseJobSource, JobQuery } from "./sources/base.js";

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

const DEFAULT_LEVER_SITE_TOKENS = ["plaid"];

function parseTokenList(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function mergeUniqueTokens(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flatMap((group) => group)));
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

  constructor(prisma: PrismaClient) {
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
      },
      "[aggregator] Initialized job sources",
    );

    if (apiBackedSources.length === 0) {
      logger.warn(
        "[aggregator] No API-backed job sources are configured; staging will rely on fragile public scraping only",
      );
    }
  }

  async aggregateJobs(query: JobQuery): Promise<AggregatorResult[]> {
    const results: AggregatorResult[] = [];

    for (const source of this.sources) {
      if (!source.isEnabled) continue;

      try {
        const result = await source.fetchJobs(query);
        results.push(result);
        logger.info(
          { source: source.source, jobCount: result.jobs.length },
          "[aggregator] Source completed"
        );
      } catch (error) {
        logger.error({ source: source.source, error: String(error) }, "[aggregator] Source failed");
        results.push({
          source: source.source,
          jobs: [],
          totalFound: 0,
          fetchedAt: new Date(),
          errors: [String(error)],
        });
      }
    }

    return results;
  }

  async syncJobsToDatabase(query: JobQuery): Promise<{
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    byRegion: Record<JobRegion, number>;
    bySource: Record<JobSource, number>;
  }> {
    const results = await this.aggregateJobs(query);
    const allJobs = results.flatMap((r) => r.jobs);

    // Deduplicate by externalId
    const groupedJobs = this.groupDuplicateJobs(allJobs);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
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
        if (result === "inserted") inserted++;
        else if (result === "updated") updated++;
        else skipped++;

        byRegion[job.region]++;
        bySource[job.source] = (bySource[job.source] || 0) + 1;
      } catch (error) {
        logger.error({ jobId: job.externalId, error: String(error) }, "[aggregator] Failed to upsert job");
        skipped++;
      }
    }

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
      publishedAt: job.postedAt,
      sourceFirstSeenAt: job.postedAt,
      sourceLastSeenAt: new Date(),
      expiresAt: job.expiresAt ?? null,
      riskScore: 0,
      riskLevel: "LOW" as const,
    };
  }

  private async upsertJob(job: AggregatedJob, variants: AggregatedJob[] = [job]): Promise<"inserted" | "updated" | "skipped"> {
    const fingerprint = buildSourceFingerprint(this.toJobDocument(job));
    const existing = await this.prisma.job.findFirst({
      where: {
        jobSource: "AGGREGATED",
        OR: [
          { sourceId: job.externalId },
          { sourceFingerprint: fingerprint },
        ],
      },
      orderBy: [
        { qualityScore: "desc" },
        { publishedAt: "desc" },
      ],
    });

    // Generate slug
    const baseSlug = this.generateSlug(job.title, job.company);
    const slug = existing?.slug || await this.ensureUniqueSlug(baseSlug);

    const relatedJobs = variants.map((variant) => this.toJobDocument(variant));
    const intelligence = buildJobIntelligenceUpdate(
      this.toJobDocument(job),
      existing?.sourceLineage,
      relatedJobs,
    );

    const jobData = {
      title: job.title,
      slug,
      description: job.description,
      location: job.location,
      type: job.jobType,
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
      sourceName: job.company,
      expiresAt: job.expiresAt || null,
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
      return "updated";
    }

    await this.prisma.job.create({
      data: jobData,
    });
    return "inserted";
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
