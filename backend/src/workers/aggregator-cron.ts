// ─────────────────────────────────────────────────────────────────────────────
// Aggregator Cron — Scheduled job crawling from external boards
//
// Pulls jobs from all configured sources, deduplicates, filters for
// Africa-friendly positions, and upserts into the database.
// Tracks the last successful sync time so the matcher can find "new" jobs.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { getJobAggregator } from "../lib/jobs/aggregator/index.js";
import type { JobQuery } from "../lib/jobs/aggregator/sources/base.js";
import { redisClient } from "../lib/redis.js";

const LAST_SYNC_KEY = "aggregator:last_sync";

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

const MAX_JOBS_PER_SYNC = parseInt(process.env.AGGREGATOR_MAX_JOBS || "200", 10);
const POSTED_WITHIN_DAYS = parseInt(process.env.AGGREGATOR_POSTED_DAYS || "7", 10);

export async function runAggregatorCycle(): Promise<void> {
  const aggregator = getJobAggregator(prisma);

  const query: JobQuery = {
    keywords: DEFAULT_KEYWORDS,
    postedWithinDays: POSTED_WITHIN_DAYS,
    limit: MAX_JOBS_PER_SYNC,
    remote: true,
  };

  const result = await aggregator.syncJobsToDatabase(query);

  logger.info(
    {
      total: result.total,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      bySource: result.bySource,
      byRegion: result.byRegion,
    },
    "[aggregator-cron] sync cycle complete"
  );

  // Store last sync timestamp in Redis (for matcher) and a DB-friendly flag
  const now = new Date().toISOString();
  if (redisClient) {
    try {
      await redisClient.set(LAST_SYNC_KEY, now);
    } catch {
      // non-fatal
    }
  }
}

export async function getLastSyncTime(): Promise<Date | null> {
  if (redisClient) {
    try {
      const val = await redisClient.get(LAST_SYNC_KEY);
      if (val) return new Date(val);
    } catch {
      // fall through to DB
    }
  }

  // Fallback: check latest aggregated job update time
  const latest = await prisma.job.findFirst({
    where: { jobSource: "AGGREGATED" },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return latest?.updatedAt ?? null;
}
