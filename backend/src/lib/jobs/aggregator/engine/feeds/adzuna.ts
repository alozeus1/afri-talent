// ─────────────────────────────────────────────────────────────────────────────
// Adzuna — keyed official API (https://developer.adzuna.com). Used only when
// ADZUNA_APP_ID + ADZUNA_API_KEY are configured. South Africa ("za") is the
// African market Adzuna covers; extra markets via ADZUNA_COUNTRIES (comma).
// The API key is the licence to use the API, so robots.txt (which targets
// crawlers of the API host) does not apply — robotsExempt.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeedSource, RawPosting } from "../types.js";
import { str, toDate, toNumber } from "./common.js";

export interface AdzunaJob {
  id: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  category?: { label?: string };
}

const COUNTRY_CURRENCY: Record<string, string> = { za: "ZAR", gb: "GBP", us: "USD", de: "EUR", fr: "EUR", nl: "EUR" };

export function parseAdzuna(country: string, payload: { results?: AdzunaJob[] }): RawPosting[] {
  return (payload.results ?? []).map((job): RawPosting => {
    const area = job.location?.area ?? [];
    const location = str(job.location?.display_name) || area.slice().reverse().join(", ");
    const withCountry = country === "za" && !/south africa/i.test(location) ? `${location}, South Africa` : location;
    const min = toNumber(job.salary_min);
    const max = toNumber(job.salary_max);
    return {
      externalId: `adzuna:${country}:${job.id}`,
      scopeKey: `adzuna:${country}:`,
      title: str(job.title),
      company: str(job.company?.display_name),
      location: withCountry,
      descriptionHtml: str(job.description),
      applyUrl: str(job.redirect_url),
      sourceUrl: str(job.redirect_url),
      postedAt: toDate(job.created),
      employmentType: [job.contract_time, job.contract_type].filter(Boolean).join(" ").replace(/_/g, "-"),
      department: job.category?.label,
      salary: min || max ? { min, max, currency: COUNTRY_CURRENCY[country] ?? "USD", period: "yearly" } : undefined,
    };
  });
}

export function adzunaFeed(appId: string, apiKey: string, countries: string[]): FeedSource {
  return {
    id: "adzuna",
    name: "Adzuna",
    kind: "keyed_api",
    minIntervalMinutes: 6 * 60,
    robotsExempt: true,
    async fetch(ctx) {
      const postings: RawPosting[] = [];
      const scopes = [];
      const maxDays = Math.max(1, Math.ceil((ctx.now.getTime() - ctx.postedAfter.getTime()) / 86_400_000));
      for (const country of countries) {
        const scopeKey = `adzuna:${country}:`;
        try {
          for (let page = 1; page <= 4; page += 1) {
            const params = new URLSearchParams({
              app_id: appId,
              app_key: apiKey,
              results_per_page: "50",
              max_days_old: String(maxDays),
              sort_by: "date",
            });
            const { data } = await ctx.http.getJson<{ results?: AdzunaJob[] }>(
              `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params.toString()}`,
              { signal: ctx.signal, robotsExempt: true, conditional: false },
            );
            const batch = parseAdzuna(country, data);
            postings.push(...batch);
            if (batch.length < 50) break;
          }
          // Search window, not a full listing — never used for stale-expiry.
          scopes.push({ scopeKey, ok: true, complete: false });
        } catch (error) {
          scopes.push({ scopeKey, ok: false, complete: false, error: `${country}: ${(error as Error).message.replace(apiKey, "***")}` });
        }
      }
      return { postings: postings.slice(0, ctx.maxPostings), scopes };
    },
  };
}
