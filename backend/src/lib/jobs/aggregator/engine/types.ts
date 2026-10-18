// ─────────────────────────────────────────────────────────────────────────────
// Aggregator engine — shared types.
//
// A FeedSource turns one official/public endpoint (ATS job-board API, public
// JSON API or RSS feed) into RawPostings. The pipeline owns everything else:
// politeness (robots.txt, rate limits, retries, timeouts), circuit breaking,
// Africa-eligibility, cross-source dedupe, content-hash change detection,
// persistence, stale-expiry and per-run metrics.
// ─────────────────────────────────────────────────────────────────────────────

import type { HttpClient } from "./http.js";

/** Stable identifier for a feed family. Used in metrics and the run log. */
export type FeedSourceId =
  | "remotive"
  | "remoteok"
  | "himalayas"
  | "weworkremotely"
  | "arbeitnow"
  | "jobicy"
  | "workingnomads"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "recruitee"
  | "workable"
  | "adzuna"
  | "careerpages";

export type FeedKind = "public_api" | "rss" | "ats_board" | "keyed_api";

/**
 * Normalised-but-not-yet-classified posting emitted by a feed adapter.
 * Adapters stay thin: they map fields 1:1 and never decide eligibility.
 */
export interface RawPosting {
  /** Source-scoped id, globally unique once prefixed: `${sourceId}:${scope}:${id}`. */
  externalId: string;
  /** Prefix used for stale-expiry of this feed scope (e.g. `greenhouse:stripe:`). */
  scopeKey: string;
  title: string;
  company: string;
  companyLogo?: string;
  /** Free-text location as published. */
  location: string;
  /** True when the source states the role is remote. */
  remote?: boolean;
  hybrid?: boolean;
  /** Explicit candidate-location restrictions published by the source. */
  locationRestrictions?: string[];
  /** Explicit UTC-offset restrictions (e.g. Himalayas timezoneRestrictions). */
  timezoneRestrictions?: number[];
  descriptionHtml: string;
  applyUrl: string;
  sourceUrl: string;
  postedAt?: Date | null;
  updatedAt?: Date | null;
  expiresAt?: Date | null;
  employmentType?: string;
  department?: string;
  tags?: string[];
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: "yearly" | "monthly" | "hourly";
  };
  /** Company career source row this posting came from (DB-configured ATS boards). */
  companyCareerSourceId?: string;
}

export interface FeedFetchContext {
  http: HttpClient;
  /** Aborts when the per-source time budget is exhausted. */
  signal: AbortSignal;
  now: Date;
  /** Only postings newer than this are wanted (best effort; filtered again later). */
  postedAfter: Date;
  /** Soft cap on postings per source. */
  maxPostings: number;
}

export interface FeedScopeResult {
  scopeKey: string;
  ok: boolean;
  /** True when the full feed was read (no truncation) — enables stale-expiry for this scope. */
  complete: boolean;
  notModified?: boolean;
  error?: string;
}

export interface FeedFetchResult {
  postings: RawPosting[];
  scopes: FeedScopeResult[];
}

export interface FeedSource {
  id: FeedSourceId;
  name: string;
  kind: FeedKind;
  /** Minimum minutes between fetches (honours provider ToS, e.g. Remotive ≤ 4/day). */
  minIntervalMinutes: number;
  /** Keyed APIs used under an explicit developer agreement skip robots.txt. */
  robotsExempt?: boolean;
  fetch(ctx: FeedFetchContext): Promise<FeedFetchResult>;
}

export type EligibilityVerdict = "eligible" | "ineligible" | "uncertain";

export type EligibilityScope =
  | "AFRICA_BASED"
  | "REMOTE_AFRICA"
  | "REMOTE_WORLDWIDE"
  | "REMOTE_EMEA"
  | "REMOTE_TIMEZONE_COMPATIBLE"
  | "VISA_SPONSORSHIP"
  | "RELOCATION";

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  scopes: EligibilityScope[];
  reasons: string[];
  decidedBy: "rules" | "llm" | "policy";
}

export interface SourceRunMetrics {
  source: FeedSourceId;
  name: string;
  status: "success" | "partial" | "failure" | "skipped";
  skipReason?: "circuit_open" | "min_interval" | "disabled" | "robots";
  circuit: "closed" | "open" | "half_open";
  fetched: number;
  eligible: number;
  rejected: number;
  uncertain: number;
  llmTieBreaks: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  expired: number;
  errors: number;
  notModifiedScopes: number;
  scopesOk: number;
  scopesFailed: number;
  durationMs: number;
  errorSamples: string[];
}

export interface RunTotals {
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesSkipped: number;
  fetched: number;
  eligible: number;
  rejected: number;
  uncertain: number;
  duplicates: number;
  inserted: number;
  updated: number;
  unchanged: number;
  expired: number;
  errors: number;
  llmCalls: number;
  llmJobsClassified: number;
  llmCacheHits: number;
}

export interface IngestionRunReport {
  runId: string | null;
  trigger: "cron" | "manual" | "dry_run";
  dryRun: boolean;
  status: "success" | "partial" | "failure";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totals: RunTotals;
  sources: SourceRunMetrics[];
  /** Small sample of eligible postings (dry-run / admin preview only). */
  sample?: Array<{ title: string; company: string; location: string; source: FeedSourceId; scopes: EligibilityScope[]; applyUrl: string }>;
}
