// ─────────────────────────────────────────────────────────────────────────────
// Job Aggregator Service - Coordinates all job sources
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import logger from "../../logger.js";
import type { AggregatedJob, AggregatorResult, JobSource, JobRegion } from "./types.js";
import { AFRICA_FRIENDLY_KEYWORDS } from "./types.js";
import { RemoteOKSource } from "./sources/remoteok.js";
import { WeWorkRemotelySource } from "./sources/weworkremotely.js";
import { AdzunaSource } from "./sources/adzuna.js";
import { JobbermanSource } from "./sources/jobberman.js";
import type { BaseJobSource, JobQuery } from "./sources/base.js";

export class JobAggregator {
  private sources: BaseJobSource[] = [];
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeSources();
  }

  private initializeSources(): void {
    // Always-on free sources
    this.sources.push(new RemoteOKSource());
    this.sources.push(new WeWorkRemotelySource());
    this.sources.push(new JobbermanSource());

    // API-based sources (require keys)
    const adzunaAppId = process.env.ADZUNA_APP_ID;
    const adzunaApiKey = process.env.ADZUNA_API_KEY;
    if (adzunaAppId && adzunaApiKey) {
      this.sources.push(new AdzunaSource(adzunaAppId, adzunaApiKey));
    }

    logger.info({ sourceCount: this.sources.length }, "[aggregator] Initialized job sources");
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
    const uniqueJobs = this.deduplicateJobs(allJobs);

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

    for (const job of uniqueJobs) {
      try {
        const result = await this.upsertJob(job);
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
      { total: uniqueJobs.length, inserted, updated, skipped },
      "[aggregator] Sync completed"
    );

    return {
      total: uniqueJobs.length,
      inserted,
      updated,
      skipped,
      byRegion,
      bySource: bySource as Record<JobSource, number>,
    };
  }

  private deduplicateJobs(jobs: AggregatedJob[]): AggregatedJob[] {
    const seen = new Map<string, AggregatedJob>();

    for (const job of jobs) {
      // Create composite key from title + company + location
      const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.location.toLowerCase()}`;
      
      if (!seen.has(key)) {
        seen.set(key, job);
      } else {
        // Prefer jobs with more complete data
        const existing = seen.get(key)!;
        if (this.jobCompleteness(job) > this.jobCompleteness(existing)) {
          seen.set(key, job);
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

  private async upsertJob(job: AggregatedJob): Promise<"inserted" | "updated" | "skipped"> {
    // Check if job already exists by sourceId
    const existing = await this.prisma.job.findFirst({
      where: {
        sourceId: job.externalId,
        jobSource: "AGGREGATED",
      },
    });

    // Generate slug
    const baseSlug = this.generateSlug(job.title, job.company);
    const slug = existing?.slug || await this.ensureUniqueSlug(baseSlug);

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
