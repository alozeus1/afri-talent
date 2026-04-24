// Per-user daily apply_pack quota + monthly free-tier skill quota
// Uses Prisma to count runs for the user
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { AiRunType, SubscriptionPlan } from "@prisma/client";
// Configurable daily limits
const DAILY_APPLY_PACK_LIMIT = parseInt(process.env.DAILY_APPLY_PACK_LIMIT || "5", 10);
const DAILY_JOB_MATCH_LIMIT = parseInt(process.env.DAILY_JOB_MATCH_LIMIT || "20", 10);
const DAILY_RESUME_REVIEW_LIMIT = parseInt(process.env.DAILY_RESUME_REVIEW_LIMIT || "10", 10);
const LIMITS = {
    apply_pack: DAILY_APPLY_PACK_LIMIT,
    job_match: DAILY_JOB_MATCH_LIMIT,
    resume_review: DAILY_RESUME_REVIEW_LIMIT,
};
export async function checkDailyQuota(req, res, next) {
    const run_type = req.body?.run_type;
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
    const aiRunModel = prisma.aiRun;
    if (!aiRunModel?.count) {
        next();
        return;
    }
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const typeMap = {
            apply_pack: AiRunType.APPLY_PACK,
            job_match: AiRunType.JOB_MATCH,
            resume_review: AiRunType.RESUME_REVIEW,
        };
        const count = await aiRunModel.count({
            where: {
                userId,
                runType: typeMap[run_type],
                createdAt: { gte: startOfDay },
                // Only count completed/partial runs (not blocked/failed)
                status: { in: ["COMPLETE", "PARTIAL"] },
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
    }
    catch (err) {
        // Quota check failure is non-fatal — let the request through
        logger.warn({ err }, "[quota] check failed (non-fatal), proceeding");
        next();
    }
}
/**
 * Monthly free-tier skill quota middleware factory.
 * FREE plan users are limited to `freeLimit` uses per calendar month.
 * BASIC+ users are unlimited.
 */
export function makeMonthlySkillQuota(runType, freeLimit) {
    return async (req, res, next) => {
        const userId = req.user?.userId;
        if (!userId) {
            next();
            return;
        }
        try {
            const sub = await prisma.subscription?.findFirst({
                where: { userId },
                select: { plan: true, status: true },
            });
            const plan = sub?.plan ?? SubscriptionPlan.FREE;
            // BASIC and PROFESSIONAL have unlimited access
            if (plan !== SubscriptionPlan.FREE) {
                next();
                return;
            }
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const aiRunModel = prisma.aiRun;
            if (!aiRunModel?.count) {
                next();
                return;
            }
            const count = await aiRunModel.count({
                where: {
                    userId,
                    runType,
                    createdAt: { gte: startOfMonth },
                    status: { in: ["COMPLETE", "PARTIAL"] },
                },
            });
            if (count >= freeLimit) {
                res.status(429).json({
                    error: "monthly_quota_exceeded",
                    message: `Free tier includes ${freeLimit} uses per month for this feature. Upgrade to Professional for unlimited access.`,
                    quota: { used: count, limit: freeLimit, plan: "FREE", resets: "1st of next month" },
                });
                return;
            }
            next();
        }
        catch {
            // Quota check failure is non-fatal
            next();
        }
    };
}
/**
 * Fire-and-forget helper to record a completed skill AI run.
 * Call with `void recordSkillRun(...)` — never await in request path.
 */
export async function recordSkillRun(userId, runType) {
    try {
        const aiRunModel = prisma.aiRun;
        if (!aiRunModel?.create)
            return;
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
    }
    catch {
        // non-fatal — ignore
    }
}
//# sourceMappingURL=quotas.js.map