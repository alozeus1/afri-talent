// ─────────────────────────────────────────────────────────────────────────────
// Proactive Agent Scheduler
//
// Runs background tasks on configurable intervals:
//   1. Job aggregation (crawl external boards)
//   2. Job matching (score new jobs against saved searches / profiles)
//   3. Alert dispatch (send notifications + emails for matches)
//
// Designed for single-process deployment (App Runner / ECS).
// Uses a simple distributed lock via Redis when available so multiple
// replicas don't duplicate work.
// ─────────────────────────────────────────────────────────────────────────────
import logger from "../lib/logger.js";
import { redisClient } from "../lib/redis.js";
import { runAggregatorCycle } from "./aggregator-cron.js";
import { runJobMatcherCycle } from "./job-matcher.js";
import { runAlertDispatchCycle } from "./alert-sender.js";
import { runAutoApplyCycle, AUTO_APPLY_INTERVAL_MS } from "./auto-apply.js";
import { runJobCleanupCycle, CLEANUP_INTERVAL_MS } from "./job-cleanup.js";
const AGGREGATOR_INTERVAL_MS = parseInt(process.env.AGGREGATOR_INTERVAL_HOURS || "6", 10) * 60 * 60 * 1000;
const MATCHER_INTERVAL_MS = parseInt(process.env.MATCHER_INTERVAL_MINUTES || "30", 10) * 60 * 1000;
const ALERT_INTERVAL_MS = parseInt(process.env.ALERT_INTERVAL_MINUTES || "15", 10) * 60 * 1000;
const LOCK_TTL_SECONDS = 300; // 5 min lock
const isTest = process.env.NODE_ENV === "test";
const isSchedulerDisabled = process.env.DISABLE_SCHEDULER === "1";
const intervals = [];
async function acquireLock(key) {
    if (!redisClient)
        return true; // no Redis = single instance, always proceed
    try {
        const result = await redisClient.set(`lock:${key}`, "1", "EX", LOCK_TTL_SECONDS, "NX");
        return result === "OK";
    }
    catch {
        return true; // fail-open
    }
}
async function releaseLock(key) {
    if (!redisClient)
        return;
    try {
        await redisClient.del(`lock:${key}`);
    }
    catch {
        // non-fatal
    }
}
async function safeRun(name, fn) {
    const locked = await acquireLock(name);
    if (!locked) {
        logger.debug({ task: name }, "[scheduler] skipped — another instance holds the lock");
        return;
    }
    const start = Date.now();
    try {
        logger.info({ task: name }, "[scheduler] starting task");
        await fn();
        logger.info({ task: name, durationMs: Date.now() - start }, "[scheduler] task complete");
    }
    catch (err) {
        logger.error({ task: name, err, durationMs: Date.now() - start }, "[scheduler] task failed");
    }
    finally {
        await releaseLock(name);
    }
}
export function startScheduler() {
    if (isTest || isSchedulerDisabled) {
        logger.info("[scheduler] disabled (test/env flag)");
        return;
    }
    logger.info({
        aggregatorIntervalHours: AGGREGATOR_INTERVAL_MS / 3600000,
        matcherIntervalMinutes: MATCHER_INTERVAL_MS / 60000,
        alertIntervalMinutes: ALERT_INTERVAL_MS / 60000,
    }, "[scheduler] starting proactive agent scheduler");
    // Run aggregator immediately on boot (after a brief delay for DB warmup),
    // then on the configured interval.
    const bootDelay = setTimeout(() => {
        void safeRun("aggregator", runAggregatorCycle);
    }, 15_000);
    intervals.push(bootDelay);
    intervals.push(setInterval(() => void safeRun("aggregator", runAggregatorCycle), AGGREGATOR_INTERVAL_MS));
    intervals.push(setInterval(() => void safeRun("job-matcher", runJobMatcherCycle), MATCHER_INTERVAL_MS));
    intervals.push(setInterval(() => void safeRun("alert-dispatch", runAlertDispatchCycle), ALERT_INTERVAL_MS));
    intervals.push(setInterval(() => void safeRun("auto-apply", runAutoApplyCycle), AUTO_APPLY_INTERVAL_MS));
    // Daily cleanup of stale/expired job listings
    intervals.push(setInterval(() => void safeRun("job-cleanup", runJobCleanupCycle), CLEANUP_INTERVAL_MS));
}
export function stopScheduler() {
    for (const ref of intervals) {
        clearInterval(ref);
        clearTimeout(ref);
    }
    intervals.length = 0;
    logger.info("[scheduler] stopped");
}
//# sourceMappingURL=scheduler.js.map