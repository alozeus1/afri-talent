// §4.4 — stale lifecycle bands.
//
//   FRESH    age ≤ 7 days   → keep ranking high; no re-check needed
//   ACTIVE   age ≤ 30 days  → keep ranking; no re-check needed
//   AGING    age ≤ 60 days  → re-checked hourly by job-stale-check
//   STALE    age >  60 days → demoted heavily; re-check still attempted
//   EXPIRED  isExpired=true → removed from public listings entirely
//
// Pure function. `referenceAt` defaults to whichever timestamp the row has
// (sourceLastSeenAt > lastCheckedAt > publishedAt > updatedAt > createdAt)
// so the bands work for both aggregated and employer-posted jobs.

export type FreshnessBand = "FRESH" | "ACTIVE" | "AGING" | "STALE" | "EXPIRED";

export interface FreshnessBandInput {
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  lastCheckedAt?: Date | string | null;
  sourceLastSeenAt?: Date | string | null;
  expiresAt?: Date | string | null;
  isExpired?: boolean | null;
}

export interface FreshnessBandResult {
  band: FreshnessBand;
  ageDays: number;
  referenceAt: Date | null;
  needsReCheck: boolean;
}

// §4.4 thresholds in days.
export const FRESH_MAX_DAYS = 7;
export const ACTIVE_MAX_DAYS = 30;
export const AGING_MAX_DAYS = 60;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function freshnessBand(job: FreshnessBandInput, now: Date = new Date()): FreshnessBandResult {
  if (job.isExpired) {
    return { band: "EXPIRED", ageDays: Number.POSITIVE_INFINITY, referenceAt: null, needsReCheck: false };
  }
  const expiresAt = toDate(job.expiresAt);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { band: "EXPIRED", ageDays: Math.floor((now.getTime() - expiresAt.getTime()) / 86400000), referenceAt: expiresAt, needsReCheck: false };
  }

  const referenceAt =
    toDate(job.sourceLastSeenAt) ??
    toDate(job.lastCheckedAt) ??
    toDate(job.publishedAt) ??
    toDate(job.updatedAt) ??
    toDate(job.createdAt);

  if (!referenceAt) {
    // No anchor we can age against — treat as AGING so the worker re-checks
    // it on the next pass and either confirms or expires it.
    return { band: "AGING", ageDays: AGING_MAX_DAYS - 1, referenceAt: null, needsReCheck: true };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - referenceAt.getTime()) / 86400000));

  if (ageDays <= FRESH_MAX_DAYS) {
    return { band: "FRESH", ageDays, referenceAt, needsReCheck: false };
  }
  if (ageDays <= ACTIVE_MAX_DAYS) {
    return { band: "ACTIVE", ageDays, referenceAt, needsReCheck: false };
  }
  if (ageDays <= AGING_MAX_DAYS) {
    return { band: "AGING", ageDays, referenceAt, needsReCheck: true };
  }
  return { band: "STALE", ageDays, referenceAt, needsReCheck: true };
}

// Default JSON-LD validThrough horizon when no explicit expiresAt is set:
// 60 days from the original posting date. Matches the master prompt §4.4
// formula: validThrough = min(expiresAt, datePosted + 60 days).
export const VALID_THROUGH_DEFAULT_DAYS = 60;

export function computeValidThrough(
  expiresAt: Date | string | null | undefined,
  datePosted: Date | string | null | undefined,
): Date | null {
  const expiry = toDate(expiresAt);
  const posted = toDate(datePosted);
  const cap = posted ? new Date(posted.getTime() + VALID_THROUGH_DEFAULT_DAYS * 86400000) : null;

  if (expiry && cap) return expiry.getTime() < cap.getTime() ? expiry : cap;
  if (expiry) return expiry;
  if (cap) return cap;
  return null;
}
