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
import { runJobStaleCheckCycle, STALE_CHECK_INTERVAL_MS } from "./job-stale-check.js";
import { runApplyClickoutNudgeCycle, APPLY_CLICKOUT_NUDGE_INTERVAL_MS } from "./apply-clickout-nudge.js";
import { runApplyStuckMonitorCycle, APPLY_STUCK_MONITOR_INTERVAL_MS } from "./apply-stuck-monitor.js";
import { startApplyBatchWorker } from "./apply-batch-worker.js";
import { startApplyEmailWorker } from "./apply-email-worker.js";
import { startApplyAtsWorker } from "./apply-ats-worker.js";
import { runOperationalSnapshotCycle } from "./operational-snapshot.js";
import { runBillingReconciliationWorker } from "./billing-reconciliation.js";
import { runCandidateRetentionWorker } from "./candidate-retention.js";
import { runSemanticIndexWorker } from "./semantic-indexer.js";
import { runSkillsJobEmbedder } from "./skills-job-embedder.js";
import { pushDeadLetter, recordWorkerState, withRetry } from "../lib/ops/resilience.js";
import { recordOpsEvent } from "../lib/ops/events.js";

const AGGREGATOR_INTERVAL_MS = (() => {
  const intervalMinutesRaw = process.env.AGGREGATOR_INTERVAL_MINUTES;
  if (intervalMinutesRaw) {
    const minutes = Number.parseInt(intervalMinutesRaw, 10);
    if (!Number.isNaN(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
  }

  return parseInt(process.env.AGGREGATOR_INTERVAL_HOURS || "6", 10) * 60 * 60 * 1000;
})();
const MATCHER_INTERVAL_MS = parseInt(process.env.MATCHER_INTERVAL_MINUTES || "30", 10) * 60 * 1000;
const ALERT_INTERVAL_MS = parseInt(process.env.ALERT_INTERVAL_MINUTES || "15", 10) * 60 * 1000;
const OPS_SNAPSHOT_INTERVAL_MS = parseInt(process.env.OPS_SNAPSHOT_INTERVAL_MINUTES || "15", 10) * 60 * 1000;
const BILLING_RECONCILIATION_INTERVAL_MS = parseInt(process.env.BILLING_RECONCILIATION_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;
const CANDIDATE_RETENTION_INTERVAL_MS =
  parseInt(process.env.CANDIDATE_RETENTION_INTERVAL_HOURS || "12", 10) * 60 * 60 * 1000;
const SEMANTIC_INDEX_INTERVAL_MS = parseInt(process.env.SEMANTIC_INDEX_INTERVAL_HOURS || "12", 10) * 60 * 60 * 1000;

const LOCK_TTL_SECONDS = 300; // 5 min lock

const isTest = process.env.NODE_ENV === "test";
const isE2E = process.env.E2E === "1";
const isSchedulerDisabled = process.env.DISABLE_SCHEDULER === "1" || isE2E;

type IntervalRef = ReturnType<typeof setInterval>;

const intervals: IntervalRef[] = [];

async function acquireLock(key: string): Promise<boolean> {
  if (!redisClient) return true; // no Redis = single instance, always proceed
  try {
    const result = await redisClient.set(`lock:${key}`, "1", "EX", LOCK_TTL_SECONDS, "NX");
    return result === "OK";
  } catch {
    return true; // fail-open
  }
}

async function releaseLock(key: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(`lock:${key}`);
  } catch {
    // non-fatal
  }
}

async function safeRun(name: string, fn: () => Promise<void>): Promise<void> {
  const locked = await acquireLock(name);
  if (!locked) {
    logger.debug({ task: name }, "[scheduler] skipped — another instance holds the lock");
    return;
  }

  const start = Date.now();
  const startedAtIso = new Date(start).toISOString();
  try {
    logger.info({ task: name }, "[scheduler] starting task");
    await withRetry(fn, {
      operationName: `scheduler_${name}`,
      attempts: 3,
      initialDelayMs: 1_000,
      shouldRetry: (error) => {
        if (
          name === "aggregator" &&
          error instanceof Error &&
          error.message.includes("ingestion cycle failed")
        ) {
          // Ingestion policy failures are deterministic for the cycle and should
          // alert immediately, not fan out into noisy rapid retries.
          return false;
        }
        return true;
      },
    });
    const durationMs = Date.now() - start;
    logger.info({ task: name, durationMs }, "[scheduler] task complete");
    await recordWorkerState(name, {
      status: "success",
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      durationMs,
    });
    recordOpsEvent({
      metricName: "scheduler_task_success",
      category: "scheduler",
      details: {
        task: name,
      },
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error({ task: name, err, durationMs }, "[scheduler] task failed");
    await recordWorkerState(name, {
      status: "failed",
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      durationMs,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await pushDeadLetter({
      category: "scheduler",
      source: name,
      reasonCode: "scheduler_task_failed",
      error: err,
      payload: {
        durationMs,
      },
    });
    recordOpsEvent({
      metricName: "scheduler_task_failure",
      category: "scheduler",
      outcome: "failure",
      severity: "warning",
      details: {
        task: name,
      },
    });
  } finally {
    await releaseLock(name);
  }
}

export function startScheduler(): void {
  if (isTest || isSchedulerDisabled) {
    logger.info("[scheduler] disabled (test/env flag)");
    return;
  }

  logger.info(
    {
      aggregatorIntervalHours: AGGREGATOR_INTERVAL_MS / 3600000,
      aggregatorIntervalMinutes: AGGREGATOR_INTERVAL_MS / 60000,
      matcherIntervalMinutes: MATCHER_INTERVAL_MS / 60000,
      alertIntervalMinutes: ALERT_INTERVAL_MS / 60000,
      opsSnapshotIntervalMinutes: OPS_SNAPSHOT_INTERVAL_MS / 60000,
      billingReconciliationIntervalHours: BILLING_RECONCILIATION_INTERVAL_MS / 3600000,
      candidateRetentionIntervalHours: CANDIDATE_RETENTION_INTERVAL_MS / 3600000,
      semanticIndexIntervalHours: SEMANTIC_INDEX_INTERVAL_MS / 3600000,
    },
    "[scheduler] starting proactive agent scheduler"
  );

  // Run aggregator immediately on boot (after a brief delay for DB warmup),
  // then on the configured interval.
  const bootDelay = setTimeout(() => {
    void safeRun("aggregator", runAggregatorCycle);
  }, 15_000);
  intervals.push(bootDelay as unknown as IntervalRef);

  intervals.push(
    setInterval(() => void safeRun("aggregator", runAggregatorCycle), AGGREGATOR_INTERVAL_MS)
  );

  intervals.push(
    setInterval(() => void safeRun("job-matcher", runJobMatcherCycle), MATCHER_INTERVAL_MS)
  );

  intervals.push(
    setInterval(() => void safeRun("alert-dispatch", runAlertDispatchCycle), ALERT_INTERVAL_MS)
  );

  intervals.push(
    setInterval(() => void safeRun("ops-snapshot", runOperationalSnapshotCycle), OPS_SNAPSHOT_INTERVAL_MS)
  );

  intervals.push(
    setInterval(
      () => void safeRun("billing-reconciliation", runBillingReconciliationWorker),
      BILLING_RECONCILIATION_INTERVAL_MS,
    )
  );

  intervals.push(
    setInterval(
      () => void safeRun("candidate-retention", runCandidateRetentionWorker),
      CANDIDATE_RETENTION_INTERVAL_MS,
    ),
  );

  intervals.push(
    setInterval(
      () => void safeRun("semantic-index", runSemanticIndexWorker),
      SEMANTIC_INDEX_INTERVAL_MS,
    ),
  );

  intervals.push(
    setInterval(() => void safeRun("auto-apply", runAutoApplyCycle), AUTO_APPLY_INTERVAL_MS)
  );

  // Daily cleanup of stale/expired job listings
  intervals.push(
    setInterval(() => void safeRun("job-cleanup", runJobCleanupCycle), CLEANUP_INTERVAL_MS)
  );

  // §4.4 — hourly stale-check sweep over the AGING batch.
  intervals.push(
    setInterval(
      () => void safeRun("job-stale-check", async () => {
        await runJobStaleCheckCycle();
      }),
      STALE_CHECK_INTERVAL_MS,
    )
  );

  // §5.6 — hourly apply-clickout nudge: 24h reminder + 7d timeout.
  intervals.push(
    setInterval(
      () => void safeRun("apply-clickout-nudge", async () => {
        await runApplyClickoutNudgeCycle();
      }),
      APPLY_CLICKOUT_NUDGE_INTERVAL_MS,
    )
  );

  // §5.8 — hourly stuck-application monitor (DLQ surrogate).
  intervals.push(
    setInterval(
      () => void safeRun("apply-stuck-monitor", async () => {
        await runApplyStuckMonitorCycle();
      }),
      APPLY_STUCK_MONITOR_INTERVAL_MS,
    )
  );

  // §5.8 — BullMQ apply-batch consumer (no-op when APPLY_QUEUES_ENABLED=0).
  startApplyBatchWorker();
  // PR Q — Track B (EMAIL_DRAFT) sender (no-op when APPLY_QUEUES_ENABLED=0).
  startApplyEmailWorker();
  // PR S — Track A (ATS_API_*) submitter (no-op when APPLY_QUEUES_ENABLED=0).
  startApplyAtsWorker();

  const opsDelay = setTimeout(() => {
    void safeRun("ops-snapshot", runOperationalSnapshotCycle);
  }, 30_000);
  intervals.push(opsDelay as unknown as IntervalRef);

  const billingDelay = setTimeout(() => {
    void safeRun("billing-reconciliation", runBillingReconciliationWorker);
  }, 60_000);
  intervals.push(billingDelay as unknown as IntervalRef);

  const retentionDelay = setTimeout(() => {
    void safeRun("candidate-retention", runCandidateRetentionWorker);
  }, 90_000);
  intervals.push(retentionDelay as unknown as IntervalRef);

  const semanticDelay = setTimeout(() => {
    void safeRun("semantic-index", runSemanticIndexWorker);
  }, 120_000);
  intervals.push(semanticDelay as unknown as IntervalRef);

  // Skills job embedder: runs every 6 hours (same cadence as aggregator)
  // so newly scraped jobs are embedded for the Job Matcher skill promptly.
  const SKILLS_EMBED_INTERVAL_MS = parseInt(
    process.env.SKILLS_EMBED_INTERVAL_HOURS || "6", 10
  ) * 60 * 60 * 1000;

  intervals.push(
    setInterval(
      () => void safeRun("skills-job-embedder", runSkillsJobEmbedder),
      SKILLS_EMBED_INTERVAL_MS,
    )
  );

  // Run embedder at boot+150s (after aggregator has had a chance to run)
  const skillsEmbedDelay = setTimeout(() => {
    void safeRun("skills-job-embedder", runSkillsJobEmbedder);
  }, 150_000);
  intervals.push(skillsEmbedDelay as unknown as IntervalRef);

  // NOTE: weekly blog automation is intentionally NOT scheduled here. Its
  // canonical trigger is the blog-automation Lambda (EventBridge cron, Mondays
  // 09:00 UTC). An in-process interval here would race the Lambda and produce
  // duplicate weekly drafts whenever both are enabled.
}

export function stopScheduler(): void {
  for (const ref of intervals) {
    clearInterval(ref);
    clearTimeout(ref as unknown as ReturnType<typeof setTimeout>);
  }
  intervals.length = 0;
  logger.info("[scheduler] stopped");
}
