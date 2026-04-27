import { BaseJobSource, type JobQuery } from "./base.js";
import type { AggregatedJob, AggregatorResult } from "../types.js";
import * as cheerio from "cheerio";

export type CompanyCareerProvider = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS" | "RECRUITEE" | "GENERIC";

export interface CompanyCareerSourceConfig {
  id?: string;
  provider: CompanyCareerProvider;
  companyName: string;
  providerKey: string;
  careersUrl: string;
  targetFields?: string[];
  enabled?: boolean;
}

interface AshbyJob {
  id?: string;
  title?: string;
  name?: string;
  department?: string;
  team?: string;
  location?: string | { name?: string };
  employmentType?: string;
  workplaceType?: string;
  isListed?: boolean;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  description?: string;
  compensation?: unknown;
}

interface SmartRecruitersJob {
  id?: string;
  uuid?: string;
  name?: string;
  title?: string;
  releasedDate?: string;
  updatedDate?: string;
  ref?: string;
  applyUrl?: string;
  postingUrl?: string;
  location?: { city?: string; region?: string; country?: string; fullLocation?: string };
  department?: { label?: string; name?: string };
  function?: { label?: string; name?: string };
  typeOfEmployment?: { label?: string; name?: string };
  jobAd?: { sections?: Record<string, { text?: string }> };
}

interface RecruiteeJob {
  id?: number | string;
  title?: string;
  description?: string;
  careers_url?: string;
  apply_url?: string;
  created_at?: string;
  updated_at?: string;
  employment_type?: string;
  department?: string;
  location?: string | { name?: string; city?: string; country?: string };
  status?: string;
}

function parseJsonArray(value: string | undefined): unknown[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isCompanyCareerProvider(value: string): value is CompanyCareerProvider {
  return ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "RECRUITEE", "GENERIC"].includes(value);
}

function normalizeCompanyConfig(value: unknown): CompanyCareerSourceConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const provider = String(record.provider ?? "").toUpperCase();
  const providerKey = String(record.providerKey ?? record.token ?? record.slug ?? record.companyId ?? "").trim();
  const companyName = String(record.companyName ?? record.name ?? providerKey).trim();
  const careersUrl = String(record.careersUrl ?? record.url ?? "").trim();
  if (!isCompanyCareerProvider(provider) || !providerKey || !companyName) return null;

  return {
    provider,
    providerKey,
    companyName,
    careersUrl: careersUrl || fallbackCareersUrl(provider, providerKey),
    targetFields: Array.isArray(record.targetFields)
      ? record.targetFields.map((field) => String(field)).filter(Boolean)
      : [],
    enabled: record.enabled !== false,
  };
}

function fallbackCareersUrl(provider: CompanyCareerProvider, providerKey: string): string {
  switch (provider) {
    case "GREENHOUSE":
      return `https://boards.greenhouse.io/${providerKey}`;
    case "LEVER":
      return `https://jobs.lever.co/${providerKey}`;
    case "ASHBY":
      return `https://jobs.ashbyhq.com/${providerKey}`;
    case "SMARTRECRUITERS":
      return `https://jobs.smartrecruiters.com/${providerKey}`;
    case "RECRUITEE":
      return `https://${providerKey}.recruitee.com`;
    case "GENERIC":
      return providerKey.startsWith("http") ? providerKey : `https://${providerKey}`;
  }
}

export function parseCompanyCareerSourceConfigs(
  raw: string | undefined,
  defaults: readonly CompanyCareerSourceConfig[] = [],
): CompanyCareerSourceConfig[] {
  const configured = parseJsonArray(raw)
    .map(normalizeCompanyConfig)
    .filter((item): item is CompanyCareerSourceConfig => Boolean(item));

  const byKey = new Map<string, CompanyCareerSourceConfig>();
  for (const source of [...defaults, ...configured]) {
    if (source.enabled === false) continue;
    byKey.set(`${source.provider}:${source.providerKey}`, source);
  }
  return Array.from(byKey.values());
}

export class CompanyCareerApiSource extends BaseJobSource {
  constructor(private readonly companies: CompanyCareerSourceConfig[]) {
    super({
      source: "COMPANY_API",
      name: "Company Career APIs",
      region: "REMOTE_GLOBAL",
      baseUrl: "company-career-api",
      rateLimit: { requestsPerMinute: 20, requestsPerDay: 3000 },
      enabled: companies.length > 0,
      supportsAfricanCandidates: true,
      visaSponsorshipCommon: true,
    });
  }

  async fetchJobs(query: JobQuery): Promise<AggregatorResult> {
    const jobs: AggregatedJob[] = [];
    const errors: string[] = [];

    for (const company of this.companies.slice(0, 80)) {
      try {
        await this.rateLimit();
        const fetched = await this.fetchCompany(company);
        const matched = fetched.filter((job) => this.matchesQuery(job, query, company));
        jobs.push(...matched);
      } catch (error) {
        errors.push(`${company.provider}:${company.providerKey}: ${String(error)}`);
        this.logError(`Failed to fetch ${company.companyName}`, error);
      }
    }

    return {
      source: this.source,
      jobs: jobs.slice(0, query.limit || 300),
      totalFound: jobs.length,
      fetchedAt: new Date(),
      errors: errors.length ? errors : undefined,
    };
  }

  private async fetchCompany(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    switch (company.provider) {
      case "GREENHOUSE":
        return this.fetchGreenhouse(company);
      case "LEVER":
        return this.fetchLever(company);
      case "ASHBY":
        return this.fetchAshby(company);
      case "SMARTRECRUITERS":
        return this.fetchSmartRecruiters(company);
      case "RECRUITEE":
        return this.fetchRecruitee(company);
      case "GENERIC":
        return this.fetchGenericCareerPage(company);
    }
  }

  private matchesQuery(job: AggregatedJob, query: JobQuery, company: CompanyCareerSourceConfig): boolean {
    if (query.postedWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - query.postedWithinDays);
      if (job.postedAt < cutoff) return false;
    }

    if (query.remote && job.locationType !== "remote") return false;
    if (query.relocationAssistance && !job.relocationAssistance) return false;
    if (query.visaSponsorship && job.visaSponsorship !== "YES") return false;
    if (query.fields?.length && job.jobField && !query.fields.includes(job.jobField)) return false;
    if (query.workplaceTypes?.length && job.workplaceType && !query.workplaceTypes.includes(job.workplaceType)) return false;

    const targetFields = company.targetFields ?? [];
    if (targetFields.length > 0 && job.jobField && !targetFields.includes(job.jobField)) return false;

    if (query.includeAllCompanyJobs) {
      return true;
    }

    return this.matchesKeywordQuery(job, query);
  }

  private async fetchGreenhouse(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.providerKey)}/jobs?content=true`, {
      headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { jobs?: Array<Record<string, unknown>> };
    return (payload.jobs ?? []).map((job) => this.transformGeneric(job, company, {
      id: String(job.id ?? ""),
      title: String(job.title ?? ""),
      description: String(job.content ?? ""),
      location: typeof job.location === "object" && job.location
        ? String((job.location as Record<string, unknown>).name ?? "Remote")
        : "Remote",
      url: String(job.absolute_url ?? fallbackCareersUrl(company.provider, company.providerKey)),
      postedAt: String(job.updated_at ?? new Date().toISOString()),
      department: Array.isArray(job.departments)
        ? String(((job.departments[0] as Record<string, unknown> | undefined)?.name) ?? "")
        : "",
    }));
  }

  private async fetchLever(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(company.providerKey)}?mode=json`, {
      headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as Array<Record<string, unknown>>;
    return payload.map((job) => {
      const categories = (job.categories ?? {}) as Record<string, unknown>;
      return this.transformGeneric(job, company, {
        id: String(job.id ?? ""),
        title: String(job.text ?? ""),
        description: String(job.descriptionPlain ?? job.description ?? ""),
        location: String(categories.location ?? "Remote"),
        url: String(job.hostedUrl ?? job.applyUrl ?? fallbackCareersUrl(company.provider, company.providerKey)),
        postedAt: job.createdAt ? new Date(Number(job.createdAt)).toISOString() : new Date().toISOString(),
        employmentType: String(categories.commitment ?? ""),
        department: String(categories.team ?? ""),
      });
    });
  }

  private async fetchAshby(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.providerKey)}`, {
      headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { jobs?: AshbyJob[] };
    return (payload.jobs ?? [])
      .filter((job) => job.isListed !== false)
      .map((job) => this.transformGeneric(job as unknown as Record<string, unknown>, company, {
        id: String(job.id ?? job.jobUrl ?? job.title ?? ""),
        title: String(job.title ?? job.name ?? ""),
        description: String(job.descriptionPlain ?? job.descriptionHtml ?? job.description ?? ""),
        location: typeof job.location === "object" && job.location
          ? String(job.location.name ?? "Remote")
          : String(job.location ?? "Remote"),
        url: String(job.jobUrl ?? job.applyUrl ?? fallbackCareersUrl(company.provider, company.providerKey)),
        postedAt: String(job.publishedAt ?? new Date().toISOString()),
        employmentType: String(job.employmentType ?? ""),
        workplaceType: String(job.workplaceType ?? ""),
        department: String(job.department ?? job.team ?? ""),
      }));
  }

  private async fetchSmartRecruiters(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    const response = await fetch(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.providerKey)}/postings?limit=100`, {
      headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { content?: SmartRecruitersJob[] };
    return (payload.content ?? []).map((job) => {
      const sectionText = Object.values(job.jobAd?.sections ?? {}).map((section) => section.text ?? "").join("\n");
      const location = job.location?.fullLocation
        || [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", ")
        || "Remote";
      return this.transformGeneric(job as unknown as Record<string, unknown>, company, {
        id: String(job.id ?? job.uuid ?? job.ref ?? ""),
        title: String(job.name ?? job.title ?? ""),
        description: sectionText,
        location,
        url: String(job.postingUrl ?? job.applyUrl ?? fallbackCareersUrl(company.provider, company.providerKey)),
        postedAt: String(job.releasedDate ?? job.updatedDate ?? new Date().toISOString()),
        employmentType: String(job.typeOfEmployment?.label ?? job.typeOfEmployment?.name ?? ""),
        department: String(job.department?.label ?? job.department?.name ?? job.function?.label ?? job.function?.name ?? ""),
      });
    });
  }

  private async fetchRecruitee(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    const response = await fetch(`https://${encodeURIComponent(company.providerKey)}.recruitee.com/api/offers`, {
      headers: { Accept: "application/json", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as { offers?: RecruiteeJob[] };
    return (payload.offers ?? [])
      .filter((job) => !job.status || String(job.status).toLowerCase() === "published")
      .map((job) => {
        const location = typeof job.location === "object" && job.location
          ? [job.location.name, job.location.city, job.location.country].filter(Boolean).join(", ")
          : String(job.location ?? "Remote");
        return this.transformGeneric(job as unknown as Record<string, unknown>, company, {
          id: String(job.id ?? job.careers_url ?? job.title ?? ""),
          title: String(job.title ?? ""),
          description: String(job.description ?? ""),
          location: location || "Remote",
          url: String(job.careers_url ?? job.apply_url ?? fallbackCareersUrl(company.provider, company.providerKey)),
          postedAt: String(job.updated_at ?? job.created_at ?? new Date().toISOString()),
          employmentType: String(job.employment_type ?? ""),
          department: String(job.department ?? ""),
        });
      });
  }

  private async fetchGenericCareerPage(company: CompanyCareerSourceConfig): Promise<AggregatedJob[]> {
    await this.assertRobotsAllowed(company.careersUrl);
    const response = await fetch(company.careersUrl, {
      headers: { Accept: "text/html", "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const jobs: AggregatedJob[] = [];

    $("script[type='application/ld+json']").each((_index, element) => {
      const raw = $(element).contents().text();
      for (const posting of this.extractJobPostingsFromJsonLd(raw)) {
        jobs.push(this.transformJsonLdPosting(posting, company));
      }
    });

    return jobs;
  }

  private async assertRobotsAllowed(targetUrl: string): Promise<void> {
    const url = new URL(targetUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    try {
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": "AfriTalent/1.0 (+https://afri-talent.com)" },
      });
      if (!response.ok) return;
      const robots = await response.text();
      const path = url.pathname || "/";
      const disallowed = robots
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^disallow:/i.test(line))
        .map((line) => line.replace(/^disallow:/i, "").trim())
        .filter(Boolean)
        .some((rule) => path.startsWith(rule));
      if (disallowed) {
        throw new Error(`robots.txt disallows ${path}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("robots.txt disallows")) {
        throw error;
      }
    }
  }

  private extractJobPostingsFromJsonLd(raw: string): Array<Record<string, unknown>> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return this.flattenJsonLd(parsed).filter((item) => {
        const type = item["@type"];
        const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
        return types.some((entry) => entry.toLowerCase() === "jobposting");
      });
    } catch {
      return [];
    }
  }

  private flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.flattenJsonLd(item));
    }
    if (!value || typeof value !== "object") {
      return [];
    }
    const record = value as Record<string, unknown>;
    const graph = record["@graph"];
    return [record, ...this.flattenJsonLd(graph)];
  }

  private transformJsonLdPosting(posting: Record<string, unknown>, company: CompanyCareerSourceConfig): AggregatedJob {
    const location = this.readJobPostingLocation(posting) || "Remote";
    const title = String(posting.title ?? posting.name ?? "Untitled role");
    const description = String(posting.description ?? "");
    const url = String(posting.url ?? posting.applyUrl ?? company.careersUrl);
    const employmentType = Array.isArray(posting.employmentType)
      ? posting.employmentType.join(" ")
      : String(posting.employmentType ?? "");

    return this.transformGeneric(posting, company, {
      id: String(posting.identifier ?? posting.url ?? title),
      title,
      description,
      location,
      url,
      postedAt: String(posting.datePosted ?? new Date().toISOString()),
      employmentType,
      workplaceType: String(posting.jobLocationType ?? ""),
      department: String(posting.occupationalCategory ?? ""),
    });
  }

  private readJobPostingLocation(posting: Record<string, unknown>): string | null {
    if (String(posting.jobLocationType ?? "").toUpperCase().includes("TELECOMMUTE")) {
      return "Remote";
    }
    const location = posting.jobLocation;
    const firstLocation = Array.isArray(location) ? location[0] : location;
    if (!firstLocation || typeof firstLocation !== "object") return null;
    const address = (firstLocation as Record<string, unknown>).address;
    if (!address || typeof address !== "object") return null;
    const record = address as Record<string, unknown>;
    return [
      record.addressLocality,
      record.addressRegion,
      record.addressCountry,
    ].filter(Boolean).join(", ") || null;
  }

  private transformGeneric(
    raw: Record<string, unknown>,
    company: CompanyCareerSourceConfig,
    normalizedInput: {
      id: string;
      title: string;
      description: string;
      location: string;
      url: string;
      postedAt: string;
      employmentType?: string;
      workplaceType?: string;
      department?: string;
    },
  ): AggregatedJob {
    const description = this.normalizeDescription(normalizedInput.description);
    const location = normalizedInput.location || "Remote";
    const normalizedLocation = this.normalizeLocation(`${location} ${normalizedInput.workplaceType ?? ""}`);
    const tags = [normalizedInput.department, ...(company.targetFields ?? [])].filter(Boolean).map((tag) => String(tag));
    const postedAt = new Date(normalizedInput.postedAt);
    const jobField = this.classifyJobField({
      title: normalizedInput.title,
      description,
      tags,
      department: normalizedInput.department,
    });

    return {
      externalId: `company-${company.provider.toLowerCase()}-${company.providerKey}-${normalizedInput.id || Buffer.from(normalizedInput.url).toString("base64").slice(0, 18)}`,
      source: this.source,
      sourceUrl: normalizedInput.url,
      title: normalizedInput.title,
      company: company.companyName,
      location,
      locationType: normalizedLocation.locationType,
      workplaceType: this.normalizeWorkplaceType(normalizedLocation.locationType),
      jobField,
      country: normalizedLocation.country || "GLOBAL",
      region: normalizedLocation.locationType === "remote" ? "REMOTE_GLOBAL" : "OTHER",
      description,
      requirements: [],
      visaSponsorship: this.detectVisaSponsorship(description),
      relocationAssistance: /relocat/i.test(description),
      eligibleCountries: [],
      skills: this.extractSkills(description),
      seniority: this.detectSeniority(normalizedInput.title, description),
      jobType: this.mapJobType(normalizedInput.employmentType ?? description),
      postedAt: Number.isNaN(postedAt.getTime()) ? new Date() : postedAt,
      applicationUrl: normalizedInput.url,
      companyCareerSourceId: company.id,
      rawData: {
        provider: company.provider,
        providerKey: company.providerKey,
        careersUrl: company.careersUrl,
        raw,
      },
    };
  }

  private mapJobType(value: string): AggregatedJob["jobType"] {
    const lower = value.toLowerCase();
    if (lower.includes("part")) return "Part-time";
    if (lower.includes("contract")) return "Contract";
    if (lower.includes("freelance")) return "Freelance";
    if (lower.includes("intern")) return "Internship";
    return "Full-time";
  }
}
