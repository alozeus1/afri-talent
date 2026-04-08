import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult, JobRegion } from "../types.js";

type LocationType = "remote" | "hybrid" | "onsite";

interface ApifyTaskConfig {
  taskId: string;
  label?: string;
  defaultInput?: Record<string, unknown>;
  maxItems?: number;
  countryHint?: string;
  regionHint?: JobRegion;
  locationTypeHint?: LocationType;
  companyFallback?: string;
  overrideKeywordsField?: string;
  overrideLocationField?: string;
  overrideLimitField?: string;
}

type ApifyDatasetItem = Record<string, unknown>;

const TITLE_FIELDS = ["title", "jobTitle", "position", "positionName", "name"];
const COMPANY_FIELDS = ["company", "companyName", "employer", "employerName", "organization"];
const LOCATION_FIELDS = ["location", "jobLocation", "candidateRequiredLocation", "locationName"];
const DESCRIPTION_FIELDS = ["description", "descriptionText", "jobSummary", "summary", "snippet"];
const URL_FIELDS = ["url", "jobUrl", "applyUrl", "applicationUrl", "link", "vacancyUrl"];
const JOB_TYPE_FIELDS = ["jobType", "employmentType", "type", "commitment"];
const POSTED_AT_FIELDS = ["postedAt", "createdAt", "datePosted", "publicationDate", "publishedAt"];
const SKILL_FIELDS = ["skills", "tags", "technologies", "keywords"];
const SALARY_FIELDS = ["salary", "compensation", "salaryRange"];

export function parseApifyTaskConfigs(raw: string | undefined): ApifyTaskConfig[] {
  if (!raw?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): ApifyTaskConfig | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const candidate = item as Record<string, unknown>;
        const taskId = toNonEmptyString(candidate.taskId);
        if (!taskId) {
          return null;
        }

        return {
          taskId,
          label: toNonEmptyString(candidate.label) || undefined,
          defaultInput:
            candidate.defaultInput && typeof candidate.defaultInput === "object" && !Array.isArray(candidate.defaultInput)
              ? { ...(candidate.defaultInput as Record<string, unknown>) }
              : undefined,
          maxItems: toPositiveNumber(candidate.maxItems) ?? undefined,
          countryHint: toNonEmptyString(candidate.countryHint) || undefined,
          regionHint: toRegion(candidate.regionHint) ?? undefined,
          locationTypeHint: toLocationType(candidate.locationTypeHint) ?? undefined,
          companyFallback: toNonEmptyString(candidate.companyFallback) || undefined,
          overrideKeywordsField: toNonEmptyString(candidate.overrideKeywordsField) || undefined,
          overrideLocationField: toNonEmptyString(candidate.overrideLocationField) || undefined,
          overrideLimitField: toNonEmptyString(candidate.overrideLimitField) || undefined,
        };
      })
      .filter((item): item is ApifyTaskConfig => item !== null);
  } catch {
    return [];
  }
}

export class ApifySource extends BaseJobSource {
  constructor(
    private readonly token: string,
    private readonly taskConfigs: ApifyTaskConfig[],
  ) {
    super({
      source: "APIFY",
      name: "Apify Jobs",
      region: "REMOTE_GLOBAL",
      baseUrl: "https://api.apify.com/v2/actor-tasks",
      apiKey: token,
      rateLimit: { requestsPerMinute: 6, requestsPerDay: 1000 },
      enabled: token.trim().length > 0 && taskConfigs.length > 0,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    const jobs: AggregatedJob[] = [];
    const errors: string[] = [];

    for (const task of this.taskConfigs.slice(0, 10)) {
      try {
        await this.rateLimit();
        const payload = await this.runTask(task, query);
        const transformed = payload
          .map((item) => this.transformJob(item, task))
          .filter((job): job is AggregatedJob => job !== null)
          .filter((job) => this.matchesQuery(job, query));

        jobs.push(...transformed);
      } catch (error) {
        errors.push(`${task.label || task.taskId}: ${String(error)}`);
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

  private async runTask(task: ApifyTaskConfig, query: JobQuery): Promise<ApifyDatasetItem[]> {
    const url = new URL(
      `${this.config.baseUrl}/${encodeURIComponent(task.taskId)}/run-sync-get-dataset-items`,
    );
    url.searchParams.set("token", this.token);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "true");

    const input: Record<string, unknown> = {
      ...(task.defaultInput || {}),
    };

    if (task.overrideKeywordsField && query.keywords.length > 0) {
      input[task.overrideKeywordsField] = query.keywords.join(", ");
    }
    if (task.overrideLocationField && query.location) {
      input[task.overrideLocationField] = query.location;
    }
    if (task.overrideLimitField) {
      input[task.overrideLimitField] = Math.min(task.maxItems || query.limit || 50, query.limit || task.maxItems || 50);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "AfriTalent/1.0",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}${details ? ` ${details.slice(0, 200)}` : ""}`);
    }

    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? (payload as ApifyDatasetItem[]) : [];
  }

  private transformJob(item: ApifyDatasetItem, task: ApifyTaskConfig): AggregatedJob | null {
    const title = firstNonEmptyString(item, TITLE_FIELDS);
    const sourceUrl = firstNonEmptyString(item, URL_FIELDS);
    if (!title || !sourceUrl) {
      return null;
    }

    const description = firstNonEmptyString(item, DESCRIPTION_FIELDS) || title;
    const locationValue = readLocation(item, task);
    const locationType = detectLocationType(item, locationValue, task.locationTypeHint);
    const jobTypeValue = firstNonEmptyString(item, JOB_TYPE_FIELDS);
    const salary = readSalary(item);
    const company = readCompany(item) || task.companyFallback || task.label || "External board";
    const postedAt = readDate(item, POSTED_AT_FIELDS) || new Date();
    const skills = readSkills(item);
    const country = readCountry(item, locationValue, task.countryHint);
    const region = task.regionHint || inferRegion(country, locationType);

    return {
      externalId: buildExternalId(item, task, sourceUrl),
      source: this.source,
      sourceUrl,
      title,
      company,
      location: locationValue,
      locationType,
      country,
      region,
      description,
      requirements: [],
      salary,
      visaSponsorship: readVisaSponsorship(item, description, this.detectVisaSponsorship.bind(this)),
      relocationAssistance: readRelocation(item, description),
      eligibleCountries: [],
      skills: skills.length > 0 ? skills : this.extractSkills(description),
      seniority: this.detectSeniority(title, description),
      jobType: normalizeJobType(jobTypeValue),
      postedAt,
      applicationUrl: firstNonEmptyString(item, ["applicationUrl", "applyUrl", "url"]) || sourceUrl,
      rawData: item,
    };
  }

  private matchesQuery(job: AggregatedJob, query: JobQuery): boolean {
    if (query.postedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
      if (job.postedAt < cutoff) return false;
    }

    if (query.remote && job.locationType !== "remote") return false;

    if (query.location) {
      const bag = `${job.location} ${job.country}`.toLowerCase();
      if (!bag.includes(query.location.toLowerCase())) return false;
    }

    if (query.keywords.length > 0) {
      const bag = `${job.title} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
      const match = query.keywords.some((keyword) => bag.includes(keyword.toLowerCase()));
      if (!match) return false;
    }

    return true;
  }
}

function firstNonEmptyString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = toNonEmptyString(item[key]);
    if (direct) return direct;

    const nested = item[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const nestedKey of ["name", "value", "text", "label"]) {
        const candidate = toNonEmptyString((nested as Record<string, unknown>)[nestedKey]);
        if (candidate) return candidate;
      }
    }
  }

  return null;
}

function readCompany(item: Record<string, unknown>): string | null {
  const direct = firstNonEmptyString(item, COMPANY_FIELDS);
  if (direct) return direct;

  const nestedKeys = ["company", "employer", "organization"];
  for (const key of nestedKeys) {
    const value = item[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const company = firstNonEmptyString(value as Record<string, unknown>, ["name", "title", "displayName"]);
      if (company) return company;
    }
  }

  return null;
}

function readLocation(item: Record<string, unknown>, task: ApifyTaskConfig): string {
  const direct = firstNonEmptyString(item, LOCATION_FIELDS);
  if (direct) return direct;
  if (task.locationTypeHint === "remote") return "Remote";
  return task.countryHint || "Remote";
}

function readCountry(item: Record<string, unknown>, location: string, fallback?: string): string {
  const country = firstNonEmptyString(item, ["country", "countryCode", "country_name"]);
  if (country) return normalizeCountry(country);
  if (/nigeria/i.test(location)) return "NG";
  if (/kenya/i.test(location)) return "KE";
  if (/ghana/i.test(location)) return "GH";
  if (/south africa/i.test(location)) return "ZA";
  if (/remote|global|worldwide|anywhere/i.test(location)) return "GLOBAL";
  return normalizeCountry(fallback || "GLOBAL");
}

function detectLocationType(
  item: Record<string, unknown>,
  location: string,
  fallback?: LocationType,
): LocationType {
  const explicit = firstNonEmptyString(item, ["locationType", "workplaceType", "workType"]);
  const candidate = (explicit || "").toLowerCase();
  if (candidate.includes("remote")) return "remote";
  if (candidate.includes("hybrid")) return "hybrid";
  if (candidate.includes("site") || candidate.includes("office")) return "onsite";

  if (typeof item.remote === "boolean") {
    return item.remote ? "remote" : "onsite";
  }

  if (/remote|worldwide|anywhere|global/i.test(location)) return "remote";
  if (/hybrid/i.test(location)) return "hybrid";
  return fallback || "onsite";
}

function readSalary(item: Record<string, unknown>): AggregatedJob["salary"] | undefined {
  for (const key of SALARY_FIELDS) {
    const value = item[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const salaryObject = value as Record<string, unknown>;
      const min = toPositiveNumber(salaryObject.min ?? salaryObject.minimum ?? salaryObject.from);
      const max = toPositiveNumber(salaryObject.max ?? salaryObject.maximum ?? salaryObject.to);
      const currency = toNonEmptyString(
        salaryObject.currency ?? salaryObject.currencyCode ?? salaryObject.unit,
      );
      const periodText = toNonEmptyString(salaryObject.period ?? salaryObject.interval) || "";

      if (min || max) {
        return {
          min: min || undefined,
          max: max || undefined,
          currency: currency || "USD",
          period: periodText.toLowerCase().includes("hour")
            ? "hourly"
            : periodText.toLowerCase().includes("month")
              ? "monthly"
              : "yearly",
        };
      }
    }
  }

  const min = toPositiveNumber(item.salaryMin ?? item.minSalary);
  const max = toPositiveNumber(item.salaryMax ?? item.maxSalary);
  if (!min && !max) {
    return undefined;
  }

  return {
    min: min || undefined,
    max: max || undefined,
    currency: toNonEmptyString(item.currency) || "USD",
    period: "yearly",
  };
}

function readSkills(item: Record<string, unknown>): string[] {
  for (const key of SKILL_FIELDS) {
    const value = item[key];
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === "string") return entry.trim().toLowerCase();
          if (entry && typeof entry === "object") {
            return (
              toNonEmptyString((entry as Record<string, unknown>).name)
              || toNonEmptyString((entry as Record<string, unknown>).label)
              || ""
            ).trim().toLowerCase();
          }
          return "";
        })
        .filter(Boolean);
    }
  }

  return [];
}

function readDate(item: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const timestamp = value < 10_000_000_000 ? value * 1000 : value;
      const date = new Date(timestamp);
      if (!Number.isNaN(date.getTime())) return date;
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      const timestamp = Number.isFinite(numeric)
        ? numeric < 10_000_000_000
          ? numeric * 1000
          : numeric
        : null;
      const date = timestamp !== null ? new Date(timestamp) : new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

function readVisaSponsorship(
  item: Record<string, unknown>,
  description: string,
  detect: (text: string) => AggregatedJob["visaSponsorship"],
): AggregatedJob["visaSponsorship"] {
  const explicit = item.visaSponsorship ?? item.sponsorshipAvailable ?? item.offersVisaSponsorship;
  if (typeof explicit === "boolean") {
    return explicit ? "YES" : "NO";
  }
  const text = toNonEmptyString(explicit);
  if (text) {
    const normalized = text.toLowerCase();
    if (["yes", "true", "available"].includes(normalized)) return "YES";
    if (["no", "false", "unavailable"].includes(normalized)) return "NO";
  }
  return detect(description);
}

function readRelocation(item: Record<string, unknown>, description: string): boolean {
  const explicit = item.relocationAssistance ?? item.relocationSupport ?? item.offersRelocation;
  if (typeof explicit === "boolean") {
    return explicit;
  }
  return /relocat/i.test(description);
}

function normalizeJobType(value: string | null): AggregatedJob["jobType"] {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("part")) return "Part-time";
  if (normalized.includes("freelance")) return "Freelance";
  if (normalized.includes("contract")) return "Contract";
  if (normalized.includes("intern")) return "Internship";
  return "Full-time";
}

function inferRegion(country: string, locationType: LocationType): JobRegion {
  if (locationType === "remote" || country === "GLOBAL") return "REMOTE_GLOBAL";
  if (["NG", "KE", "GH", "ZA", "EG", "RW", "TZ", "UG"].includes(country)) return "AFRICA";
  if (["US", "CA"].includes(country)) return "NORTH_AMERICA";
  if (["GB", "DE", "FR", "NL", "PT", "ES", "IT", "IE"].includes(country)) return "EUROPE";
  return "OTHER";
}

function buildExternalId(item: Record<string, unknown>, task: ApifyTaskConfig, sourceUrl: string): string {
  const upstreamId = firstNonEmptyString(item, ["id", "jobId", "uuid", "slug"]);
  return `apify-${task.taskId}-${upstreamId || Buffer.from(sourceUrl).toString("base64").slice(0, 16)}`;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(normalized) && normalized > 0) {
      return normalized;
    }
  }
  return null;
}

function toRegion(value: unknown): JobRegion | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ["AFRICA", "EUROPE", "NORTH_AMERICA", "REMOTE_GLOBAL", "OTHER"].includes(normalized)
    ? (normalized as JobRegion)
    : null;
}

function toLocationType(value: unknown): LocationType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ["remote", "hybrid", "onsite"].includes(normalized) ? (normalized as LocationType) : null;
}

function normalizeCountry(value: string): string {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    nigeria: "NG",
    kenya: "KE",
    ghana: "GH",
    "south africa": "ZA",
    egypt: "EG",
    "united states": "US",
    usa: "US",
    canada: "CA",
    "united kingdom": "GB",
    uk: "GB",
    germany: "DE",
    france: "FR",
    netherlands: "NL",
    portugal: "PT",
    ireland: "IE",
    global: "GLOBAL",
    remote: "GLOBAL",
  };

  return aliases[normalized] || value.trim().toUpperCase();
}
