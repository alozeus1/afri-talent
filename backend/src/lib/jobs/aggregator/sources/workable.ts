import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface WorkableAccountConfig {
  account: string;
  token?: string;
}

interface WorkableJob {
  shortcode?: string;
  title: string;
  description?: string;
  code?: string;
  location?: { location_str?: string };
  employment_type?: string;
  account?: { subdomain?: string };
  url?: string;
  created_at?: string;
  updated_at?: string;
}

interface WorkableResponse {
  jobs: WorkableJob[];
}

export class WorkableSource extends BaseJobSource {
  constructor(private readonly accounts: WorkableAccountConfig[]) {
    super({
      source: "WORKABLE",
      name: "Workable",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://{account}.workable.com/spi/v3/jobs",
      rateLimit: { requestsPerMinute: 15, requestsPerDay: 1500 },
      enabled: accounts.length > 0,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    const jobs: AggregatedJob[] = [];
    const errors: string[] = [];

    for (const account of this.accounts.slice(0, 20)) {
      try {
        await this.rateLimit();
        const headers: Record<string, string> = {
          Accept: "application/json",
          "User-Agent": "AfriTalent/1.0",
        };

        if (account.token) {
          headers.Authorization = `Bearer ${account.token}`;
        }

        const response = await fetch(
          `https://${account.account}.workable.com/spi/v3/jobs?state=published&limit=100`,
          { headers },
        );

        if (!response.ok) {
          errors.push(`${account.account}: HTTP ${response.status}`);
          continue;
        }

        const payload = (await response.json()) as WorkableResponse;
        const transformed = payload.jobs
          .map((job) => this.transformJob(job, account.account))
          .filter((job) => this.matchesQuery(job, query));
        jobs.push(...transformed);
      } catch (error) {
        errors.push(`${account.account}: ${String(error)}`);
      }
    }

    return {
      source: this.source,
      jobs: jobs.slice(0, query.limit || 100),
      totalFound: jobs.length,
      fetchedAt: new Date(),
      errors: errors.length ? errors : undefined,
    };
  }

  private matchesQuery(job: AggregatedJob, query: JobQuery): boolean {
    if (query.postedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
      if (job.postedAt < cutoff) return false;
    }

    if (query.remote && job.locationType !== "remote") return false;

    if (query.keywords.length > 0) {
      const bag = `${job.title} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
      const match = query.keywords.some((keyword) => bag.includes(keyword.toLowerCase()));
      if (!match) return false;
    }

    return true;
  }

  private transformJob(job: WorkableJob, account: string): AggregatedJob {
    const description = (job.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const location = job.location?.location_str || "Remote";
    const normalized = this.normalizeLocation(location);
    const sourceUrl = job.url || `https://${account}.workable.com`;
    const employment = (job.employment_type || "FULL_TIME").toLowerCase();

    return {
      externalId: `workable-${account}-${job.shortcode || job.code || job.title}`,
      source: this.source,
      sourceUrl,
      title: job.title,
      company: account,
      location,
      locationType: normalized.locationType,
      country: normalized.country || "GLOBAL",
      region: normalized.locationType === "remote" ? "REMOTE_GLOBAL" : "OTHER",
      description,
      requirements: [],
      visaSponsorship: this.detectVisaSponsorship(description),
      relocationAssistance: /relocat/i.test(description),
      eligibleCountries: [],
      skills: this.extractSkills(description),
      seniority: this.detectSeniority(job.title, description),
      jobType: employment.includes("part")
        ? "Part-time"
        : employment.includes("contract")
          ? "Contract"
          : employment.includes("intern")
            ? "Internship"
            : "Full-time",
      postedAt: job.updated_at ? new Date(job.updated_at) : job.created_at ? new Date(job.created_at) : new Date(),
      applicationUrl: sourceUrl,
      rawData: { account, subdomain: job.account?.subdomain || null },
    };
  }
}
