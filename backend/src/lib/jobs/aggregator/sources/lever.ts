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
        const startedAt = Date.now();
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
        const normalizedJobs = payload.map((job) => this.transformJob(job, siteToken));
        const matchedJobs = normalizedJobs.filter((job) => this.matchesQuery(job, query));
        const filterStats = this.buildFilterStats(normalizedJobs, query);

        this.log("Site fetch complete", {
          siteToken,
          upstreamCount: payload.length,
          normalizedCount: normalizedJobs.length,
          matchedCount: matchedJobs.length,
          staleFiltered: filterStats.staleFiltered,
          remoteFiltered: filterStats.remoteFiltered,
          keywordFiltered: filterStats.keywordFiltered,
          sampleTitles: matchedJobs.slice(0, 3).map((job) => job.title),
          durationMs: Date.now() - startedAt,
        });

        jobs.push(...matchedJobs);
      } catch (error) {
        errors.push(`${siteToken}: ${String(error)}`);
        this.logError(`Failed to fetch site ${siteToken}`, error);
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

    if (!this.matchesKeywordQuery(job, query)) return false;

    return true;
  }

  private buildFilterStats(jobs: AggregatedJob[], query: JobQuery) {
    let staleFiltered = 0;
    let remoteFiltered = 0;
    let keywordFiltered = 0;

    for (const job of jobs) {
      if (query.postedWithinDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
        if (job.postedAt < cutoff) {
          staleFiltered++;
          continue;
        }
      }

      if (query.remote && job.locationType !== "remote") {
        remoteFiltered++;
        continue;
      }

      if (!this.matchesKeywordQuery(job, query)) {
        keywordFiltered++;
      }
    }

    return {
      staleFiltered,
      remoteFiltered,
      keywordFiltered,
    };
  }

  private transformJob(job: LeverJob, siteToken: string): AggregatedJob {
    const description = this.normalizeDescription(job.descriptionPlain || job.description || "");

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
