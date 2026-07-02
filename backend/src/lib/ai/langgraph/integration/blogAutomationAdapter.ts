// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — blog automation adapter (rollout wiring)
//
// Routes the existing 5-agent blog pipeline through the blog_automation graph
// so weekly runs gain: a GraphRun audit trail, a checkpointed human-approval
// interrupt, and an idempotent publish (runOnce). The agents, persistence, and
// admin notification are the exact same code the direct pipeline uses.
//
// Double opt-in: active only when LANGGRAPH_ENABLED=1 AND
// LANGGRAPH_BLOG_AUTOMATION=1. Flag off = callers use runBlogPipeline()
// unchanged. Approval resume is best-effort — a graph failure never blocks the
// admin's direct publish path.
//
// The graph module is imported lazily so cold starts (Lambda) pay nothing for
// LangGraph when the flag is off.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import logger from "../../../logger.js";
import { withRetry, pushDeadLetter } from "../../../ops/resilience.js";
import { ContentSourceAgent } from "../../../blog/agents/content-source-agent.js";
import { FactCheckAgent } from "../../../blog/agents/fact-check-agent.js";
import { BlogWriterAgent } from "../../../blog/agents/blog-writer-agent.js";
import { ImageSourcerAgent } from "../../../blog/agents/image-sourcer.js";
import { persistDraft, notifyAdmin } from "../../../blog/pipeline.js";
import { CREDIBILITY_WHITELIST } from "../../../blog/types.js";
import type {
  BlogPipelineResult,
  DraftPost,
  RawContent,
  VerifiedContent,
} from "../../../blog/types.js";

const log = logger.child({ adapter: "blog-automation-graph" });

const GRAPH_RUN_ID_PREFIX = "blog:";

/**
 * Explicit double opt-in for the first rollout: the global LangGraph switch
 * must be on (it bootstraps the checkpointer + event sink) AND the per-graph
 * flag must be explicitly "1" — unlike wired graphs that default on with the
 * global flag.
 */
export function isBlogGraphActive(): boolean {
  return (
    process.env.LANGGRAPH_ENABLED === "1" &&
    process.env.LANGGRAPH_BLOG_AUTOMATION === "1"
  );
}

export interface BlogApprovalInput {
  approved: boolean;
  adminId: string;
  notes?: string;
}

/**
 * Run the weekly pipeline through the blog_automation graph. Returns the same
 * BlogPipelineResult shape as runBlogPipeline() so callers log identically.
 */
export async function runBlogPipelineViaGraph(): Promise<BlogPipelineResult> {
  const start = Date.now();
  const weekOf = new Date();
  const runKey = `weekly-${weekOf.toISOString().slice(0, 10)}`;

  // Closure state threads agent outputs between graph nodes.
  let raw: RawContent[] = [];
  let verified: VerifiedContent[] = [];
  let draft: DraftPost | undefined;
  let coverImage: string | null = null;

  const { startBlogAutomation } = await import("../graphs/blogAutomation.graph.js");

  const deps = {
    sourceContent: async () => {
      raw = await withRetry(() => ContentSourceAgent(weekOf), {
        operationName: "blog_content_source",
        attempts: 2,
        initialDelayMs: 2_000,
      });
      return raw.length;
    },
    factCheck: async () => {
      verified = await withRetry(() => FactCheckAgent(raw), {
        operationName: "blog_fact_check",
        attempts: 2,
        initialDelayMs: 2_000,
      });
      return verified.map((v) => ({
        domain: v.sourceDomain,
        credibilityScore: v.credibilityScore,
        whitelisted: CREDIBILITY_WHITELIST.has(v.sourceDomain),
      }));
    },
    writePost: async () => {
      draft = await withRetry(() => BlogWriterAgent(verified, weekOf), {
        operationName: "blog_writer",
        attempts: 2,
        initialDelayMs: 3_000,
      });
      coverImage = await ImageSourcerAgent(draft.topicKeywords).catch((err) => {
        log.warn({ err }, "[blog-graph] image sourcing failed — continuing without image");
        return null;
      });
      return { draftRef: draft.slug, sourceRefs: verified.map((v) => v.url) };
    },
    createDraft: async () => {
      const resource = await persistDraft(
        draft as DraftPost,
        coverImage,
        verified.length,
      );
      await notifyAdmin(resource.id, (draft as DraftPost).title);
      return resource.id;
    },
    // Publish is reached only through the approval interrupt; updateMany keeps
    // it idempotent even if the admin route already published directly.
    publish: async (resourceId: string) => {
      await prisma.resource.updateMany({
        where: { id: resourceId, published: false },
        data: { published: true, publishedAt: new Date() },
      });
    },
    recordEvent: async (
      resourceId: string,
      type: string,
      details: Record<string, string | number | boolean>,
    ) => {
      log.info({ resourceId, type, ...details }, "[blog-graph] audit event");
    },
  };

  try {
    const result = await startBlogAutomation(runKey, deps);
    const durationMs = Date.now() - start;

    if (result.status === "AWAITING_ADMIN") {
      log.info(
        { graphRunId: result.graphRunId, resourceId: result.review.resourceId, durationMs },
        "[blog-graph] draft created — awaiting admin approval",
      );
      return {
        success: true,
        resourceId: result.review.resourceId,
        title: draft?.title,
        rawContentCount: raw.length,
        verifiedContentCount: verified.length,
        durationMs,
      };
    }

    const skippedReason =
      result.outcome === "no_content"
        ? "No relevant content found from any source"
        : result.outcome === "low_credibility"
          ? "All sourced content failed fact-check credibility threshold"
          : undefined;

    log.warn({ outcome: result.outcome, durationMs }, "[blog-graph] run ended without draft");
    return {
      success: false,
      skippedReason,
      rawContentCount: raw.length,
      verifiedContentCount: verified.length,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    log.error({ err, runKey }, "[blog-graph] graph run failed");
    await pushDeadLetter({
      category: "scheduler",
      source: "blog-graph",
      reasonCode: "blog_graph_run_failed",
      error: err,
      payload: { runKey },
    });
    return {
      success: false,
      error: String(err),
      rawContentCount: raw.length,
      verifiedContentCount: verified.length,
      durationMs,
    };
  }
}

/**
 * Find the interrupted graph run that created this resource. The graph emits
 * human_approval_requested with details.resource_id — an exact match on that
 * event is REQUIRED. No fallback: resuming "the newest pending blog run" could
 * publish an unrelated draft when the admin is approving a legacy-path post,
 * bypassing that draft's own approval gate. If the event row is missing (its
 * persistence is best-effort), we skip the resume and the direct path stays
 * authoritative; the graph run simply remains open for audit.
 */
async function findGraphRunIdForResource(resourceId: string): Promise<string | null> {
  const evt = await prisma.graphRunEvent.findFirst({
    where: {
      type: "human_approval_requested",
      details: { path: ["resource_id"], equals: resourceId },
    },
    orderBy: { createdAt: "desc" },
    select: { graphRunId: true },
  });
  return evt?.graphRunId ?? null;
}

/**
 * Resume the interrupted graph with the admin's decision. Best-effort: returns
 * true when the graph handled the decision, false when no matching run exists
 * or the resume failed — the caller's direct path remains authoritative.
 */
export async function resumeBlogApprovalViaGraph(
  resourceId: string,
  decision: BlogApprovalInput,
): Promise<boolean> {
  try {
    const graphRunId = await findGraphRunIdForResource(resourceId);
    if (!graphRunId || !graphRunId.startsWith(GRAPH_RUN_ID_PREFIX)) {
      log.info({ resourceId }, "[blog-graph] no interrupted graph run found — skipping resume");
      return false;
    }
    const runKey = graphRunId.slice(GRAPH_RUN_ID_PREFIX.length);

    const { resumeBlogAutomation } = await import("../graphs/blogAutomation.graph.js");

    // Only publish/recordEvent are reachable on resume; earlier nodes replay
    // from the checkpoint.
    const unreachable = () => {
      throw new Error("[blog-graph] node not reachable on resume");
    };
    const result = await resumeBlogAutomation(runKey, decision, {
      sourceContent: unreachable,
      factCheck: unreachable,
      writePost: unreachable,
      createDraft: unreachable,
      publish: async (id: string) => {
        await prisma.resource.updateMany({
          where: { id, published: false },
          data: { published: true, publishedAt: new Date() },
        });
      },
      recordEvent: async (id, type, details) => {
        log.info({ resourceId: id, type, ...details }, "[blog-graph] audit event");
      },
    }, { graphRunId });

    log.info(
      { resourceId, graphRunId, outcome: result.status === "COMPLETE" ? "published" : "blocked" },
      "[blog-graph] approval resumed through graph",
    );
    return true;
  } catch (err) {
    log.warn({ err, resourceId }, "[blog-graph] resume failed — direct path remains authoritative");
    return false;
  }
}
