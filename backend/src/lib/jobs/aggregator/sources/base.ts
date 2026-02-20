// ─────────────────────────────────────────────────────────────────────────────
// Base Job Source Adapter - Abstract class for all job board integrations
// ─────────────────────────────────────────────────────────────────────────────

import type { AggregatedJob, AggregatorResult, JobSource, JobSourceConfig } from "../types.js";
import logger from "../../../logger.js";

export abstract class BaseJobSource {
  protected config: JobSourceConfig;
  protected requestCount = 0;
  protected lastRequestTime = 0;

  constructor(config: JobSourceConfig) {
    this.config = config;
  }

  get source(): JobSource {
    return this.config.source;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  abstract fetchJobs(query: JobQuery): Promise<AggregatorResult>;

  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const minInterval = 60000 / this.config.rateLimit.requestsPerMinute;
    const elapsed = now - this.lastRequestTime;

    if (elapsed < minInterval) {
      const waitTime = minInterval - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  protected log(message: string, meta?: Record<string, unknown>): void {
    logger.info({ source: this.config.source, ...meta }, `[aggregator:${this.config.source}] ${message}`);
  }

  protected logError(message: string, error: unknown): void {
    logger.error({ source: this.config.source, error: String(error) }, `[aggregator:${this.config.source}] ${message}`);
  }

  protected normalizeLocation(location: string): { city: string; country: string; locationType: "remote" | "hybrid" | "onsite" } {
    const lower = location.toLowerCase();

    if (lower.includes("remote") || lower.includes("work from home") || lower.includes("anywhere")) {
      return { city: "Remote", country: "GLOBAL", locationType: "remote" };
    }

    if (lower.includes("hybrid")) {
      return { city: location.replace(/hybrid/i, "").trim(), country: "", locationType: "hybrid" };
    }

    return { city: location, country: "", locationType: "onsite" };
  }

  protected extractSkills(text: string): string[] {
    const skillPatterns = [
      // Programming languages
      /\b(javascript|typescript|python|java|c\+\+|c#|ruby|go|golang|rust|php|swift|kotlin|scala)\b/gi,
      // Frameworks
      /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails|laravel|nextjs|next\.js)\b/gi,
      // Databases
      /\b(postgresql|mysql|mongodb|redis|elasticsearch|dynamodb|cassandra|oracle)\b/gi,
      // Cloud
      /\b(aws|azure|gcp|google cloud|kubernetes|k8s|docker|terraform|ansible)\b/gi,
      // Tools
      /\b(git|jenkins|circleci|github actions|jira|figma|sketch|adobe xd)\b/gi,
    ];

    const skills = new Set<string>();
    for (const pattern of skillPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((m) => skills.add(m.toLowerCase()));
      }
    }

    return Array.from(skills);
  }

  protected detectVisaSponsorship(text: string): "YES" | "NO" | "UNKNOWN" {
    const lower = text.toLowerCase();

    const positivePatterns = [
      "visa sponsorship available",
      "visa sponsorship provided",
      "will sponsor visa",
      "sponsor your visa",
      "sponsorship available",
      "we sponsor visas",
      "visa support"
    ];

    const negativePatterns = [
      "no visa sponsorship",
      "not sponsor visa",
      "cannot sponsor",
      "will not sponsor",
      "must be authorized",
      "must have work authorization",
      "no sponsorship"
    ];

    for (const pattern of positivePatterns) {
      if (lower.includes(pattern)) return "YES";
    }

    for (const pattern of negativePatterns) {
      if (lower.includes(pattern)) return "NO";
    }

    return "UNKNOWN";
  }

  protected detectSeniority(title: string, description: string): "Junior" | "Mid-level" | "Senior" | "Lead" | "Executive" | null {
    const text = `${title} ${description}`.toLowerCase();

    if (text.includes("executive") || text.includes("director") || text.includes("vp ") || text.includes("chief")) {
      return "Executive";
    }
    if (text.includes("lead") || text.includes("principal") || text.includes("staff")) {
      return "Lead";
    }
    if (text.includes("senior") || text.includes("sr.") || text.includes("sr ")) {
      return "Senior";
    }
    if (text.includes("junior") || text.includes("jr.") || text.includes("jr ") || text.includes("entry")) {
      return "Junior";
    }
    if (text.includes("mid") || text.includes("intermediate")) {
      return "Mid-level";
    }

    return null;
  }
}

export interface JobQuery {
  keywords: string[];
  location?: string;
  remote?: boolean;
  visaSponsorship?: boolean;
  postedWithinDays?: number;
  limit?: number;
  cursor?: string;
}
