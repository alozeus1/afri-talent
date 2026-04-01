// ─────────────────────────────────────────────────────────────────────────────
// Arbeitnow — Free public API, European jobs with visa sponsorship filter
// Key differentiator: has explicit visa_sponsorship field
// API: https://www.arbeitnow.com/api/job-board-api (free, no auth)
// ─────────────────────────────────────────────────────────────────────────────

import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number; // unix timestamp
  visa_sponsorship?: boolean;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
  links: { next?: string };
  meta: { current_page: number; last_page: number; total: number };
}

export class ArbeitnowSource extends BaseJobSource {
  constructor() {
    super({
      source: "STEPSTONE",
      name: "Arbeitnow",
      region: "EUROPE",
      baseUrl: "https://www.arbeitnow.com/api/job-board-api",
      rateLimit: { requestsPerMinute: 10, requestsPerDay: 500 },
      enabled: true,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    await this.rateLimit();
    this.log("Fetching visa-sponsored European jobs");

    const allJobs: AggregatedJob[] = [];
    let page = 1;
    const maxPages = 3;

    try {
      while (page <= maxPages) {
        await this.rateLimit();
        const url = `${this.config.baseUrl}?page=${page}`;

        const response = await fetch(url, {
          headers: { "User-Agent": "AfriTalent/1.0", Accept: "application/json" },
        });

        if (!response.ok) {
          this.logError(`HTTP ${response.status}`, response.statusText);
          break;
        }

        const data = (await response.json()) as ArbeitnowResponse;
        if (data.data.length === 0) break;

        for (const job of data.data) {
          const transformed = this.transformJob(job);

          // Only include remote OR visa-sponsored jobs (relevant to African candidates)
          if (!job.remote && !job.visa_sponsorship) continue;

          // Keyword filter
          if (query.keywords.length > 0) {
            const text = `${job.title} ${job.description} ${job.tags.join(" ")}`.toLowerCase();
            const matches = query.keywords.some((kw) => text.includes(kw.toLowerCase()));
            if (!matches) continue;
          }

          // Date filter
          if (query.postedWithinDays) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
            if (transformed.postedAt < cutoff) continue;
          }

          allJobs.push(transformed);
        }

        if (page >= data.meta.last_page) break;
        page++;
      }

      this.log("Fetched jobs", { total: allJobs.length, pages: page });

      return {
        source: this.source,
        jobs: allJobs.slice(0, query.limit || 50),
        totalFound: allJobs.length,
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logError("Failed to fetch jobs", error);
      return { source: this.source, jobs: [], totalFound: 0, fetchedAt: new Date(), errors: [String(error)] };
    }
  }

  private transformJob(job: ArbeitnowJob): AggregatedJob {
    const normalized = this.normalizeLocation(job.location);

    return {
      externalId: `arbeitnow-${job.slug}`,
      source: this.source,
      sourceUrl: job.url,
      title: job.title,
      company: job.company_name,
      location: job.remote ? `${job.location} (Remote)` : job.location,
      locationType: job.remote ? "remote" : normalized.locationType,
      country: normalized.country || "EU",
      region: "EUROPE",
      description: job.description,
      requirements: [],
      visaSponsorship: job.visa_sponsorship ? "YES" : this.detectVisaSponsorship(job.description),
      relocationAssistance: job.description.toLowerCase().includes("relocation"),
      eligibleCountries: [],
      skills: [...this.extractSkills(job.description), ...job.tags.map((t) => t.toLowerCase())],
      seniority: this.detectSeniority(job.title, job.description),
      jobType: this.mapJobType(job.job_types),
      postedAt: new Date(job.created_at * 1000),
      applicationUrl: job.url,
    };
  }

  private mapJobType(types: string[]): "Full-time" | "Part-time" | "Contract" | "Freelance" | "Internship" {
    const combined = types.join(" ").toLowerCase();
    if (combined.includes("part")) return "Part-time";
    if (combined.includes("contract") || combined.includes("freelance")) return "Contract";
    if (combined.includes("intern")) return "Internship";
    return "Full-time";
  }
}
