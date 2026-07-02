// ─────────────────────────────────────────────────────────────────────────────
// "Hires from Africa" signal
//
// One predicate, two entry points:
//  - aggregated jobs (rich in-memory AggregatedJob with region/locationType)
//  - employer-posted jobs (raw form fields at create/update time)
//
// A job qualifies when any of:
//  1. it is located in Africa (region, African country code, or tech hub)
//  2. it is remote and open worldwide
//  3. the employer sponsors visas
//  4. the posting explicitly uses Africa-friendly language
// ─────────────────────────────────────────────────────────────────────────────

import type { AggregatedJob } from "./aggregator/types.js";
import {
  AFRICAN_COUNTRIES,
  AFRICAN_TECH_HUBS,
  AFRICA_FRIENDLY_KEYWORDS,
} from "./aggregator/types.js";

const AFRICAN_COUNTRY_SET = new Set(AFRICAN_COUNTRIES.map((c) => c.toUpperCase()));
const AFRICAN_HUB_LOWER = AFRICAN_TECH_HUBS.map((h) => h.toLowerCase());

function textMentionsAfricaFriendly(text: string): boolean {
  const lower = text.toLowerCase();
  return AFRICA_FRIENDLY_KEYWORDS.some((kw) => lower.includes(kw));
}

function locationLooksAfrican(location: string): boolean {
  const lower = location.toLowerCase();
  return AFRICAN_HUB_LOWER.some((hub) => lower.includes(hub));
}

/** Signal for aggregated jobs — uses the adapter-computed region. */
export function aggregatedJobHiresFromAfrica(job: AggregatedJob): boolean {
  if (job.region === "AFRICA") return true;
  if (job.region === "REMOTE_GLOBAL" && job.locationType === "remote") return true;
  if (job.visaSponsorship === "YES") return true;
  if (
    Array.isArray(job.eligibleCountries) &&
    job.eligibleCountries.some((c) => AFRICAN_COUNTRY_SET.has(c.toUpperCase()))
  ) {
    return true;
  }
  return textMentionsAfricaFriendly(`${job.title} ${job.description}`);
}

export interface PostedJobSignalInput {
  title: string;
  description: string;
  location?: string | null;
  workplaceType?: string | null;
  visaSponsorship?: string | null;
  eligibleCountries?: string[] | null;
}

/** Signal for employer-posted jobs — derived from the submitted fields. */
export function postedJobHiresFromAfrica(input: PostedJobSignalInput): boolean {
  const location = input.location ?? "";
  const locationLower = location.toLowerCase();

  if (locationLooksAfrican(location)) return true;

  const isRemote =
    (input.workplaceType ?? "").toLowerCase() === "remote" ||
    locationLower.includes("remote");
  const isWorldwide =
    locationLower.includes("worldwide") ||
    locationLower.includes("anywhere") ||
    locationLower.includes("global") ||
    (input.eligibleCountries ?? []).some((c) => c.toUpperCase() === "GLOBAL");
  if (isRemote && isWorldwide) return true;

  if ((input.visaSponsorship ?? "").toUpperCase() === "YES") return true;

  if (
    (input.eligibleCountries ?? []).some((c) => AFRICAN_COUNTRY_SET.has(c.toUpperCase()))
  ) {
    return true;
  }

  return textMentionsAfricaFriendly(`${input.title} ${input.description} ${location}`);
}
