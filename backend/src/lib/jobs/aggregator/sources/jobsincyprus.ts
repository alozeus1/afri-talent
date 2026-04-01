// ─────────────────────────────────────────────────────────────────────────────
// Remotive.com — Free RSS/JSON API, 100% remote jobs
// Very strong for global-remote positions open to African talent
// API: https://remotive.com/api/remote-jobs (free, no auth)
// ─────────────────────────────────────────────────────────────────────────────

import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  "job-count": number;
  jobs: RemotiveJob[];
}

export class RemotiveSource extends BaseJobSource {
  constructor() {
    super({
      source: "FLEXJOBS",
      name: "Remotive",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://remotive.com/api/remote-jobs",
      rateLimit: { requestsPerMinute: 5, requestsPerDay: 200 },
      enabled: true,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: false,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    await this.rateLimit();
    this.log("Fetching remote jobs");

    try {
      // Remotive supports category and search params
      const url = new URL(this.config.baseUrl);
      if (query.keywords.length > 0) {
        url.searchParams.set("search", query.keywords.slice(0, 3).join(" "));
      }
      url.searchParams.set("limit", String(Math.min(query.limit || 50, 100)));

      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "AfriTalent/1.0", Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as RemotiveResponse;

      const filtered: AggregatedJob[] = [];
      for (const job of data.jobs) {
        // Date filter
        if (query.postedWithinDays) {
          const postedDate = new Date(job.publication_date);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
          if (postedDate < cutoff) continue;
        }

        // Africa-friendly: only include if location is "Worldwide", "Anywhere", or mentions Africa
        const loc = job.candidate_required_location.toLowerCase();
        const isGlobal = loc.includes("worldwide") || loc.includes("anywhere") || loc.includes("global") || loc === "";
        const isAfricaFriendly = loc.includes("africa") || loc.includes("emea") || loc.includes("remote");

        if (!isGlobal && !isAfricaFriendly) continue;

        filtered.push(this.transformJob(job));
      }

      this.log("Fetched jobs", { total: data["job-count"], filtered: filtered.length });

      return {
        source: this.source,
        jobs: filtered.slice(0, query.limit || 50),
        totalFound: data["job-count"],
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logError("Failed to fetch jobs", error);
      return { source: this.source, jobs: [], totalFound: 0, fetchedAt: new Date(), errors: [String(error)] };
    }
  }

  private transformJob(job: RemotiveJob): AggregatedJob {
    const salary = this.parseSalary(job.salary);

    return {
      externalId: `remotive-${job.id}`,
      source: this.source,
      sourceUrl: job.url,
      title: job.title,
      company: job.company_name,
      companyLogo: job.company_logo,
      location: job.candidate_required_location || "Remote — Worldwide",
      locationType: "remote",
      country: "GLOBAL",
      region: "REMOTE_GLOBAL",
      description: job.description,
      requirements: [],
      salary,
      visaSponsorship: this.detectVisaSponsorship(job.description),
      relocationAssistance: job.description.toLowerCase().includes("relocation"),
      eligibleCountries: [],
      skills: [...this.extractSkills(job.description), ...job.tags.map((t) => t.toLowerCase())],
      seniority: this.detectSeniority(job.title, job.description),
      jobType: this.mapJobType(job.job_type),
      postedAt: new Date(job.publication_date),
      applicationUrl: job.url,
    };
  }

  private parseSalary(salaryStr: string): AggregatedJob["salary"] {
    if (!salaryStr) return undefined;
    // Remotive salary format varies: "$50,000 - $80,000", "€60k-90k", etc.
    const numbers = salaryStr.match(/[\d,]+/g);
    if (!numbers || numbers.length === 0) return undefined;

    const values = numbers.map((n) => parseInt(n.replace(/,/g, ""), 10));
    // Handle "k" notation
    if (salaryStr.toLowerCase().includes("k")) {
      return { min: values[0] * 1000, max: values[1] ? values[1] * 1000 : undefined, currency: salaryStr.includes("€") ? "EUR" : "USD", period: "yearly" };
    }
    return { min: values[0], max: values[1], currency: salaryStr.includes("€") ? "EUR" : "USD", period: "yearly" };
  }

  private mapJobType(type: string): "Full-time" | "Part-time" | "Contract" | "Freelance" | "Internship" {
    const t = type.toLowerCase();
    if (t.includes("part")) return "Part-time";
    if (t.includes("contract") || t.includes("freelance")) return "Contract";
    if (t.includes("intern")) return "Internship";
    return "Full-time";
  }
}
