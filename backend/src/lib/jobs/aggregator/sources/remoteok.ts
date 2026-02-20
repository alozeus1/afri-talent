// ─────────────────────────────────────────────────────────────────────────────
// RemoteOK Job Source - Free API, excellent for remote jobs globally
// ─────────────────────────────────────────────────────────────────────────────

import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult, JobSourceConfig } from "../types.js";

interface RemoteOKJob {
  id: string;
  slug: string;
  company: string;
  company_logo?: string;
  position: string;
  tags: string[];
  description: string;
  location: string;
  salary_min?: number;
  salary_max?: number;
  date: string;
  url: string;
  apply_url?: string;
}

export class RemoteOKSource extends BaseJobSource {
  constructor(apiKey?: string) {
    super({
      source: "REMOTEOK",
      name: "Remote OK",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://remoteok.com/api",
      apiKey,
      rateLimit: { requestsPerMinute: 10, requestsPerDay: 1000 },
      enabled: true,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: false,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    await this.rateLimit();
    this.log("Fetching jobs", { keywords: query.keywords });

    try {
      const response = await fetch(this.config.baseUrl, {
        headers: { "User-Agent": "AfriTalent/1.0" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as RemoteOKJob[];
      // First item is metadata, skip it
      const jobs = data.slice(1);

      const filtered = this.filterJobs(jobs, query);
      const transformed = filtered.map((job) => this.transformJob(job));

      this.log("Fetched jobs", { total: jobs.length, filtered: transformed.length });

      return {
        source: this.source,
        jobs: transformed,
        totalFound: jobs.length,
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logError("Failed to fetch jobs", error);
      return {
        source: this.source,
        jobs: [],
        totalFound: 0,
        fetchedAt: new Date(),
        errors: [String(error)],
      };
    }
  }

  private filterJobs(jobs: RemoteOKJob[], query: JobQuery): RemoteOKJob[] {
    return jobs.filter((job) => {
      // Keyword match
      if (query.keywords.length > 0) {
        const text = `${job.position} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
        const matches = query.keywords.some((kw) => text.includes(kw.toLowerCase()));
        if (!matches) return false;
      }

      // Date filter
      if (query.postedWithinDays) {
        const postedDate = new Date(job.date);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
        if (postedDate < cutoff) return false;
      }

      return true;
    }).slice(0, query.limit || 50);
  }

  private transformJob(job: RemoteOKJob): AggregatedJob {
    return {
      externalId: job.id,
      source: this.source,
      sourceUrl: job.url,
      title: job.position,
      company: job.company,
      companyLogo: job.company_logo,
      location: job.location || "Remote",
      locationType: "remote",
      country: "GLOBAL",
      region: "REMOTE_GLOBAL",
      description: job.description,
      requirements: [],
      salary: job.salary_min || job.salary_max ? {
        min: job.salary_min,
        max: job.salary_max,
        currency: "USD",
        period: "yearly",
      } : undefined,
      visaSponsorship: this.detectVisaSponsorship(job.description),
      relocationAssistance: false,
      eligibleCountries: [],
      skills: job.tags.map((t) => t.toLowerCase()),
      seniority: this.detectSeniority(job.position, job.description),
      jobType: "Full-time",
      postedAt: new Date(job.date),
      applicationUrl: job.apply_url || job.url,
      rawData: job as unknown as Record<string, unknown>,
    };
  }
}

export const remoteOKConfig: JobSourceConfig = {
  source: "REMOTEOK",
  name: "Remote OK",
  region: "REMOTE_GLOBAL",
  baseUrl: "https://remoteok.com/api",
  rateLimit: { requestsPerMinute: 10, requestsPerDay: 1000 },
  enabled: true,
  supportsAfricanCandidates: true,
  visaSponsorshipCommon: false,
};
