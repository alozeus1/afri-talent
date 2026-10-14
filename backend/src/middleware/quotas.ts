// Per-user daily apply_pack quota + monthly free-tier skill quota
// Uses Prisma to count runs for the user

import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { AiRunType, SubscriptionPlan } from "@prisma/client";
import { getUserEntitlements } from "../lib/billing/entitlements.js";
import { freeModeMonthlySkillLimit, isFreeMode } from "../lib/billing/free-mode.js";

// Configurable daily limits
const DAILY_APPLY_PACK_LIMIT = parseInt(process.env.DAILY_APPLY_PACK_LIMIT || "5", 10);
const DAILY_JOB_MATCH_LIMIT = parseInt(process.env.DAILY_JOB_MATCH_LIMIT || "20", 10);
const DAILY_RESUME_REVIEW_LIMIT = parseInt(process.env.DAILY_RESUME_REVIEW_LIMIT || "10", 10);

// In-flight (RUNNING) runs younger than this count toward the daily quota.
const RUNNING_WINDOW_MS = 15 * 60 * 1000;

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

  const aiRunModel = (prisma as typeof prisma & {
    aiRun?: { count?: (args: unknown) => Promise<number> };
  }).aiRun;

  if (!aiRunModel?.count) {
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

    // Runs still in flight are counted too (if started in the last
    // RUNNING_WINDOW_MS) so concurrent requests cannot all pass the check
    // before any of them completes. Older RUNNING rows are treated as stale.
    const runningSince = new Date(Date.now() - RUNNING_WINDOW_MS);
    const count = await aiRunModel.count({
      where: {
        userId,
        runType: typeMap[run_type],
        createdAt: { gte: startOfDay },
        // Count completed/partial runs plus recent in-flight runs (not blocked/failed)
        OR: [
          { status: { in: ["COMPLETE", "PARTIAL"] as any } },
          { status: "RUNNING" as any, createdAt: { gte: runningSince } },
        ],
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

/**
 * Monthly free-tier skill quota middleware factory.
 * FREE plan users are limited to `freeLimit` uses per calendar month.
 * Users with an ACTIVE paid plan (resolved via getUserEntitlements) are
 * unlimited. In FREE_MODE everyone gets the same cost-safety cap
 * (FREE_MODE_MONTHLY_SKILL_LIMIT, default 30) with neutral copy.
 */
export function makeMonthlySkillQuota(runType: AiRunType, freeLimit: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) { next(); return; }

    try {
      const freeMode = isFreeMode();
      const limit = freeMode ? freeModeMonthlySkillLimit() : freeLimit;

      if (!freeMode) {
        // getUserEntitlements whitelists ACTIVE subscriptions; anything else
        // (PAST_DUE, CANCELLED, INACTIVE, no row) resolves to FREE.
        const { plan } = await getUserEntitlements(userId);
        const hasPaidPlan = plan !== SubscriptionPlan.FREE && plan !== SubscriptionPlan.EMPLOYER_FREE;
        if (hasPaidPlan) { next(); return; }
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const aiRunModel = (prisma as any).aiRun;
      if (!aiRunModel?.count) { next(); return; }

      const count = await aiRunModel.count({
        where: {
          userId,
          runType,
          createdAt: { gte: startOfMonth },
          status: { in: ["COMPLETE", "PARTIAL"] },
        },
      });

      if (count >= limit) {
        res.status(429).json({
          error: "monthly_quota_exceeded",
          message: freeMode
            ? "Monthly limit reached for this tool. It resets on the 1st."
            : `Free tier includes ${limit} uses per month for this feature. Upgrade to Professional for unlimited access.`,
          quota: freeMode
            ? { used: count, limit, resets: "1st of next month" }
            : { used: count, limit, plan: "FREE", resets: "1st of next month" },
        });
        return;
      }

      next();
    } catch {
      // Quota check failure is non-fatal
      next();
    }
  };
}

/**
 * Fire-and-forget helper to record a completed skill AI run.
 * Call with `void recordSkillRun(...)` — never await in request path.
 */
export async function recordSkillRun(userId: string, runType: AiRunType): Promise<void> {
  try {
    const aiRunModel = (prisma as any).aiRun;
    if (!aiRunModel?.create) return;
    await aiRunModel.create({
      data: {
        runId: `${runType.toLowerCase()}-${userId.slice(0, 8)}-${Date.now()}`,
        userId,
        runType,
        status: "COMPLETE",
        tokenBudgetTotal: 0,
        tokenBudgetUsed: 0,
      },
    });
  } catch {
    // non-fatal — ignore
  }
}
