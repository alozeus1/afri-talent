// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry — blog-automation (EventBridge weekly trigger)
//
// Native handler (no Express). Invoked weekly by an EventBridge rule
// (cron(0 9 ? * MON *), UTC) to run the blog pipeline that sources content,
// fact-checks it, drafts a post, and persists a Resource + AdminReview record
// awaiting human approval at /admin/blog.
//
// Defense in depth: this handler checks BLOG_AUTOMATION_ENABLED at runtime so
// the SSM toggle ("0" → off, "1"/"true" → on) can flip the automation off
// without redeploying the Terraform target. TF stays applied; SSM flip is the
// operational switch.
//
// Event contract:
//   EventBridge scheduled event. We do not inspect the event payload — the
//   trigger source is the schedule itself.
//
// Output:
//   { statusCode: 200, body: { ... } } on success or no-op.
//   Hard pipeline failures throw so EventBridge retry semantics apply.
//
// Env contract (set by Terraform; values sourced from SSM at cold start):
//   BLOG_AUTOMATION_ENABLED       — "1"/"true" enables run; anything else = no-op
//   ANTHROPIC_API_KEY             — required for blog writer + fact-check agents
//   DATABASE_URL                  — RDS Proxy endpoint for Prisma writes
//   NEWS_API_KEY                  — content source
//   UNSPLASH_ACCESS_KEY           — image sourcing (optional)
//   PEXELS_API_KEY                — image sourcing fallback (optional)
//   BLOG_ADMIN_NOTIFICATION_EMAIL — admin notify target (optional)
//   SES_FROM_EMAIL, SES_REGION    — admin notify transport (optional)
//   FRONTEND_URL                  — used in notify email link to /admin/blog
//   LANGGRAPH_ENABLED + LANGGRAPH_BLOG_AUTOMATION — both "1" routes the run
//     through the blog_automation graph (audit trail + idempotent publish)
// ─────────────────────────────────────────────────────────────────────────────

import type { Context } from "aws-lambda";
import { runBlogPipeline } from "../lib/blog/pipeline.js";
import {
  isBlogGraphActive,
  runBlogPipelineViaGraph,
} from "../lib/ai/langgraph/integration/blogAutomationAdapter.js";
import logger from "../lib/logger.js";

const log = logger.child({ lambda: "blog-automation" });

function isFlagEnabled(): boolean {
  const raw = (process.env.BLOG_AUTOMATION_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

export interface BlogAutomationResponse {
  statusCode: number;
  body: {
    triggered: boolean;
    flagEnabled: boolean;
    success?: boolean;
    resourceId?: string;
    title?: string;
    skippedReason?: string;
    durationMs?: number;
    rawContentCount?: number;
    verifiedContentCount?: number;
  };
}

export const handler = async (
  _event: unknown,
  context: Context,
): Promise<BlogAutomationResponse> => {
  const flagEnabled = isFlagEnabled();

  log.info(
    {
      lambda_request_id: context.awsRequestId,
      trigger_source: "eventbridge",
      flag_enabled: flagEnabled,
    },
    "[lambda blog-automation] invoked",
  );

  if (!flagEnabled) {
    log.info("[lambda blog-automation] BLOG_AUTOMATION_ENABLED not set — no-op exit");
    return {
      statusCode: 200,
      body: { triggered: false, flagEnabled: false },
    };
  }

  // LANGGRAPH_ENABLED=1 + LANGGRAPH_BLOG_AUTOMATION=1 routes the run through
  // the blog_automation graph (GraphRun audit + idempotent approval/publish);
  // otherwise the direct pipeline runs unchanged.
  const viaGraph = isBlogGraphActive();
  const result = viaGraph ? await runBlogPipelineViaGraph() : await runBlogPipeline();

  log.info(
    {
      via_graph: viaGraph,
      success: result.success,
      resource_id: result.resourceId,
      title: result.title,
      skipped_reason: result.skippedReason,
      raw_content_count: result.rawContentCount,
      verified_content_count: result.verifiedContentCount,
      duration_ms: result.durationMs,
    },
    "[lambda blog-automation] pipeline returned",
  );

  if (!result.success && result.error) {
    // Hard failure (pipeline caller-level error). Throw so EventBridge retry
    // policy kicks in. Soft failures (skippedReason — e.g. no content found,
    // all content failed fact-check) are returned 200 and not retried.
    throw new Error(`blog pipeline failed: ${result.error}`);
  }

  return {
    statusCode: 200,
    body: {
      triggered: true,
      flagEnabled: true,
      success: result.success,
      resourceId: result.resourceId,
      title: result.title,
      skippedReason: result.skippedReason,
      durationMs: result.durationMs,
      rawContentCount: result.rawContentCount,
      verifiedContentCount: result.verifiedContentCount,
    },
  };
};
