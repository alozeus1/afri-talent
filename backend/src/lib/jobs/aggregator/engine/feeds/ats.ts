// ─────────────────────────────────────────────────────────────────────────────
// ATS public job-board APIs (no auth; published for career-site embedding):
//   Greenhouse   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
//   Lever        https://api.lever.co/v0/postings/{site}?mode=json
//   Ashby        https://api.ashbyhq.com/posting-api/job-board/{org}
//   SmartRecr.   https://api.smartrecruiters.com/v1/companies/{id}/postings
//   Recruitee    https://{company}.recruitee.com/api/offers
//   Workable     https://apply.workable.com/api/v1/widget/accounts/{account}
// One FeedSource per provider; companies within it are fetched with bounded
// concurrency and each company is its own expiry scope, so one failing board
// never expires another board's jobs.
// ─────────────────────────────────────────────────────────────────────────────

import * as cheerio from "cheerio";
import { mapWithConcurrency } from "../circuit-breaker.js";
import type { FeedFetchContext, FeedFetchResult, FeedSource, FeedSourceId, RawPosting } from "../types.js";
import { isRecent, str, toDate, toNumber } from "./common.js";
import type { AtsCompany, AtsProvider } from "../catalog/companies.js";

const COMPANY_CONCURRENCY = 4;

type CompanyParser = (company: AtsCompany, ctx: FeedFetchContext) => Promise<{ postings: RawPosting[]; notModified: boolean }>;

function atsFeed(id: FeedSourceId, name: string, provider: AtsProvider, companies: AtsCompany[], parser: CompanyParser, options: { robotsExempt?: boolean } = {}): FeedSource {
  const scoped = companies.filter((company) => company.provider === provider);
  return {
    id,
    name,
    kind: "ats_board",
    minIntervalMinutes: 60,
    robotsExempt: options.robotsExempt,
    async fetch(ctx): Promise<FeedFetchResult> {
      const results = await mapWithConcurrency(scoped, COMPANY_CONCURRENCY, async (company) => {
        const scopeKey = `${id}:${company.token.toLowerCase()}:`;
        try {
          const { postings, notModified } = await parser(company, ctx);
          return {
            postings: postings.filter((posting) => isRecent(posting.postedAt, ctx.postedAfter)),
            scope: { scopeKey, ok: true, complete: true, notModified },
          };
        } catch (error) {
          return {
            postings: [] as RawPosting[],
            scope: { scopeKey, ok: false, complete: false, error: `${company.token}: ${(error as Error).message}` },
          };
        }
      });
      return {
        postings: results.flatMap((result) => result.postings),
        scopes: results.map((result) => result.scope),
      };
    },
  };
}

// ── Greenhouse
export interface GreenhouseJob {
  id: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string | null }>;
  company_name?: string;
}

export function parseGreenhouse(company: AtsCompany, payload: { jobs?: GreenhouseJob[] }): RawPosting[] {
  return (payload.jobs ?? []).map((job): RawPosting => {
    const location = str(job.location?.name);
    return {
      externalId: `greenhouse:${company.token.toLowerCase()}:${job.id}`,
      scopeKey: `greenhouse:${company.token.toLowerCase()}:`,
      title: str(job.title),
      company: company.name || str(job.company_name),
      location,
      remote: /\bremote\b/i.test(location),
      hybrid: /\bhybrid\b/i.test(location),
      descriptionHtml: str(job.content),
      applyUrl: str(job.absolute_url),
      sourceUrl: str(job.absolute_url),
      postedAt: toDate(job.first_published) ?? toDate(job.updated_at),
      updatedAt: toDate(job.updated_at),
      department: job.departments?.[0]?.name,
      companyCareerSourceId: company.careerSourceId,
    };
  });
}

export function greenhouseFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("greenhouse", "Greenhouse boards", "GREENHOUSE", companies, async (company, ctx) => {
    const { data, notModified } = await ctx.http.getJson<{ jobs?: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.token)}/jobs?content=true`,
      { signal: ctx.signal },
    );
    return { postings: parseGreenhouse(company, data), notModified };
  });
}

// ── Lever
export interface LeverJob {
  id: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  country?: string;
  description?: string;
  descriptionBody?: string;
  additional?: string;
  lists?: Array<{ text?: string; content?: string }>;
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export function parseLever(company: AtsCompany, payload: LeverJob[]): RawPosting[] {
  return (Array.isArray(payload) ? payload : []).map((job): RawPosting => {
    const locations = job.categories?.allLocations?.length ? job.categories.allLocations : [str(job.categories?.location)];
    const location = locations.filter(Boolean).join(" / ");
    const workplace = str(job.workplaceType).toLowerCase();
    const lists = (job.lists ?? []).map((list) => `<h3>${str(list.text)}</h3><ul>${str(list.content)}</ul>`).join("");
    const interval = str(job.salaryRange?.interval).toLowerCase();
    return {
      externalId: `lever:${company.token.toLowerCase()}:${job.id}`,
      scopeKey: `lever:${company.token.toLowerCase()}:`,
      title: str(job.text),
      company: company.name,
      location,
      remote: workplace === "remote" || /\bremote\b/i.test(location),
      hybrid: workplace === "hybrid",
      descriptionHtml: `${str(job.description || job.descriptionBody)}${lists}${str(job.additional)}`,
      applyUrl: str(job.applyUrl || job.hostedUrl),
      sourceUrl: str(job.hostedUrl || job.applyUrl),
      postedAt: toDate(job.createdAt),
      employmentType: job.categories?.commitment,
      department: job.categories?.department || job.categories?.team,
      salary:
        job.salaryRange && (job.salaryRange.min || job.salaryRange.max)
          ? {
              min: toNumber(job.salaryRange.min),
              max: toNumber(job.salaryRange.max),
              currency: str(job.salaryRange.currency) || "USD",
              period: interval.includes("hour") ? "hourly" : interval.includes("month") ? "monthly" : "yearly",
            }
          : undefined,
      companyCareerSourceId: company.careerSourceId,
    };
  });
}

export function leverFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("lever", "Lever boards", "LEVER", companies, async (company, ctx) => {
    const { data, notModified } = await ctx.http.getJson<LeverJob[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company.token)}?mode=json`,
      { signal: ctx.signal },
    );
    return { postings: parseLever(company, data), notModified };
  });
}

// ── Ashby
export interface AshbyJob {
  id: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  isRemote?: boolean;
  workplaceType?: string;
  isListed?: boolean;
  publishedAt?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string; addressLocality?: string } };
}

export function parseAshby(company: AtsCompany, payload: { jobs?: AshbyJob[] }): RawPosting[] {
  return (payload.jobs ?? [])
    .filter((job) => job.isListed !== false)
    .map((job): RawPosting => {
      const locations = [str(job.location), ...(job.secondaryLocations ?? []).map((entry) => str(entry.location))].filter(Boolean);
      const workplace = str(job.workplaceType).toLowerCase();
      return {
        externalId: `ashby:${company.token.toLowerCase()}:${job.id}`,
        scopeKey: `ashby:${company.token.toLowerCase()}:`,
        title: str(job.title),
        company: company.name,
        location: locations.join(" / "),
        remote: Boolean(job.isRemote) || workplace === "remote",
        hybrid: workplace === "hybrid",
        descriptionHtml: str(job.descriptionHtml || job.descriptionPlain),
        applyUrl: str(job.applyUrl || job.jobUrl),
        sourceUrl: str(job.jobUrl || job.applyUrl),
        postedAt: toDate(job.publishedAt),
        employmentType: str(job.employmentType).replace(/([a-z])([A-Z])/g, "$1-$2"),
        department: job.department || job.team,
        companyCareerSourceId: company.careerSourceId,
      };
    });
}

export function ashbyFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("ashby", "Ashby boards", "ASHBY", companies, async (company, ctx) => {
    const { data, notModified } = await ctx.http.getJson<{ jobs?: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.token)}`,
      { signal: ctx.signal },
    );
    return { postings: parseAshby(company, data), notModified };
  });
}

// ── SmartRecruiters. The list endpoint carries no job ad, so eligibility is
// decided from the structured location (remote flag + country) only.
// NOTE: api.smartrecruiters.com/robots.txt currently disallows generic
// crawlers; the engine honours that and reports the feed as robots-blocked
// unless an operator adds the host to AGGREGATOR_ROBOTS_EXEMPT_HOSTS after
// confirming SmartRecruiters' Posting API terms allow it.
export interface SmartRecruitersJob {
  id: string;
  name?: string;
  releasedDate?: string;
  ref?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
  postingUrl?: string;
  applyUrl?: string;
}

export function parseSmartRecruiters(company: AtsCompany, payload: { content?: SmartRecruitersJob[] }): RawPosting[] {
  return (payload.content ?? []).map((job): RawPosting => {
    const location = str(job.location?.fullLocation) ||
      [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", ");
    const sections = Object.values(job.jobAd?.sections ?? {})
      .map((section) => `<h3>${str(section.title)}</h3>${str(section.text)}`)
      .join("");
    const url = str(job.postingUrl) || `https://jobs.smartrecruiters.com/${encodeURIComponent(company.token)}/${job.id}`;
    return {
      externalId: `smartrecruiters:${company.token.toLowerCase()}:${job.id}`,
      scopeKey: `smartrecruiters:${company.token.toLowerCase()}:`,
      title: str(job.name),
      company: company.name,
      location: job.location?.remote ? `Remote - ${location}` : location,
      remote: Boolean(job.location?.remote),
      hybrid: Boolean(job.location?.hybrid),
      descriptionHtml: sections,
      applyUrl: str(job.applyUrl) || url,
      sourceUrl: url,
      postedAt: toDate(job.releasedDate),
      employmentType: job.typeOfEmployment?.label,
      department: job.department?.label || job.function?.label,
      companyCareerSourceId: company.careerSourceId,
    };
  });
}

export function smartRecruitersFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("smartrecruiters", "SmartRecruiters boards", "SMARTRECRUITERS", companies, async (company, ctx) => {
    const postings: RawPosting[] = [];
    let notModified = false;
    for (let offset = 0; offset < 500; offset += 100) {
      const page = await ctx.http.getJson<{ content?: SmartRecruitersJob[]; totalFound?: number }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.token)}/postings?limit=100&offset=${offset}`,
        { signal: ctx.signal },
      );
      notModified = page.notModified;
      postings.push(...parseSmartRecruiters(company, page.data));
      if ((page.data.content ?? []).length < 100) break;
    }
    return { postings, notModified };
  });
}

// ── Recruitee
export interface RecruiteeOffer {
  id: number | string;
  title?: string;
  description?: string;
  requirements?: string;
  careers_url?: string;
  careers_apply_url?: string;
  published_at?: string;
  created_at?: string;
  employment_type_code?: string;
  department?: string;
  location?: string;
  remote?: boolean;
  hybrid?: boolean;
  status?: string;
  min_hours?: number;
}

export function parseRecruitee(company: AtsCompany, payload: { offers?: RecruiteeOffer[] }): RawPosting[] {
  return (payload.offers ?? [])
    .filter((offer) => !offer.status || offer.status === "published")
    .map((offer): RawPosting => ({
      externalId: `recruitee:${company.token.toLowerCase()}:${offer.id}`,
      scopeKey: `recruitee:${company.token.toLowerCase()}:`,
      title: str(offer.title),
      company: company.name,
      location: offer.remote ? `Remote${offer.location ? ` - ${offer.location}` : ""}` : str(offer.location),
      remote: Boolean(offer.remote),
      hybrid: Boolean(offer.hybrid),
      descriptionHtml: `${str(offer.description)}${str(offer.requirements)}`,
      applyUrl: str(offer.careers_apply_url || offer.careers_url),
      sourceUrl: str(offer.careers_url),
      postedAt: toDate(offer.published_at) ?? toDate(offer.created_at),
      employmentType: offer.employment_type_code,
      department: offer.department,
      companyCareerSourceId: company.careerSourceId,
    }));
}

export function recruiteeFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("recruitee", "Recruitee boards", "RECRUITEE", companies, async (company, ctx) => {
    const { data, notModified } = await ctx.http.getJson<{ offers?: RecruiteeOffer[] }>(
      `https://${encodeURIComponent(company.token)}.recruitee.com/api/offers/`,
      { signal: ctx.signal },
    );
    return { postings: parseRecruitee(company, data), notModified };
  });
}

// ── Workable (public widget API)
export interface WorkableJob {
  title?: string;
  shortcode: string;
  employment_type?: string;
  telecommuting?: boolean;
  department?: string;
  url?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  state?: string;
  locations?: Array<{ country?: string; city?: string; region?: string; hidden?: boolean }>;
  description?: string;
}

export function parseWorkable(company: AtsCompany, payload: { jobs?: WorkableJob[] }): RawPosting[] {
  return (payload.jobs ?? []).map((job): RawPosting => {
    const locations = (job.locations ?? [])
      .filter((location) => !location.hidden)
      .map((location) => [location.city, location.country].filter(Boolean).join(", "))
      .filter(Boolean);
    const primary = [job.city, job.country].filter(Boolean).join(", ");
    const location = (locations.length > 0 ? locations : [primary]).filter(Boolean).join(" / ");
    return {
      externalId: `workable:${company.token.toLowerCase()}:${job.shortcode}`,
      scopeKey: `workable:${company.token.toLowerCase()}:`,
      title: str(job.title),
      company: company.name,
      location: job.telecommuting ? `Remote${location ? ` - ${location}` : ""}` : location,
      remote: Boolean(job.telecommuting),
      descriptionHtml: str(job.description),
      applyUrl: str(job.application_url || job.url),
      sourceUrl: str(job.url || job.application_url),
      postedAt: toDate(job.published_on) ?? toDate(job.created_at),
      employmentType: job.employment_type,
      department: job.department,
      companyCareerSourceId: company.careerSourceId,
    };
  });
}

export function workableFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("workable", "Workable boards", "WORKABLE", companies, async (company, ctx) => {
    const { data, notModified } = await ctx.http.getJson<{ jobs?: WorkableJob[] }>(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(company.token)}?details=true`,
      { signal: ctx.signal },
    );
    return { postings: parseWorkable(company, data), notModified };
  });
}

// ── Company careers pages publishing schema.org JobPosting JSON-LD.
// HTML pages: robots.txt is always enforced by the HTTP client.
function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...flattenJsonLd(record["@graph"]), ...flattenJsonLd(record.itemListElement)];
}

function jsonLdLocation(posting: Record<string, unknown>): { location: string; remote: boolean } {
  const remote = String(posting.jobLocationType ?? "").toUpperCase().includes("TELECOMMUTE");
  const requirements = posting.applicantLocationRequirements;
  const requirementNames = (Array.isArray(requirements) ? requirements : requirements ? [requirements] : [])
    .map((entry) => (entry && typeof entry === "object" ? str((entry as Record<string, unknown>).name) : str(entry)))
    .filter(Boolean);
  const places = Array.isArray(posting.jobLocation) ? posting.jobLocation : posting.jobLocation ? [posting.jobLocation] : [];
  const names = places
    .map((place) => {
      const address = (place as Record<string, unknown> | null)?.address as Record<string, unknown> | undefined;
      if (!address || typeof address !== "object") return "";
      const country = address.addressCountry;
      const countryName = country && typeof country === "object" ? str((country as Record<string, unknown>).name) : str(country);
      return [str(address.addressLocality), str(address.addressRegion), countryName].filter(Boolean).join(", ");
    })
    .filter(Boolean);
  if (remote) return { location: `Remote${requirementNames.length ? ` - ${requirementNames.join(", ")}` : ""}`, remote };
  return { location: names.join(" / "), remote };
}

export function parseCareerPage(company: AtsCompany, html: string): RawPosting[] {
  const $ = cheerio.load(html);
  const postings: RawPosting[] = [];
  const scopeKey = `careerpages:${company.token.toLowerCase()}:`;
  $("script[type='application/ld+json']").each((_index, element) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(element).contents().text());
    } catch {
      return;
    }
    for (const item of flattenJsonLd(parsed)) {
      const type = item["@type"];
      const types = (Array.isArray(type) ? type : [type]).map((entry) => String(entry ?? "").toLowerCase());
      if (!types.includes("jobposting")) continue;
      const url = str(item.url) || company.token;
      const identifier = item.identifier && typeof item.identifier === "object"
        ? str((item.identifier as Record<string, unknown>).value)
        : str(item.identifier);
      const { location, remote } = jsonLdLocation(item);
      const hiring = item.hiringOrganization as Record<string, unknown> | undefined;
      postings.push({
        externalId: `${scopeKey}${identifier || url.replace(/^https?:\/\/[^/]+/, "")}`,
        scopeKey,
        title: str(item.title ?? item.name),
        company: company.name || str(hiring?.name),
        location,
        remote,
        descriptionHtml: str(item.description),
        applyUrl: url,
        sourceUrl: url,
        postedAt: toDate(item.datePosted),
        expiresAt: toDate(item.validThrough),
        employmentType: Array.isArray(item.employmentType) ? item.employmentType.join(" ") : str(item.employmentType),
        companyCareerSourceId: company.careerSourceId,
      });
    }
  });
  return postings.filter((posting) => posting.title);
}

export function careerPagesFeed(companies: AtsCompany[]): FeedSource {
  return atsFeed("careerpages", "Company career pages (JSON-LD)", "GENERIC", companies, async (company, ctx) => {
    const response = await ctx.http.get(company.token, { accept: "text/html", signal: ctx.signal });
    return { postings: parseCareerPage(company, response.body), notModified: response.notModified };
  });
}

export const ATS_FEED_FACTORIES: Record<AtsProvider, (companies: AtsCompany[]) => FeedSource> = {
  GENERIC: careerPagesFeed,
  GREENHOUSE: greenhouseFeed,
  LEVER: leverFeed,
  ASHBY: ashbyFeed,
  SMARTRECRUITERS: smartRecruitersFeed,
  RECRUITEE: recruiteeFeed,
  WORKABLE: workableFeed,
};
