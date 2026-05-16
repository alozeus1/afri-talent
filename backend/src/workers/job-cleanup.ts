// ─────────────────────────────────────────────────────────────────────────────
// Job Cleanup Worker — Daily stale listing detection & archival
//
// 1. Marks jobs as expired when expiresAt has passed
// 2. Marks aggregated jobs older than STALE_THRESHOLD_DAYS as expired
//    if they haven't been re-seen during a recent aggregation cycle
// 3. Optionally verifies source URLs are still live (HEAD request)
// 4. Unpublishes expired jobs so they stop appearing in search results
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { buildJobIntelligenceUpdate } from "../lib/jobs/discovery.js";
import { emitStaleJobRemovalLatencySeconds } from "../lib/observability/metrics.js";

const STALE_THRESHOLD_DAYS = parseInt(process.env.JOB_STALE_DAYS || "30", 10);
const BATCH_SIZE = 100;
const URL_CHECK_ENABLED = process.env.JOB_URL_CHECK_ENABLED === "1";
const URL_CHECK_TIMEOUT_MS = 5000;

export const CLEANUP_INTERVAL_MS =
  parseInt(process.env.CLEANUP_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

export async function runJobCleanupCycle(): Promise<void> {
  const stats = { expiredByDate: 0, expiredByStale: 0, expiredByUrl: 0, total: 0 };

  // Phase 1: Mark jobs past their expiresAt as expired
  const dateExpired = await prisma.job.updateMany({
    where: {
      expiresAt: { lte: new Date() },
      isExpired: false,
      status: "PUBLISHED",
    },
    data: {
      isExpired: true,
      status: "REJECTED", // moves out of public listings
    },
  });
  stats.expiredByDate = dateExpired.count;

  // Phase 2: Mark aggregated jobs that haven't been updated recently as stale
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - STALE_THRESHOLD_DAYS);

  const staleWhere = {
    jobSource: "AGGREGATED" as const,
    isExpired: false,
    status: "PUBLISHED" as const,
    OR: [
      { staleAt: { lte: new Date() } },
      { sourceLastSeenAt: { lte: staleCutoff } },
      {
        AND: [
          { sourceLastSeenAt: null },
          { updatedAt: { lte: staleCutoff } },
        ],
      },
    ],
    expiresAt: null,
  };

  // Wave 9 §10.1 SLO #6 — sample the latency of the rows about to be
  // expired so the alarm has a Max statistic to evaluate. Cheaper than
  // refactoring updateMany → per-row updates. Sample size capped to
  // bound DB cost on large backlogs.
  const stalenessSample = await prisma.job.findMany({
    where: staleWhere,
    select: { sourceLastSeenAt: true, updatedAt: true },
    take: 500,
  });
  const cycleStartedAt = Date.now();
  let maxLatencyMs = 0;
  for (const row of stalenessSample) {
    const seenAt = row.sourceLastSeenAt ?? row.updatedAt;
    if (!seenAt) continue;
    const latencyMs = cycleStartedAt - seenAt.getTime();
    if (latencyMs > maxLatencyMs) maxLatencyMs = latencyMs;
  }
  if (stalenessSample.length > 0) {
    void emitStaleJobRemovalLatencySeconds(maxLatencyMs / 1000);
  }

  const staleExpired = await prisma.job.updateMany({
    where: staleWhere,
    data: {
      isExpired: true,
      status: "REJECTED",
      freshnessScore: 0,
    },
  });
  stats.expiredByStale = staleExpired.count;

  const freshnessBatch = await prisma.job.findMany({
    where: {
      jobSource: "AGGREGATED",
      isExpired: false,
      status: "PUBLISHED",
    },
    orderBy: { sourceLastSeenAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
  });

  for (const job of freshnessBatch) {
    const intelligence = buildJobIntelligenceUpdate(job, job.sourceLineage);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        freshnessScore: intelligence.freshnessScore,
        freshnessSignals: intelligence.freshnessSignals,
        staleAt: intelligence.staleAt,
        sourceFirstSeenAt: intelligence.sourceFirstSeenAt,
        sourceLastSeenAt: intelligence.sourceLastSeenAt,
      },
    });
  }

  // Phase 3: Optional URL liveness check on a sample of aggregated jobs
  if (URL_CHECK_ENABLED) {
    stats.expiredByUrl = await checkSourceUrls();
  }

  stats.total = stats.expiredByDate + stats.expiredByStale + stats.expiredByUrl;

  logger.info(
    {
      ...stats,
      staleThresholdDays: STALE_THRESHOLD_DAYS,
      urlCheckEnabled: URL_CHECK_ENABLED,
    },
    "[cleanup] Job cleanup cycle complete"
  );
}

async function checkSourceUrls(): Promise<number> {
  let expired = 0;

  // Check a batch of the oldest-checked published aggregated jobs
  const jobs = await prisma.job.findMany({
    where: {
      jobSource: "AGGREGATED",
      isExpired: false,
      status: "PUBLISHED",
      sourceUrl: { not: null },
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
    select: { id: true, sourceUrl: true },
  });

  for (const job of jobs) {
    if (!job.sourceUrl) continue;

    const isLive = await isUrlLive(job.sourceUrl);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        lastCheckedAt: new Date(),
        ...(isLive ? {} : { isExpired: true, status: "REJECTED" as const }),
      },
    });

    if (!isLive) {
      expired++;
      logger.debug({ jobId: job.id, url: job.sourceUrl }, "[cleanup] Source URL dead — expired");
    }
  }

  return expired;
}

async function isUrlLive(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AfriTalent-Bot/1.0 (job-checker)" },
    });

    clearTimeout(timeout);

    // 404/410 = definitely gone; 403 might be geo-blocked, treat as live
    if (res.status === 404 || res.status === 410) return false;
    return true;
  } catch {
    // Network errors / timeouts — assume live to avoid false positives
    return true;
  }
}
