import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface GreenhouseJob {
  id: number;
  title: string;
  content?: string;
  updated_at: string;
  absolute_url: string;
  location?: { name?: string };
  metadata?: Array<{ name: string; value: string }>;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[];
}

export class GreenhouseSource extends BaseJobSource {
  constructor(private readonly boardTokens: string[]) {
    super({
      source: "GREENHOUSE",
      name: "Greenhouse",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://boards-api.greenhouse.io/v1/boards",
      rateLimit: { requestsPerMinute: 20, requestsPerDay: 2000 },
      enabled: boardTokens.length > 0,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    const jobs: AggregatedJob[] = [];
    const errors: string[] = [];

    for (const boardToken of this.boardTokens.slice(0, 20)) {
      try {
        await this.rateLimit();
        const response = await fetch(
          `${this.config.baseUrl}/${encodeURIComponent(boardToken)}/jobs?content=true`,
          {
            headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0" },
          },
        );

        if (!response.ok) {
          errors.push(`${boardToken}: HTTP ${response.status}`);
          continue;
        }

        const payload = (await response.json()) as GreenhouseBoardResponse;
        const transformed = payload.jobs
          .map((job) => this.transformJob(job, boardToken))
          .filter((job) => this.matchesQuery(job, query));

        jobs.push(...transformed);
      } catch (error) {
        errors.push(`${boardToken}: ${String(error)}`);
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

  private transformJob(job: GreenhouseJob, boardToken: string): AggregatedJob {
    const description = (job.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const location = job.location?.name || "Remote";
    const normalized = this.normalizeLocation(location);

    const employmentMeta = job.metadata?.find((item) => /employment|type/i.test(item.name));
    const commitment = (employmentMeta?.value || "").toLowerCase();

    return {
      externalId: `greenhouse-${boardToken}-${job.id}`,
      source: this.source,
      sourceUrl: job.absolute_url,
      title: job.title,
      company: boardToken,
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
      jobType: commitment.includes("part")
        ? "Part-time"
        : commitment.includes("contract")
          ? "Contract"
          : commitment.includes("intern")
            ? "Internship"
            : "Full-time",
      postedAt: new Date(job.updated_at),
      applicationUrl: job.absolute_url,
      rawData: { boardToken },
    };
  }
}
