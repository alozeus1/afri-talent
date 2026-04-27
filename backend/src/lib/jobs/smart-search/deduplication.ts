import type { NormalizedJob } from "./normalized-job.js";

export interface DeduplicatedJobs {
  jobs: NormalizedJob[];
  duplicates: Array<{ duplicate: NormalizedJob; canonical: NormalizedJob; reason: string }>;
  duplicatesRemoved: number;
}

const SENIORITY_PREFIXES = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|mid[- ]?level)\b/gi;

export function normalizeTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(SENIORITY_PREFIXES, "")
    .replace(/[^\p{L}\p{N}+# ]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function normalizeValue(value?: string | null): string {
  return (value ?? "").toLowerCase().replace(/https?:\/\//, "").replace(/\/$/, "").replace(/\s+/g, " ").trim();
}

export function buildDedupKey(job: NormalizedJob): string {
  return [
    normalizeValue(job.companyName),
    normalizeTitleForDedup(job.title),
    normalizeValue(job.location),
    normalizeValue(job.applyUrl),
  ].join("|");
}

function completeness(job: NormalizedJob): number {
  let score = 0;
  if (job.description.length > 250) score += 2;
  if (job.applyUrl) score += 2;
  if (job.salaryMin || job.salaryMax) score += 1;
  if (job.skills.length > 0) score += 1;
  if (job.qualityScore > 0) score += 1;
  return score;
}

export function deduplicateJobs(jobs: NormalizedJob[]): DeduplicatedJobs {
  const byKey = new Map<string, NormalizedJob>();
  const duplicates: DeduplicatedJobs["duplicates"] = [];

  for (const job of jobs) {
    const key = buildDedupKey(job);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, job);
      continue;
    }

    const preferred = completeness(job) > completeness(existing) ? job : existing;
    const duplicate = preferred === job ? existing : job;
    preferred.duplicateOfExternalId = undefined;
    duplicate.duplicateOfExternalId = preferred.externalId;
    byKey.set(key, preferred);
    duplicates.push({ duplicate, canonical: preferred, reason: "same_company_title_location_apply_url" });
  }

  return {
    jobs: Array.from(byKey.values()),
    duplicates,
    duplicatesRemoved: duplicates.length,
  };
}
