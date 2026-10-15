// ─────────────────────────────────────────────────────────────────────────────
// RawPosting → AggregatedJob (the shape the persistence layer already knows),
// plus the Africa-eligibility verdict.
// ─────────────────────────────────────────────────────────────────────────────

import type { AggregatedJob, JobRegion, JobSource } from "../types.js";
import { extractSkillsFromText, normalizeDescriptionText } from "../sources/base.js";
import { classifyJobField, normalizeWorkplaceType } from "../taxonomy.js";
import { detectRelocationText, detectVisaSponsorshipText, evaluateAfricaEligibility } from "./eligibility.js";
import type { EligibilityResult, FeedSourceId, RawPosting } from "./types.js";

export interface NormalizedPosting {
  job: AggregatedJob;
  eligibility: EligibilityResult;
  feed: FeedSourceId;
  scopeKey: string;
}

// The legacy JobSource union drives classifyApplyStrategy's per-vendor ATS
// matching; map each feed to the closest legacy value.
const FEED_TO_JOB_SOURCE: Record<FeedSourceId, JobSource> = {
  remotive: "REMOTIVE",
  remoteok: "REMOTEOK",
  himalayas: "HIMALAYAS",
  weworkremotely: "WEWORKREMOTELY",
  arbeitnow: "ARBEITNOW",
  jobicy: "JOBICY",
  workingnomads: "WORKINGNOMADS",
  greenhouse: "GREENHOUSE",
  lever: "LEVER",
  ashby: "ASHBY",
  smartrecruiters: "SMARTRECRUITERS",
  recruitee: "RECRUITEE",
  workable: "WORKABLE",
  adzuna: "ADZUNA",
  careerpages: "COMPANY_API",
};

export function feedToJobSource(feed: FeedSourceId): JobSource {
  return FEED_TO_JOB_SOURCE[feed];
}

export function seniorityFromTitle(title: string): AggregatedJob["seniority"] {
  const value = title.toLowerCase();
  if (/\b(chief|cto|ceo|cfo|coo|cpo|vp|vice president|head of|director)\b/.test(value)) return "Executive";
  if (/\b(lead|principal|staff|architect|manager)\b/.test(value)) return "Lead";
  if (/\b(senior|sr\.?|snr|expert|iii|iv)\b/.test(value)) return "Senior";
  if (/\b(junior|jr\.?|entry[- ]level|graduate|intern|internship|trainee|apprentice|associate)\b/.test(value)) return "Junior";
  if (/\b(mid[- ]level|intermediate|ii)\b/.test(value)) return "Mid-level";
  return null;
}

export function mapEmploymentType(value: string | undefined): AggregatedJob["jobType"] {
  const lower = (value ?? "").toLowerCase();
  if (lower.includes("intern")) return "Internship";
  if (lower.includes("part")) return "Part-time";
  if (lower.includes("freelance")) return "Freelance";
  if (lower.includes("contract") || lower.includes("temporary") || lower.includes("contractor")) return "Contract";
  return "Full-time";
}

// Ambiguous single-word "skills" (`go`, `git`, `express`, `spring`, `swift`,
// `oracle`, `rust`) only count when they appear in the title, otherwise prose
// like "ready to go" tags every posting with Go.
const AMBIGUOUS_SKILLS = new Set(["go", "git", "express", "spring", "swift", "oracle", "rust", "sketch", "vue"]);

function extractSkills(title: string, description: string, tags: string[]): string[] {
  const titleLower = title.toLowerCase();
  const fromText = extractSkillsFromText(`${title}\n${description}`).filter(
    (skill) => !AMBIGUOUS_SKILLS.has(skill) || new RegExp(`\\b${skill}\\b`).test(titleLower),
  );
  const fromTags = tags.map((tag) => tag.toLowerCase().trim()).filter((tag) => tag && tag.length <= 40);
  return Array.from(new Set([...fromTags, ...fromText])).slice(0, 25);
}

function regionFor(eligibility: EligibilityResult, remote: boolean): JobRegion {
  if (eligibility.scopes.includes("AFRICA_BASED") || eligibility.scopes.includes("REMOTE_AFRICA")) return "AFRICA";
  if (remote) return "REMOTE_GLOBAL";
  return "OTHER";
}

export function normalizePosting(feed: FeedSourceId, raw: RawPosting, now = new Date()): NormalizedPosting {
  const description = normalizeDescriptionText(raw.descriptionHtml ?? "");
  const title = normalizeDescriptionText(raw.title ?? "").replace(/\s+/g, " ").trim();
  const company = (raw.company ?? "").replace(/\s+/g, " ").trim() || "Unknown company";
  const location = (raw.location ?? "").replace(/\s+/g, " ").trim();
  const remote = Boolean(raw.remote) || /\b(remote|anywhere|worldwide)\b/i.test(location);

  const eligibility = evaluateAfricaEligibility({
    title,
    location,
    description,
    remote,
    hybrid: raw.hybrid,
    locationRestrictions: raw.locationRestrictions,
    timezoneRestrictions: raw.timezoneRestrictions,
  });

  const locationType: AggregatedJob["locationType"] = remote ? "remote" : raw.hybrid ? "hybrid" : "onsite";
  const textForSignals = `${title}\n${description}`;
  const tags = [...(raw.tags ?? []), ...(raw.department ? [raw.department] : [])];
  const postedAt = raw.postedAt && !Number.isNaN(raw.postedAt.getTime()) ? raw.postedAt : now;

  const job: AggregatedJob = {
    externalId: raw.externalId,
    source: feedToJobSource(feed),
    sourceUrl: raw.sourceUrl || raw.applyUrl,
    title,
    company,
    companyLogo: raw.companyLogo || undefined,
    location: location || (remote ? "Remote" : ""),
    locationType,
    workplaceType: normalizeWorkplaceType(locationType),
    jobField: classifyJobField({ title, description, tags, department: raw.department }),
    country: remote ? "GLOBAL" : "",
    region: regionFor(eligibility, remote),
    description,
    requirements: [],
    salary:
      raw.salary && (raw.salary.min != null || raw.salary.max != null)
        ? {
            min: raw.salary.min != null ? Math.round(raw.salary.min) : undefined,
            max: raw.salary.max != null ? Math.round(raw.salary.max) : undefined,
            currency: raw.salary.currency || "USD",
            period: raw.salary.period ?? "yearly",
          }
        : undefined,
    visaSponsorship: detectVisaSponsorshipText(textForSignals),
    relocationAssistance: detectRelocationText(textForSignals),
    eligibleCountries: eligibility.scopes.some((scope) => scope.startsWith("REMOTE_WORLDWIDE")) ? ["GLOBAL"] : [],
    skills: extractSkills(title, description, tags),
    seniority: seniorityFromTitle(title),
    jobType: mapEmploymentType(raw.employmentType),
    postedAt,
    expiresAt: raw.expiresAt ?? undefined,
    applicationUrl: raw.applyUrl || raw.sourceUrl,
    companyCareerSourceId: raw.companyCareerSourceId,
  };

  return { job, eligibility, feed, scopeKey: raw.scopeKey };
}
