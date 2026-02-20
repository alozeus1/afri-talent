// ─────────────────────────────────────────────────────────────────────────────
// WeWorkRemotely Job Source - RSS feed for remote jobs
// ─────────────────────────────────────────────────────────────────────────────

import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult, JobSourceConfig } from "../types.js";
import { parseStringPromise } from "xml2js";

interface WWRItem {
  title: string[];
  link: string[];
  description: string[];
  pubDate: string[];
  guid: string[];
}

export class WeWorkRemotelySource extends BaseJobSource {
  constructor() {
    super({
      source: "WEWORKREMOTELY",
      name: "We Work Remotely",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
      rateLimit: { requestsPerMinute: 5, requestsPerDay: 500 },
      enabled: true,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: false,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    await this.rateLimit();
    this.log("Fetching jobs from RSS");

    try {
      const categories = [
        "remote-programming-jobs",
        "remote-devops-sysadmin-jobs",
        "remote-design-jobs",
        "remote-product-jobs",
        "remote-customer-support-jobs",
      ];

      const allJobs: AggregatedJob[] = [];

      for (const category of categories) {
        const url = `https://weworkremotely.com/categories/${category}.rss`;
        const jobs = await this.fetchCategory(url, query);
        allJobs.push(...jobs);
      }

      const filtered = this.filterJobs(allJobs, query);
      this.log("Fetched jobs", { total: allJobs.length, filtered: filtered.length });

      return {
        source: this.source,
        jobs: filtered,
        totalFound: allJobs.length,
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

  private async fetchCategory(url: string, _query: JobQuery): Promise<AggregatedJob[]> {
    const response = await fetch(url, {
      headers: { "User-Agent": "AfriTalent/1.0" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const xml = await response.text();
    const parsed = await parseStringPromise(xml);
    const items: WWRItem[] = parsed?.rss?.channel?.[0]?.item || [];

    return items.map((item) => this.transformItem(item));
  }

  private filterJobs(jobs: AggregatedJob[], query: JobQuery): AggregatedJob[] {
    return jobs.filter((job) => {
      if (query.keywords.length > 0) {
        const text = `${job.title} ${job.description}`.toLowerCase();
        const matches = query.keywords.some((kw) => text.includes(kw.toLowerCase()));
        if (!matches) return false;
      }

      if (query.postedWithinDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
        if (job.postedAt < cutoff) return false;
      }

      return true;
    }).slice(0, query.limit || 50);
  }

  private transformItem(item: WWRItem): AggregatedJob {
    const title = item.title[0] || "";
    const description = item.description[0] || "";
    const link = item.link[0] || "";
    const pubDate = item.pubDate[0] || "";

    // Parse company from title (format: "Company: Job Title")
    const titleParts = title.split(":");
    const company = titleParts.length > 1 ? titleParts[0].trim() : "Unknown";
    const jobTitle = titleParts.length > 1 ? titleParts.slice(1).join(":").trim() : title;

    return {
      externalId: item.guid[0] || link,
      source: this.source,
      sourceUrl: link,
      title: jobTitle,
      company,
      location: "Remote",
      locationType: "remote",
      country: "GLOBAL",
      region: "REMOTE_GLOBAL",
      description: this.stripHtml(description),
      requirements: [],
      visaSponsorship: this.detectVisaSponsorship(description),
      relocationAssistance: false,
      eligibleCountries: [],
      skills: this.extractSkills(description),
      seniority: this.detectSeniority(jobTitle, description),
      jobType: "Full-time",
      postedAt: new Date(pubDate),
      applicationUrl: link,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const weWorkRemotelyConfig: JobSourceConfig = {
  source: "WEWORKREMOTELY",
  name: "We Work Remotely",
  region: "REMOTE_GLOBAL",
  baseUrl: "https://weworkremotely.com",
  rateLimit: { requestsPerMinute: 5, requestsPerDay: 500 },
  enabled: true,
  supportsAfricanCandidates: true,
  visaSponsorshipCommon: false,
};
