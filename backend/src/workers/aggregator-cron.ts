// ─────────────────────────────────────────────────────────────────────────────
// Aggregator Cron — Scheduled job crawling from external boards
//
// Pulls jobs from all configured sources, deduplicates, filters for
// Africa-friendly positions, and upserts into the database.
// Tracks real successful ingestion freshness (data-bearing cycles only).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { getJobAggregator } from "../lib/jobs/aggregator/index.js";
import type { AggregationDiagnostics, JobSource } from "../lib/jobs/aggregator/types.js";
import type { JobQuery } from "../lib/jobs/aggregator/sources/base.js";
import { redisClient } from "../lib/redis.js";
import { recordOpsSnapshotMetric } from "../lib/ops/events.js";

const LAST_SYNC_KEY = "aggregator:last_sync"; // legacy key kept for compatibility
const LAST_SUCCESS_KEY = "aggregator:last_successful_ingestion";
const LAST_CYCLE_AT_KEY = "aggregator:last_cycle_at";
const LAST_CYCLE_STATUS_KEY = "aggregator:last_cycle_status";
const LAST_JOBS_INGESTED_KEY = "aggregator:last_jobs_ingested";
const CONSECUTIVE_FAILURE_COUNT_KEY = "aggregator:consecutive_failures";
const CONSECUTIVE_ZERO_RESULT_COUNT_KEY = "aggregator:consecutive_zero_results";
const STATE_TTL_SECONDS = 30 * 24 * 60 * 60;

const DEFAULT_CRITICAL_SOURCES: JobSource[] = ["GREENHOUSE", "LEVER", "WORKABLE"];
const DEFAULT_KEYWORDS = (process.env.AGGREGATOR_KEYWORDS || "").split(",").filter(Boolean);
if (DEFAULT_KEYWORDS.length === 0) {
  DEFAULT_KEYWORDS.push(
    "software engineer",
    "developer",
    "frontend",
    "backend",
    "fullstack",
    "full stack",
    "devops",
    "data engineer",
    "data scientist",
    "machine learning",
    "product manager",
    "product designer",
    "ui ux designer",
    "cloud engineer",
    "mobile developer",
    "react developer",
    "python developer",
    "node developer",
  );
}

const MAX_JOBS_PER_SYNC = parseInt(process.env.AGGREGATOR_MAX_JOBS || "500", 10);
const POSTED_WITHIN_DAYS = parseInt(process.env.AGGREGATOR_POSTED_DAYS || "21", 10);

interface IngestionMemoryState {
  lastSuccessfulIngestionAt: Date | null;
  lastCycleAt: Date | null;
  lastCycleStatus: "success" | "failure" | "unknown";
  consecutiveFailureCount: number;
  consecutiveZeroResultCount: number;
  lastJobsIngested: number;
}

const ingestionMemoryState: IngestionMemoryState = {
  lastSuccessfulIngestionAt: null,
  lastCycleAt: null,
  lastCycleStatus: "unknown",
  consecutiveFailureCount: 0,
  consecutiveZeroResultCount: 0,
  lastJobsIngested: 0,
};

export interface IngestionCycleEvaluation {
  cycleStatus: "success" | "failure";
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  jobsIngested: number;
  hadErrors: boolean;
  allCriticalSourcesFailed: boolean;
  zeroResultWithErrors: boolean;
  successCheckpointEligible: boolean;
  criticalSourcesAttempted: JobSource[];
  reasons: string[];
}

export interface IngestionReliabilityState {
  lastSuccessfulIngestionAt: Date | null;
  lastCycleAt: Date | null;
  lastCycleStatus: "success" | "failure" | "unknown";
  consecutiveFailureCount: number;
  consecutiveZeroResultCount: number;
  lastJobsIngested: number;
}

function parseConfiguredCriticalSources(): JobSource[] {
  const raw = (process.env.AGGREGATOR_CRITICAL_SOURCES || "")
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);

  return raw as JobSource[];
}

function resolveCriticalSources(enabledSources: JobSource[]): JobSource[] {
  const configured = parseConfiguredCriticalSources();
  const baseline = configured.length > 0 ? configured : DEFAULT_CRITICAL_SOURCES;
  const enabledSet = new Set(enabledSources);
  const criticalEnabled = baseline.filter((source) => enabledSet.has(source));

  if (criticalEnabled.length > 0) {
    return Array.from(new Set(criticalEnabled));
  }

  // Fallback: if no explicitly critical source is enabled, treat all enabled
  // sources as critical for truth-based cycle evaluation.
  return Array.from(new Set(enabledSources));
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInteger(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseIntegerOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function getRedisValue(key: string): Promise<string | null> {
  if (!redisClient) return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
}

async function setRedisValue(key: string, value: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.set(key, value, "EX", STATE_TTL_SECONDS);
  } catch {
    // non-fatal
  }
}

async function getLatestAggregatedJobTimestampFromDb(): Promise<Date | null> {
  const latest = await prisma.job.findFirst({
    where: { jobSource: "AGGREGATED" },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return latest?.updatedAt ?? null;
}

export function evaluateIngestionCycle(input: {
  jobsIngested: number;
  diagnostics: AggregationDiagnostics;
  criticalSources: JobSource[];
}): IngestionCycleEvaluation {
  const { jobsIngested, diagnostics } = input;
  const reasons: string[] = [];

  const criticalSourceSet = new Set(input.criticalSources);
  const criticalSourceDiagnostics = diagnostics.sourceDiagnostics.filter((entry) => criticalSourceSet.has(entry.source));
  const allCriticalSourcesFailed =
    criticalSourceDiagnostics.length > 0 && criticalSourceDiagnostics.every((entry) => entry.status === "failure");
  if (allCriticalSourcesFailed) {
    reasons.push("all_critical_sources_failed");
  }

  const zeroResultWithErrors = jobsIngested === 0 && diagnostics.hadErrors;
  if (zeroResultWithErrors) {
    reasons.push("zero_result_with_errors");
  }

  const cycleStatus: IngestionCycleEvaluation["cycleStatus"] = reasons.length > 0 ? "failure" : "success";
  const successCheckpointEligible =
    cycleStatus === "success" && diagnostics.sourcesSucceeded > 0 && jobsIngested > 0;

  return {
    cycleStatus,
    sourcesAttempted: diagnostics.sourcesAttempted,
    sourcesSucceeded: diagnostics.sourcesSucceeded,
    sourcesFailed: diagnostics.sourcesFailed,
    jobsIngested,
    hadErrors: diagnostics.hadErrors,
    allCriticalSourcesFailed,
    zeroResultWithErrors,
    successCheckpointEligible,
    criticalSourcesAttempted: criticalSourceDiagnostics.map((entry) => entry.source),
    reasons,
  };
}

async function persistIngestionReliabilityState(
  now: Date,
  evaluation: IngestionCycleEvaluation,
): Promise<IngestionReliabilityState> {
  const redisFailureCount = parseInteger(await getRedisValue(CONSECUTIVE_FAILURE_COUNT_KEY));
  const redisZeroCount = parseInteger(await getRedisValue(CONSECUTIVE_ZERO_RESULT_COUNT_KEY));
  const currentFailureCount = redisClient ? redisFailureCount : ingestionMemoryState.consecutiveFailureCount;
  const currentZeroCount = redisClient ? redisZeroCount : ingestionMemoryState.consecutiveZeroResultCount;

  const nextFailureCount = evaluation.cycleStatus === "failure" ? currentFailureCount + 1 : 0;
  const nextZeroCount = evaluation.jobsIngested === 0 ? currentZeroCount + 1 : 0;

  const nowIso = now.toISOString();
  await setRedisValue(LAST_CYCLE_AT_KEY, nowIso);
  await setRedisValue(LAST_CYCLE_STATUS_KEY, evaluation.cycleStatus);
  await setRedisValue(LAST_JOBS_INGESTED_KEY, String(evaluation.jobsIngested));
  await setRedisValue(CONSECUTIVE_FAILURE_COUNT_KEY, String(nextFailureCount));
  await setRedisValue(CONSECUTIVE_ZERO_RESULT_COUNT_KEY, String(nextZeroCount));

  let lastSuccessfulIngestionAt = parseDate(await getRedisValue(LAST_SUCCESS_KEY));
  if (evaluation.successCheckpointEligible) {
    await setRedisValue(LAST_SUCCESS_KEY, nowIso);
    await setRedisValue(LAST_SYNC_KEY, nowIso);
    lastSuccessfulIngestionAt = now;
  }

  ingestionMemoryState.lastCycleAt = now;
  ingestionMemoryState.lastCycleStatus = evaluation.cycleStatus;
  ingestionMemoryState.consecutiveFailureCount = nextFailureCount;
  ingestionMemoryState.consecutiveZeroResultCount = nextZeroCount;
  ingestionMemoryState.lastJobsIngested = evaluation.jobsIngested;
  if (evaluation.successCheckpointEligible) {
    ingestionMemoryState.lastSuccessfulIngestionAt = now;
  }

  return {
    lastSuccessfulIngestionAt:
      lastSuccessfulIngestionAt ?? ingestionMemoryState.lastSuccessfulIngestionAt,
    lastCycleAt: now,
    lastCycleStatus: evaluation.cycleStatus,
    consecutiveFailureCount: nextFailureCount,
    consecutiveZeroResultCount: nextZeroCount,
    lastJobsIngested: evaluation.jobsIngested,
  };
}

export async function runAggregatorCycle(): Promise<void> {
  const aggregator = getJobAggregator(prisma);

  const query: JobQuery = {
    keywords: DEFAULT_KEYWORDS,
    postedWithinDays: POSTED_WITHIN_DAYS,
    limit: MAX_JOBS_PER_SYNC,
    remote: true,
  };

  const result = await aggregator.syncJobsToDatabase(query);
  const criticalSources = resolveCriticalSources(result.diagnostics.sourceDiagnostics.map((entry) => entry.source));
  const evaluation = evaluateIngestionCycle({
    jobsIngested: result.total,
    diagnostics: result.diagnostics,
    criticalSources,
  });
  const now = new Date();
  const state = await persistIngestionReliabilityState(now, evaluation);

  logger.info(
    {
      cycleStatus: evaluation.cycleStatus,
      sourcesAttempted: evaluation.sourcesAttempted,
      sourcesSucceeded: evaluation.sourcesSucceeded,
      sourcesFailed: evaluation.sourcesFailed,
      jobsIngested: evaluation.jobsIngested,
      total: result.total,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      bySource: result.bySource,
      byRegion: result.byRegion,
      reasons: evaluation.reasons,
      criticalSources,
      successCheckpointEligible: evaluation.successCheckpointEligible,
      successCheckpointUpdated: evaluation.successCheckpointEligible,
      consecutiveFailureCount: state.consecutiveFailureCount,
      consecutiveZeroResultCount: state.consecutiveZeroResultCount,
      lastSuccessfulIngestionAt: state.lastSuccessfulIngestionAt?.toISOString() ?? null,
    },
    "[aggregator-cron] sync cycle complete",
  );

  recordOpsSnapshotMetric({
    metricName: "ingestion_cycle_status",
    value: evaluation.cycleStatus === "success" ? 1 : 0,
    details: {
      cycle_status: evaluation.cycleStatus,
      reasons: evaluation.reasons.join(",") || "none",
      sources_attempted: evaluation.sourcesAttempted,
      sources_succeeded: evaluation.sourcesSucceeded,
      sources_failed: evaluation.sourcesFailed,
      jobs_ingested: evaluation.jobsIngested,
    },
  });

  recordOpsSnapshotMetric({
    metricName: "consecutive_failure_count",
    value: state.consecutiveFailureCount,
  });

  recordOpsSnapshotMetric({
    metricName: "consecutive_zero_result_count",
    value: state.consecutiveZeroResultCount,
  });

  recordOpsSnapshotMetric({
    metricName: "jobs_ingested_per_cycle",
    value: evaluation.jobsIngested,
    details: {
      cycle_status: evaluation.cycleStatus,
    },
  });

  if (state.lastSuccessfulIngestionAt) {
    recordOpsSnapshotMetric({
      metricName: "last_successful_ingestion_timestamp",
      value: Math.floor(state.lastSuccessfulIngestionAt.getTime() / 1000),
      details: {
        iso8601: state.lastSuccessfulIngestionAt.toISOString(),
      },
    });
  }

  if (evaluation.cycleStatus === "failure") {
    throw new Error(
      `[aggregator-cron] ingestion cycle failed: ${evaluation.reasons.join(",") || "unknown_reason"}`,
    );
  }
}

export async function getIngestionReliabilityState(): Promise<IngestionReliabilityState> {
  const [
    lastSuccessfulIngestionRaw,
    lastCycleAtRaw,
    lastCycleStatusRaw,
    consecutiveFailureRaw,
    consecutiveZeroRaw,
    lastJobsIngestedRaw,
  ] = await Promise.all([
    getRedisValue(LAST_SUCCESS_KEY),
    getRedisValue(LAST_CYCLE_AT_KEY),
    getRedisValue(LAST_CYCLE_STATUS_KEY),
    getRedisValue(CONSECUTIVE_FAILURE_COUNT_KEY),
    getRedisValue(CONSECUTIVE_ZERO_RESULT_COUNT_KEY),
    getRedisValue(LAST_JOBS_INGESTED_KEY),
  ]);

  let lastSuccessfulIngestionAt = parseDate(lastSuccessfulIngestionRaw);
  if (!lastSuccessfulIngestionAt) {
    const legacyLastSync = parseDate(await getRedisValue(LAST_SYNC_KEY));
    lastSuccessfulIngestionAt = legacyLastSync ?? ingestionMemoryState.lastSuccessfulIngestionAt;
  }
  if (!lastSuccessfulIngestionAt) {
    lastSuccessfulIngestionAt = await getLatestAggregatedJobTimestampFromDb();
  }

  return {
    lastSuccessfulIngestionAt,
    lastCycleAt: parseDate(lastCycleAtRaw) ?? ingestionMemoryState.lastCycleAt,
    lastCycleStatus:
      (lastCycleStatusRaw as IngestionReliabilityState["lastCycleStatus"] | null) ??
      ingestionMemoryState.lastCycleStatus,
    consecutiveFailureCount:
      parseIntegerOrNull(consecutiveFailureRaw) ?? ingestionMemoryState.consecutiveFailureCount,
    consecutiveZeroResultCount:
      parseIntegerOrNull(consecutiveZeroRaw) ?? ingestionMemoryState.consecutiveZeroResultCount,
    lastJobsIngested:
      parseIntegerOrNull(lastJobsIngestedRaw) ?? ingestionMemoryState.lastJobsIngested,
  };
}

export async function getLastSyncTime(): Promise<Date | null> {
  const state = await getIngestionReliabilityState();
  return state.lastSuccessfulIngestionAt;
}
