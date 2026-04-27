import type { NormalizedJob, CareerProvider } from "./normalized-job.js";

export interface ProviderFetchContext {
  keywords: string[];
  location?: string;
  remoteOnly?: boolean;
  limit?: number;
}

export interface ProviderAdapter {
  provider: CareerProvider;
  implemented: boolean;
  normalize(raw: unknown, context?: { companyName?: string }): NormalizedJob;
  fetchJobs?(context: ProviderFetchContext): Promise<NormalizedJob[]>;
}

export const SUPPORTED_CAREER_PROVIDERS: readonly CareerProvider[] = [
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "SMARTRECRUITERS",
  "RECRUITEE",
  "GENERIC",
  "WORKDAY",
  "ICIMS",
  "JOBVITE",
  "BAMBOOHR",
  "WORKABLE",
  "PERSONIO",
  "TEAMTAILOR",
  "PINPOINT",
  "SAP_SUCCESSFACTORS",
  "ORACLE_TALEO",
  "UKG",
  "ADP",
];

export const IMPLEMENTED_CAREER_PROVIDERS: readonly CareerProvider[] = [
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "SMARTRECRUITERS",
  "RECRUITEE",
  "GENERIC",
];

export function isCareerProvider(value: string): value is CareerProvider {
  return SUPPORTED_CAREER_PROVIDERS.includes(value.toUpperCase() as CareerProvider);
}

export function providerImplemented(provider: CareerProvider): boolean {
  return IMPLEMENTED_CAREER_PROVIDERS.includes(provider);
}

export class UnsupportedProviderAdapter implements ProviderAdapter {
  implemented = false;

  constructor(readonly provider: CareerProvider) {}

  normalize(): NormalizedJob {
    // TODO: Implement provider-specific API normalization before enabling fetchJobs.
    throw new Error(`${this.provider} adapter is defined but not implemented`);
  }
}

export function createProviderAdapter(provider: CareerProvider): ProviderAdapter {
  if (!providerImplemented(provider)) {
    return new UnsupportedProviderAdapter(provider);
  }

  return {
    provider,
    implemented: true,
    normalize(raw: unknown): NormalizedJob {
      const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const title = String(record.title ?? record.name ?? "Untitled role");
      const sourceUrl = String(record.sourceUrl ?? record.url ?? record.absolute_url ?? "");
      return {
        externalId: String(record.externalId ?? record.id ?? sourceUrl ?? title),
        provider,
        companyName: String(record.companyName ?? record.company ?? "Unknown"),
        title,
        description: String(record.description ?? record.content ?? ""),
        location: String(record.location ?? "Remote"),
        remoteType: "UNKNOWN",
        employmentType: "Unknown",
        seniority: typeof record.seniority === "string" ? record.seniority : null,
        salaryMin: typeof record.salaryMin === "number" ? record.salaryMin : null,
        salaryMax: typeof record.salaryMax === "number" ? record.salaryMax : null,
        currency: typeof record.currency === "string" ? record.currency : null,
        applyUrl: String(record.applyUrl ?? record.applicationUrl ?? sourceUrl) || null,
        sourceUrl: sourceUrl || null,
        postedAt: typeof record.postedAt === "string" ? new Date(record.postedAt) : null,
        discoveredAt: new Date(),
        skills: Array.isArray(record.skills) ? record.skills.map(String) : [],
        countriesAllowed: Array.isArray(record.countriesAllowed) ? record.countriesAllowed.map(String) : [],
        visaSponsorship: record.visaSponsorship === "YES" || record.visaSponsorship === "NO" ? record.visaSponsorship : "UNKNOWN",
        hiringForeigners: Boolean(record.hiringForeigners),
        scamRiskScore: 0,
        qualityScore: 0,
        relevanceScore: 0,
        finalScore: 0,
      };
    },
  };
}
