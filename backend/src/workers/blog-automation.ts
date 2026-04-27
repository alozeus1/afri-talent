// ─────────────────────────────────────────────────────────────────────────────
// Blog Automation Worker
//
// Weekly worker entry point. Called by the scheduler every 7 days.
// Guards on BLOG_AUTOMATION_ENABLED before running the pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import logger from "../lib/logger.js";
import { runBlogPipeline } from "../lib/blog/pipeline.js";
import { recordWorkerState } from "../lib/ops/resilience.js";
import { recordOpsEvent } from "../lib/ops/events.js";

const log = logger.child({ worker: "blog-automation" });

export const BLOG_AUTOMATION_INTERVAL_MS =
  parseInt(process.env.BLOG_AUTOMATION_INTERVAL_DAYS || "7", 10) * 24 * 60 * 60 * 1000;

export async function runBlogAutomationCycle(): Promise<void> {
  if (process.env.BLOG_AUTOMATION_ENABLED !== "1") {
    log.info("[blog-automation] disabled via BLOG_AUTOMATION_ENABLED — skipping");
    return;
  }

  const start = Date.now();
  const startedAt = new Date().toISOString();

  log.info("[blog-automation] starting weekly blog generation cycle");

  try {
    const result = await runBlogPipeline();

    const durationMs = Date.now() - start;

    if (result.success) {
      log.info(
        {
          resourceId: result.resourceId,
          title: result.title,
          rawContentCount: result.rawContentCount,
          verifiedContentCount: result.verifiedContentCount,
          durationMs,
        },
        "[blog-automation] cycle complete — blog post pending admin review"
      );

      await recordWorkerState("blog-automation", {
        status: "success",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
      });

      recordOpsEvent({
        metricName: "blog_automation_success",
        category: "scheduler",
        details: {
          resourceId: result.resourceId,
          rawContentCount: result.rawContentCount,
          verifiedContentCount: result.verifiedContentCount,
        },
      });
    } else {
      const reason = result.skippedReason ?? result.error ?? "unknown";
      log.warn({ reason, durationMs }, "[blog-automation] cycle skipped or failed");

      await recordWorkerState("blog-automation", {
        status: result.skippedReason ? "success" : "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        errorMessage: reason,
      });

      recordOpsEvent({
        metricName: result.skippedReason ? "blog_automation_skipped" : "blog_automation_failure",
        category: "scheduler",
        outcome: result.skippedReason ? undefined : "failure",
        severity: result.skippedReason ? undefined : "warning",
        details: { reason },
      });
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    log.error({ err, durationMs }, "[blog-automation] unexpected error");

    await recordWorkerState("blog-automation", {
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    throw err; // Re-throw so the scheduler's safeRun() can push to dead letter
  }
}
