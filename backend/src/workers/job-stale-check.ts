// ─────────────────────────────────────────────────────────────────────────────
// §4.4 — Job Stale-Check Worker.
//
// Runs hourly (via scheduler.ts). Picks the next AGING batch — jobs whose
// freshness band is AGING per backend/src/lib/jobs/freshness.ts — and
// re-fetches each sourceUrl with a HEAD request. Results:
//
//   * 2xx                 → reset staleCheckFailures = 0, refresh
//                           sourceLastSeenAt + lastCheckedAt.
//   * 404 / 410 / 5xx /
//     network failure     → staleCheckFailures += 1.
//   * 3 consecutive
//     failures            → flip isExpired = true, stamp expiresAt = now(),
//                           ping Google Indexing API with URL_DELETED.
//
// Single-process via the existing scheduler lock pattern. BullMQ is on the
// future roadmap but the scheduler infrastructure is the standing pattern
// for this codebase (see scheduler.ts).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { freshnessBand, ACTIVE_MAX_DAYS, AGING_MAX_DAYS } from "../lib/jobs/freshness.js";
import { notifyGoogleIndexing } from "../lib/seo/google-indexing.js";

export const STALE_CHECK_INTERVAL_MS =
  parseInt(process.env.STALE_CHECK_INTERVAL_MINUTES || "60", 10) * 60 * 1000;

const BATCH_SIZE = Math.min(
  parseInt(process.env.STALE_CHECK_BATCH_SIZE || "50", 10),
  500,
);
const URL_CHECK_TIMEOUT_MS = parseInt(process.env.STALE_CHECK_TIMEOUT_MS || "5000", 10);
const FAILURE_THRESHOLD = 3;

interface StaleCheckResult {
  status: "alive" | "gone" | "transient";
  httpStatus?: number;
}

async function checkUrl(url: string): Promise<StaleCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_CHECK_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "AfriTalent-Bot/1.0 (stale-check)" },
    });
    clearTimeout(timeout);
    if (res.status === 404 || res.status === 410) return { status: "gone", httpStatus: res.status };
    if (res.status >= 500) return { status: "transient", httpStatus: res.status };
    return { status: "alive", httpStatus: res.status };
  } catch {
    // Network errors / timeouts — treat as transient so we don't falsely
    // expire on intermittent issues. Three consecutive transients still
    // trips the threshold.
    return { status: "transient" };
  }
}

interface CycleStats {
  inspected: number;
  alive: number;
  failed: number;
  expired: number;
  indexingNotified: number;
}

export async function runJobStaleCheckCycle(now: Date = new Date()): Promise<CycleStats> {
  const stats: CycleStats = { inspected: 0, alive: 0, failed: 0, expired: 0, indexingNotified: 0 };

  // Pull the candidate batch in band-relevant order: jobs whose
  // sourceLastSeenAt is past the ACTIVE→AGING boundary (i.e. > 30 days ago).
  // The freshnessBand() check then confirms AGING/STALE before we hit the URL.
  const agingCutoff = new Date(now.getTime() - ACTIVE_MAX_DAYS * 86400000);

  const candidates = await prisma.job.findMany({
    where: {
      jobSource: "AGGREGATED",
      isExpired: false,
      status: "PUBLISHED",
      sourceUrl: { not: null },
      OR: [
        { sourceLastSeenAt: { lte: agingCutoff } },
        { sourceLastSeenAt: null, publishedAt: { lte: agingCutoff } },
      ],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: BATCH_SIZE,
    select: {
      id: true,
      sourceUrl: true,
      publishedAt: true,
      lastCheckedAt: true,
      sourceLastSeenAt: true,
      staleCheckFailures: true,
      createdAt: true,
      updatedAt: true,
      isExpired: true,
      expiresAt: true,
    },
  });

  for (const job of candidates) {
    if (!job.sourceUrl) continue;
    const band = freshnessBand(job, now).band;
    if (band !== "AGING" && band !== "STALE") continue;
    stats.inspected += 1;

    const result = await checkUrl(job.sourceUrl);
    if (result.status === "alive") {
      stats.alive += 1;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          staleCheckFailures: 0,
          lastCheckedAt: now,
          sourceLastSeenAt: now,
        },
      });
      continue;
    }

    // Failure path (gone or transient). 3 strikes → expire.
    const nextFailures = (job.staleCheckFailures ?? 0) + 1;
    stats.failed += 1;

    if (nextFailures >= FAILURE_THRESHOLD) {
      stats.expired += 1;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          staleCheckFailures: nextFailures,
          lastCheckedAt: now,
          isExpired: true,
          expiresAt: now,
        },
      });
      // Fire-and-forget Google Indexing URL_DELETED. We don't await network
      // failure to expire the row — the row state changes either way.
      if (job.sourceUrl) {
        notifyGoogleIndexing(job.sourceUrl, "URL_DELETED")
          .then((ok) => {
            if (ok) stats.indexingNotified += 1;
          })
          .catch(() => undefined);
      }
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          staleCheckFailures: nextFailures,
          lastCheckedAt: now,
        },
      });
    }
  }

  logger.info(
    { ...stats, batchSize: BATCH_SIZE, agingMaxDays: AGING_MAX_DAYS },
    "[stale-check] cycle complete",
  );

  return stats;
}

// Test seam — pure decision function exposed so unit tests can drive the
// 3-strike rule against fake checkUrl results without a database.
export function decideStaleAction(
  current: { staleCheckFailures: number },
  result: StaleCheckResult,
): { nextFailures: number; expire: boolean } {
  if (result.status === "alive") return { nextFailures: 0, expire: false };
  const nextFailures = current.staleCheckFailures + 1;
  return { nextFailures, expire: nextFailures >= FAILURE_THRESHOLD };
}

export const STALE_CHECK_FAILURE_THRESHOLD = FAILURE_THRESHOLD;
