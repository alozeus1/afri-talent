import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface LeverJob {
  id: string;
  text: string;
  description?: string;
  descriptionPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    commitment?: string;
  };
}

export class LeverSource extends BaseJobSource {
  constructor(private readonly siteTokens: string[]) {
    super({
      source: "LEVER",
      name: "Lever",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://api.lever.co/v0/postings",
      rateLimit: { requestsPerMinute: 20, requestsPerDay: 2000 },
      enabled: siteTokens.length > 0,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    const jobs: AggregatedJob[] = [];
    const errors: string[] = [];

    for (const siteToken of this.siteTokens.slice(0, 20)) {
      try {
        await this.rateLimit();
        const response = await fetch(
          `${this.config.baseUrl}/${encodeURIComponent(siteToken)}?mode=json`,
          {
            headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0" },
          },
        );

        if (!response.ok) {
          errors.push(`${siteToken}: HTTP ${response.status}`);
          continue;
        }

        const payload = (await response.json()) as LeverJob[];
        const transformed = payload
          .map((job) => this.transformJob(job, siteToken))
          .filter((job) => this.matchesQuery(job, query));
        jobs.push(...transformed);
      } catch (error) {
        errors.push(`${siteToken}: ${String(error)}`);
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

  private transformJob(job: LeverJob, siteToken: string): AggregatedJob {
    const description = (job.descriptionPlain || job.description || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const location = job.categories?.location || "Remote";
    const normalized = this.normalizeLocation(location);
    const commitment = (job.categories?.commitment || "").toLowerCase();
    const sourceUrl = job.hostedUrl || job.applyUrl || `${this.config.baseUrl}/${siteToken}`;

    return {
      externalId: `lever-${siteToken}-${job.id}`,
      source: this.source,
      sourceUrl,
      title: job.text,
      company: siteToken,
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
      seniority: this.detectSeniority(job.text, description),
      jobType: commitment.includes("part")
        ? "Part-time"
        : commitment.includes("contract")
          ? "Contract"
          : commitment.includes("intern")
            ? "Internship"
            : "Full-time",
      postedAt: job.createdAt ? new Date(job.createdAt) : new Date(),
      applicationUrl: sourceUrl,
      rawData: { siteToken },
    };
  }
}
