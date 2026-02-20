// Per-user daily apply_pack quota
// Uses Prisma to count today's runs for the user

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { AiRunType } from "@prisma/client";

// Configurable daily limits
const DAILY_APPLY_PACK_LIMIT = parseInt(process.env.DAILY_APPLY_PACK_LIMIT || "5", 10);
const DAILY_JOB_MATCH_LIMIT = parseInt(process.env.DAILY_JOB_MATCH_LIMIT || "20", 10);
const DAILY_RESUME_REVIEW_LIMIT = parseInt(process.env.DAILY_RESUME_REVIEW_LIMIT || "10", 10);

const LIMITS: Record<string, number> = {
  apply_pack: DAILY_APPLY_PACK_LIMIT,
  job_match: DAILY_JOB_MATCH_LIMIT,
  resume_review: DAILY_RESUME_REVIEW_LIMIT,
};

export async function checkDailyQuota(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const run_type = (req.body as { run_type?: string })?.run_type;
  const userId = req.user?.userId;

  if (!userId || !run_type) {
    next();
    return;
  }

  const limit = LIMITS[run_type];
  if (!limit) {
    next();
    return;
  }

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const typeMap: Record<string, AiRunType> = {
      apply_pack: AiRunType.APPLY_PACK,
      job_match: AiRunType.JOB_MATCH,
      resume_review: AiRunType.RESUME_REVIEW,
    };

    const count = await prisma.aiRun.count({
      where: {
        userId,
        runType: typeMap[run_type],
        createdAt: { gte: startOfDay },
        // Only count completed/partial runs (not blocked/failed)
        status: { in: ["COMPLETE", "PARTIAL"] as any },
      },
    });

    if (count >= limit) {
      logger.warn({ userId: userId.slice(0, 8), run_type, count, limit }, "[quota] daily limit exceeded");
      res.status(429).json({
        error: "daily_quota_exceeded",
        message: `You have reached the daily limit of ${limit} ${run_type.replace("_", " ")} runs. Resets at midnight UTC.`,
        quota: { used: count, limit, run_type, resets: "midnight UTC" },
      });
      return;
    }

    next();
  } catch (err) {
    // Quota check failure is non-fatal — let the request through
    logger.warn({ err }, "[quota] check failed (non-fatal), proceeding");
    next();
  }
}
