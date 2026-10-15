// ─────────────────────────────────────────────────────────────────────────────
// Public remote-job boards with official free JSON APIs / RSS feeds.
// Each adapter honours the provider's published terms (linking back via
// sourceUrl, fetch cadence via minIntervalMinutes).
// ─────────────────────────────────────────────────────────────────────────────

import { parseStringPromise } from "xml2js";
import type { FeedFetchContext, FeedFetchResult, FeedSource, RawPosting } from "../types.js";
import { isRecent, parseSalaryText, splitList, str, toDate, toNumber } from "./common.js";

function single(scopeKey: string, postings: RawPosting[], complete: boolean, notModified = false): FeedFetchResult {
  return { postings, scopes: [{ scopeKey, ok: true, complete, notModified }] };
}

// ── Remotive — https://remotive.com/api/remote-jobs (ToS: ≤ 4 fetches/day, link back)
export interface RemotiveJob {
  id: number | string;
  url: string;
  title: string;
  company_name: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export function parseRemotive(payload: { jobs?: RemotiveJob[] }, ctx: Pick<FeedFetchContext, "postedAfter">): RawPosting[] {
  return (payload.jobs ?? [])
    .map((job): RawPosting => ({
      externalId: `remotive:${job.id}`,
      scopeKey: "remotive:",
      title: str(job.title),
      company: str(job.company_name),
      companyLogo: job.company_logo,
      location: str(job.candidate_required_location) || "Worldwide",
      remote: true,
      locationRestrictions: splitList(job.candidate_required_location),
      descriptionHtml: str(job.description),
      applyUrl: str(job.url),
      sourceUrl: str(job.url),
      postedAt: toDate(job.publication_date),
      employmentType: str(job.job_type).replace(/_/g, "-"),
      department: job.category,
      tags: job.tags ?? [],
      salary: parseSalaryText(job.salary),
    }))
    .filter((posting) => posting.title && posting.applyUrl && isRecent(posting.postedAt, ctx.postedAfter));
}

export function remotiveFeed(): FeedSource {
  return {
    id: "remotive",
    name: "Remotive",
    kind: "public_api",
    minIntervalMinutes: 6 * 60,
    async fetch(ctx) {
      const { data, notModified } = await ctx.http.getJson<{ jobs?: RemotiveJob[] }>(
        "https://remotive.com/api/remote-jobs",
        { signal: ctx.signal },
      );
      return single("remotive:", parseRemotive(data, ctx).slice(0, ctx.maxPostings), true, notModified);
    },
  };
}

// ── RemoteOK — https://remoteok.com/api (ToS: link back to RemoteOK as source)
export interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  date?: string;
  epoch?: number | string;
  company?: string;
  company_logo?: string;
  logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number | string;
  salary_max?: number | string;
  apply_url?: string;
  url?: string;
  legal?: string;
}

export function parseRemoteOk(payload: RemoteOkJob[], ctx: Pick<FeedFetchContext, "postedAfter">): RawPosting[] {
  return (Array.isArray(payload) ? payload : [])
    .filter((job) => job && job.id !== undefined && !job.legal)
    .map((job): RawPosting => {
      const min = toNumber(job.salary_min);
      const max = toNumber(job.salary_max);
      const url = str(job.url) || `https://remoteok.com/remote-jobs/${job.slug ?? job.id}`;
      return {
        externalId: `remoteok:${job.id}`,
        scopeKey: "remoteok:",
        title: str(job.position),
        company: str(job.company),
        companyLogo: str(job.company_logo || job.logo) || undefined,
        location: str(job.location) || "Remote",
        remote: true,
        descriptionHtml: str(job.description),
        // RemoteOK's terms require linking back to RemoteOK, so we send
        // candidates to the RemoteOK listing (which carries its own apply link).
        applyUrl: url,
        sourceUrl: url,
        postedAt: toDate(job.date) ?? toDate(job.epoch),
        tags: job.tags ?? [],
        salary: min || max ? { min, max, currency: "USD", period: "yearly" } : undefined,
      };
    })
    .filter((posting) => posting.title && isRecent(posting.postedAt, ctx.postedAfter));
}

export function remoteOkFeed(): FeedSource {
  return {
    id: "remoteok",
    name: "RemoteOK",
    kind: "public_api",
    minIntervalMinutes: 60,
    async fetch(ctx) {
      const { data, notModified } = await ctx.http.getJson<RemoteOkJob[]>("https://remoteok.com/api", { signal: ctx.signal });
      return single("remoteok:", parseRemoteOk(data, ctx).slice(0, ctx.maxPostings), true, notModified);
    },
  };
}

// ── Himalayas — https://himalayas.app/jobs/api (paged, newest first)
export interface HimalayasJob {
  guid?: string;
  title?: string;
  excerpt?: string;
  companyName?: string;
  companyLogo?: string;
  employmentType?: string;
  minSalary?: number | string | null;
  maxSalary?: number | string | null;
  salaryPeriod?: string;
  currency?: string;
  seniority?: string[];
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  categories?: string[];
  parentCategories?: string[];
  description?: string;
  pubDate?: number | string;
  expiryDate?: number | string;
  applicationLink?: string;
}

export function parseHimalayas(payload: { jobs?: HimalayasJob[] }): RawPosting[] {
  return (payload.jobs ?? []).map((job): RawPosting => {
    const min = toNumber(job.minSalary);
    const max = toNumber(job.maxSalary);
    const period = str(job.salaryPeriod).toLowerCase();
    const url = str(job.applicationLink || job.guid);
    const restrictions = job.locationRestrictions ?? [];
    return {
      externalId: `himalayas:${url.replace(/^https?:\/\/[^/]+/, "")}`,
      scopeKey: "himalayas:",
      title: str(job.title),
      company: str(job.companyName),
      companyLogo: str(job.companyLogo) || undefined,
      location: restrictions.length > 0 ? `Remote (${restrictions.join(", ")})` : "Remote (Worldwide)",
      remote: true,
      locationRestrictions: restrictions.length > 0 ? restrictions : ["Worldwide"],
      timezoneRestrictions: (job.timezoneRestrictions ?? []).map(Number).filter(Number.isFinite),
      descriptionHtml: str(job.description || job.excerpt),
      applyUrl: url,
      sourceUrl: str(job.guid) || url,
      postedAt: toDate(job.pubDate),
      expiresAt: toDate(job.expiryDate),
      employmentType: job.employmentType,
      department: job.parentCategories?.[0],
      tags: (job.categories ?? []).map((category) => category.replace(/-/g, " ")).slice(0, 8),
      salary:
        min || max
          ? {
              min,
              max,
              currency: str(job.currency) || "USD",
              period: period.startsWith("hour") ? "hourly" : period.startsWith("month") ? "monthly" : "yearly",
            }
          : undefined,
    };
  });
}

export function himalayasFeed(): FeedSource {
  return {
    id: "himalayas",
    name: "Himalayas",
    kind: "public_api",
    minIntervalMinutes: 120,
    async fetch(ctx) {
      const postings: RawPosting[] = [];
      const pageSize = 20;
      const maxPages = Math.max(1, Math.ceil(ctx.maxPostings / pageSize));
      let complete = false;
      for (let page = 0; page < maxPages; page += 1) {
        const { data } = await ctx.http.getJson<{ jobs?: HimalayasJob[]; totalCount?: number }>(
          `https://himalayas.app/jobs/api?limit=${pageSize}&offset=${page * pageSize}`,
          { signal: ctx.signal },
        );
        const batch = parseHimalayas(data);
        const fresh = batch.filter((posting) => isRecent(posting.postedAt, ctx.postedAfter));
        postings.push(...fresh);
        if (batch.length < pageSize || fresh.length < batch.length) {
          complete = true;
          break;
        }
      }
      // Paged + date-bounded: never "complete" for stale-expiry purposes unless
      // we reached the date cut-off.
      return single("himalayas:", postings, complete);
    },
  };
}

// ── We Work Remotely — official RSS https://weworkremotely.com/remote-jobs.rss
interface WwrItem {
  title?: string[];
  region?: string[];
  category?: string[];
  description?: string[];
  pubDate?: string[];
  guid?: Array<string | { _: string }>;
  link?: string[];
  "media:content"?: Array<{ $?: { url?: string } }>;
}

export async function parseWeWorkRemotely(xml: string, ctx: Pick<FeedFetchContext, "postedAfter">): Promise<RawPosting[]> {
  const parsed = await parseStringPromise(xml);
  const items: WwrItem[] = parsed?.rss?.channel?.[0]?.item ?? [];
  return items
    .map((item): RawPosting => {
      const rawTitle = str(item.title?.[0]);
      const separator = rawTitle.indexOf(":");
      const company = separator > 0 ? rawTitle.slice(0, separator).trim() : "";
      const title = separator > 0 ? rawTitle.slice(separator + 1).trim() : rawTitle;
      const link = str(item.link?.[0]);
      const guid = item.guid?.[0];
      const region = str(item.region?.[0]);
      return {
        externalId: `weworkremotely:${(typeof guid === "string" ? guid : guid?._ ?? link).replace(/^https?:\/\/[^/]+/, "")}`,
        scopeKey: "weworkremotely:",
        title,
        company: company || "Unknown company",
        companyLogo: item["media:content"]?.[0]?.$?.url,
        location: region ? (/remote|anywhere/i.test(region) ? region : `Remote - ${region}`) : "Remote",
        remote: true,
        locationRestrictions: region ? [region.replace(/^remote\s*-\s*/i, "")] : [],
        descriptionHtml: str(item.description?.[0]),
        applyUrl: link,
        sourceUrl: link,
        postedAt: toDate(item.pubDate?.[0]),
        department: item.category?.[0],
        tags: item.category ? [item.category[0]] : [],
      };
    })
    .filter((posting) => posting.title && posting.applyUrl && isRecent(posting.postedAt, ctx.postedAfter));
}

export function weWorkRemotelyFeed(): FeedSource {
  return {
    id: "weworkremotely",
    name: "We Work Remotely",
    kind: "rss",
    minIntervalMinutes: 60,
    async fetch(ctx) {
      const response = await ctx.http.get("https://weworkremotely.com/remote-jobs.rss", {
        accept: "application/rss+xml, application/xml",
        signal: ctx.signal,
      });
      const postings = await parseWeWorkRemotely(response.body, ctx);
      return single("weworkremotely:", postings.slice(0, ctx.maxPostings), true, response.notModified);
    },
  };
}

// ── Arbeitnow — https://www.arbeitnow.com/api/job-board-api (paged by created_at)
export interface ArbeitnowJob {
  slug: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export function parseArbeitnow(payload: { data?: ArbeitnowJob[] }): RawPosting[] {
  return (payload.data ?? []).map((job): RawPosting => ({
    externalId: `arbeitnow:${job.slug}`,
    scopeKey: "arbeitnow:",
    title: str(job.title),
    company: str(job.company_name),
    // Arbeitnow is a Germany/DACH board: an on-site posting with no location is in Germany.
    location: str(job.location) || (job.remote ? "Remote" : "Germany"),
    remote: Boolean(job.remote),
    descriptionHtml: str(job.description),
    applyUrl: str(job.url),
    sourceUrl: str(job.url),
    postedAt: toDate(job.created_at),
    employmentType: (job.job_types ?? []).join(" "),
    tags: job.tags ?? [],
  }));
}

export function arbeitnowFeed(): FeedSource {
  return {
    id: "arbeitnow",
    name: "Arbeitnow",
    kind: "public_api",
    minIntervalMinutes: 60,
    async fetch(ctx) {
      const postings: RawPosting[] = [];
      let complete = false;
      for (let page = 1; page <= 3; page += 1) {
        const { data } = await ctx.http.getJson<{ data?: ArbeitnowJob[]; links?: { next?: string | null } }>(
          `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
          { signal: ctx.signal },
        );
        const batch = parseArbeitnow(data);
        const fresh = batch.filter((posting) => isRecent(posting.postedAt, ctx.postedAfter));
        postings.push(...fresh);
        if (!data.links?.next || fresh.length < batch.length || postings.length >= ctx.maxPostings) {
          complete = !data.links?.next || fresh.length < batch.length;
          break;
        }
      }
      return single("arbeitnow:", postings.slice(0, ctx.maxPostings), complete);
    },
  };
}

// ── Jobicy — https://jobicy.com/api/v2/remote-jobs
export interface JobicyJob {
  id: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  annualSalaryMin?: number | string;
  annualSalaryMax?: number | string;
  salaryCurrency?: string;
}

export function parseJobicy(payload: { jobs?: JobicyJob[] }, ctx: Pick<FeedFetchContext, "postedAfter">): RawPosting[] {
  return (payload.jobs ?? [])
    .map((job): RawPosting => {
      const geo = str(job.jobGeo);
      const min = toNumber(job.annualSalaryMin);
      const max = toNumber(job.annualSalaryMax);
      return {
        externalId: `jobicy:${job.id}`,
        scopeKey: "jobicy:",
        title: str(job.jobTitle),
        company: str(job.companyName),
        companyLogo: str(job.companyLogo) || undefined,
        location: geo ? `Remote (${geo.replace(/\s*,\s*/g, ", ")})` : "Remote",
        remote: true,
        locationRestrictions: splitList(geo),
        descriptionHtml: str(job.jobDescription || job.jobExcerpt),
        applyUrl: str(job.url),
        sourceUrl: str(job.url),
        postedAt: toDate(job.pubDate),
        employmentType: (job.jobType ?? []).join(" "),
        department: job.jobIndustry?.[0],
        tags: job.jobIndustry ?? [],
        salary: min || max ? { min, max, currency: str(job.salaryCurrency) || "USD", period: "yearly" } : undefined,
      };
    })
    .filter((posting) => posting.title && posting.applyUrl && isRecent(posting.postedAt, ctx.postedAfter));
}

export function jobicyFeed(): FeedSource {
  return {
    id: "jobicy",
    name: "Jobicy",
    kind: "public_api",
    minIntervalMinutes: 60,
    async fetch(ctx) {
      const { data, notModified } = await ctx.http.getJson<{ jobs?: JobicyJob[] }>(
        "https://jobicy.com/api/v2/remote-jobs?count=100",
        { signal: ctx.signal },
      );
      // count=100 is the API's maximum, so this is a window, not the full feed.
      return single("jobicy:", parseJobicy(data, ctx), false, notModified);
    },
  };
}

// ── Working Nomads — https://www.workingnomads.com/api/exposed_jobs/
export interface WorkingNomadsJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
}

export function parseWorkingNomads(payload: WorkingNomadsJob[], ctx: Pick<FeedFetchContext, "postedAfter">): RawPosting[] {
  return (Array.isArray(payload) ? payload : [])
    .map((job): RawPosting => {
      const url = str(job.url);
      const location = str(job.location);
      return {
        externalId: `workingnomads:${url.replace(/^https?:\/\/[^/]+/, "")}`,
        scopeKey: "workingnomads:",
        title: str(job.title),
        company: str(job.company_name),
        location: location ? `Remote (${location})` : "Remote",
        remote: true,
        locationRestrictions: splitList(location),
        descriptionHtml: str(job.description),
        applyUrl: url,
        sourceUrl: url,
        postedAt: toDate(job.pub_date),
        department: job.category_name,
        tags: splitList(job.tags),
      };
    })
    .filter((posting) => posting.title && posting.applyUrl && isRecent(posting.postedAt, ctx.postedAfter));
}

export function workingNomadsFeed(): FeedSource {
  return {
    id: "workingnomads",
    name: "Working Nomads",
    kind: "public_api",
    minIntervalMinutes: 60,
    async fetch(ctx) {
      const { data, notModified } = await ctx.http.getJson<WorkingNomadsJob[]>(
        "https://www.workingnomads.com/api/exposed_jobs/",
        { signal: ctx.signal },
      );
      return single("workingnomads:", parseWorkingNomads(data, ctx), true, notModified);
    },
  };
}
