// ─────────────────────────────────────────────────────────────────────────────
// Himalayas.app — Free public API, strong remote-first / global talent focus
// Excellent for African candidates: many "work from anywhere" listings
// API: https://himalayas.app/api/jobs (free, no auth needed)
// ─────────────────────────────────────────────────────────────────────────────

import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface HimalayasJob {
  id: number;
  title: string;
  companyName: string;
  companyLogo?: string;
  excerpt: string;
  description: string;
  applicationLink: string;
  pubDate: string;
  expiryDate?: string;
  categories: string[];
  tags: string[];
  seniority: string[];
  locations: string[];
  timezones?: string[];
  salary?: string;
  minSalary?: number;
  maxSalary?: number;
  salaryCurrency?: string;
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
  totalCount: number;
  offset: number;
  limit: number;
}

export class HimalayasSource extends BaseJobSource {
  constructor() {
    super({
      source: "REMOTECO",
      name: "Himalayas",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://himalayas.app/jobs/api",
      rateLimit: { requestsPerMinute: 10, requestsPerDay: 500 },
      enabled: true,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: false,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    await this.rateLimit();
    this.log("Fetching jobs", { keywords: query.keywords.slice(0, 3) });

    const allJobs: AggregatedJob[] = [];

    try {
      const keywordsToSearch = query.keywords.slice(0, 5);

      for (const keyword of keywordsToSearch) {
        await this.rateLimit();
        const url = new URL(this.config.baseUrl);
        url.searchParams.set("limit", String(Math.min(query.limit || 30, 50)));
        url.searchParams.set("offset", "0");
        url.searchParams.set("q", keyword);

        const response = await fetch(url.toString(), {
          headers: { "User-Agent": "AfriTalent/1.0", Accept: "application/json" },
        });

        if (!response.ok) {
          this.logError(`HTTP ${response.status} for keyword "${keyword}"`, response.statusText);
          continue;
        }

        const data = (await response.json()) as HimalayasResponse;

        for (const job of data.jobs) {
          if (query.postedWithinDays) {
            const postedDate = new Date(job.pubDate);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
            if (postedDate < cutoff) continue;
          }
          allJobs.push(this.transformJob(job));
        }
      }

      // Deduplicate by externalId
      const seen = new Set<string>();
      const unique = allJobs.filter((j) => {
        if (seen.has(j.externalId)) return false;
        seen.add(j.externalId);
        return true;
      });

      this.log("Fetched jobs", { total: unique.length });

      return {
        source: this.source,
        jobs: unique.slice(0, query.limit || 50),
        totalFound: unique.length,
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logError("Failed to fetch jobs", error);
      return { source: this.source, jobs: [], totalFound: 0, fetchedAt: new Date(), errors: [String(error)] };
    }
  }

  private transformJob(job: HimalayasJob): AggregatedJob {
    const locationStr = job.locations.length > 0 ? job.locations.join(", ") : "Remote";
    const normalized = this.normalizeLocation(locationStr);

    return {
      externalId: `himalayas-${job.id}`,
      source: this.source,
      sourceUrl: job.applicationLink,
      title: job.title,
      company: job.companyName,
      companyLogo: job.companyLogo,
      location: locationStr,
      locationType: normalized.locationType,
      country: normalized.country || "GLOBAL",
      region: "REMOTE_GLOBAL",
      description: job.description || job.excerpt,
      requirements: [],
      salary: job.minSalary || job.maxSalary ? {
        min: job.minSalary,
        max: job.maxSalary,
        currency: job.salaryCurrency || "USD",
        period: "yearly",
      } : undefined,
      visaSponsorship: this.detectVisaSponsorship(job.description || ""),
      relocationAssistance: (job.description || "").toLowerCase().includes("relocation"),
      eligibleCountries: [],
      skills: [...this.extractSkills(job.description || ""), ...job.tags.map((t) => t.toLowerCase())],
      seniority: this.mapSeniority(job.seniority),
      jobType: "Full-time",
      postedAt: new Date(job.pubDate),
      expiresAt: job.expiryDate ? new Date(job.expiryDate) : undefined,
      applicationUrl: job.applicationLink,
    };
  }

  private mapSeniority(seniority: string[]): "Junior" | "Mid-level" | "Senior" | "Lead" | "Executive" | null {
    const combined = seniority.join(" ").toLowerCase();
    if (combined.includes("senior") || combined.includes("sr")) return "Senior";
    if (combined.includes("lead") || combined.includes("principal")) return "Lead";
    if (combined.includes("junior") || combined.includes("entry")) return "Junior";
    if (combined.includes("mid")) return "Mid-level";
    return null;
  }
}
