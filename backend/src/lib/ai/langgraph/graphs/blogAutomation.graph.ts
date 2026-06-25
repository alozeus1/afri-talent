// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — blog automation graph (Phase 7)
//
// Preserves the existing human-in-the-loop: content is sourced, fact-checked,
// written, and saved as Resource(published=false) + AdminReview(PENDING). The
// graph then PAUSES on an admin-approval interrupt and PUBLISHES only after an
// admin approves. Nothing reaches readers without that approval — by
// construction, the publish node is only reachable through the approval gate,
// and the publish side effect is idempotent.
//
// Source-credibility scoring is deterministic (agent score blended with a domain
// whitelist bonus); low-credibility runs are blocked before a draft is created.
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END, interrupt } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins, appendReducer } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import { runOnce } from "../tools/idempotency.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "blog_automation" as const;

export type BlogOutcome = "published" | "rejected" | "no_content" | "low_credibility";

/** A fact-checked source item (PII-free; content is referenced, not stored). */
export interface VerifiedItem {
  domain: string;
  credibilityScore: number; // 0–100 from the fact-check agent
  whitelisted: boolean;
}

export interface BlogApprovalDecision {
  approved: boolean;
  adminId: string;
  notes?: string;
}

export interface BlogAdminReview {
  kind: "blog_admin_review";
  resourceId: string;
  credibilityScore: number;
  sourcesCount: number;
}

export interface BlogAutomationDeps {
  /** Number of raw items sourced (0 → nothing to do). */
  sourceContent: () => Promise<number>;
  /** Fact-check + return items that passed the credibility threshold. */
  factCheck: () => Promise<VerifiedItem[]>;
  /** Write the post from verified sources; returns a draft ref + source refs. */
  writePost: () => Promise<{ draftRef: string; sourceRefs: string[] }>;
  /** Persist Resource(published=false) + AdminReview(PENDING). Returns resourceId. */
  createDraft: (draftRef: string, sourceRefs: string[], credibility: number) => Promise<string>;
  /** Publish the resource (set published=true). Called ONLY after approval. */
  publish: (resourceId: string) => Promise<void>;
  recordEvent: (resourceId: string, type: string, details: Record<string, string | number | boolean>) => Promise<void>;
}

export interface BlogConfig {
  minCredibility: number; // aggregate threshold to proceed to drafting
  whitelistBonus: number;
}

export const DEFAULT_BLOG_CONFIG: BlogConfig = { minCredibility: 60, whitelistBonus: 15 };

const BlogState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  resourceId: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  draftRef: Annotation<string | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  credibilityScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  sourcesCount: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  outcome: Annotation<BlogOutcome | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  sourceRefs: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
});

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Deterministic aggregate credibility: mean agent score + whitelist density bonus. */
export function aggregateCredibility(items: VerifiedItem[], whitelistBonus: number): number {
  if (items.length === 0) return 0;
  const mean = items.reduce((a, b) => a + b.credibilityScore, 0) / items.length;
  const whitelistShare = items.filter((i) => i.whitelisted).length / items.length;
  return clamp(mean + whitelistShare * whitelistBonus);
}

interface Ctx {
  graphRunId: string;
  threadId: string;
}

function buildGraph(deps: BlogAutomationDeps, cfg: BlogConfig, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const graph = new StateGraph(BlogState)
    .addNode("source", async () => {
      const count = await deps.sourceContent();
      if (count === 0) return { outcome: "no_content" as BlogOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "finalize" };
      return { currentStep: "factCheck" };
    })
    .addNode("factCheck", async () => {
      const items = await deps.factCheck();
      const credibility = aggregateCredibility(items, cfg.whitelistBonus);
      evt("node_completed", "factCheck", { sources: items.length, credibility });
      if (items.length === 0 || credibility < cfg.minCredibility) {
        evt("truth_guard_failed", "factCheck", { credibility, sources: items.length });
        return { outcome: "low_credibility" as BlogOutcome, status: "BLOCKED" as GraphRunStatus, currentStep: "finalize", credibilityScore: credibility, sourcesCount: items.length };
      }
      return { credibilityScore: credibility, sourcesCount: items.length, currentStep: "write" };
    })
    .addNode("write", async () => {
      const { draftRef, sourceRefs } = await deps.writePost();
      return { draftRef, sourceRefs, currentStep: "createDraft" };
    })
    .addNode("createDraft", async (s) => {
      const resourceId = await deps.createDraft(s.draftRef as string, s.sourceRefs, s.credibilityScore);
      // Audit: log all sources + fact-check result against the (unpublished) resource.
      await deps.recordEvent(resourceId, "blog_draft_created", {
        credibility: s.credibilityScore,
        sources: s.sourcesCount,
        source_refs: s.sourceRefs.join(","),
      });
      return { resourceId, currentStep: "adminApproval" };
    })
    .addNode("adminApproval", async (s) => {
      evt("human_approval_requested", "adminApproval", { resource_id: s.resourceId ?? null });
      const decision = interrupt({
        kind: "blog_admin_review",
        resourceId: s.resourceId as string,
        credibilityScore: s.credibilityScore,
        sourcesCount: s.sourcesCount,
      } as BlogAdminReview) as BlogApprovalDecision;

      if (!decision.approved) {
        evt("human_approval_denied", "adminApproval", { admin: decision.adminId });
        await deps.recordEvent(s.resourceId as string, "blog_rejected", { admin: decision.adminId });
        return { outcome: "rejected" as BlogOutcome, status: "BLOCKED" as GraphRunStatus, currentStep: "finalize" };
      }
      // Idempotent publish — a replay never double-publishes.
      await runOnce("blog_publish", s.resourceId as string, async () => {
        await deps.publish(s.resourceId as string);
        return s.resourceId as string;
      });
      await deps.recordEvent(s.resourceId as string, "blog_published", { admin: decision.adminId });
      evt("human_approval_granted", "adminApproval", { admin: decision.adminId });
      evt("side_effect_executed", "adminApproval", { resource_id: s.resourceId ?? null });
      return { outcome: "published" as BlogOutcome, status: "COMPLETE" as GraphRunStatus, currentStep: "finalize" };
    })
    .addNode("finalize", async (s) => {
      await updateGraphRun(ctx.graphRunId, { status: s.status, currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { outcome: s.outcome ?? null });
      return {};
    })
    .addEdge(START, "source")
    .addConditionalEdges("source", (s) => (s.outcome === "no_content" ? "finalize" : "factCheck"), { finalize: "finalize", factCheck: "factCheck" })
    .addConditionalEdges("factCheck", (s) => (s.outcome === "low_credibility" ? "finalize" : "write"), { finalize: "finalize", write: "write" })
    .addEdge("write", "createDraft")
    .addEdge("createDraft", "adminApproval")
    .addEdge("adminApproval", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export type BlogAutomationResult =
  | { status: "COMPLETE" | "BLOCKED"; graphRunId: string; outcome?: BlogOutcome; resourceId?: string }
  | { status: "AWAITING_ADMIN"; graphRunId: string; threadId: string; review: BlogAdminReview };

function ids(resourceKey: string, graphRunId?: string) {
  return { graphRunId: graphRunId ?? `blog:${resourceKey}`, threadId: `blog:${resourceKey}:automation` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pendingReview(state: any): BlogAdminReview | undefined {
  for (const t of state?.tasks ?? []) {
    const its = t?.interrupts ?? [];
    if (its.length) return its[0].value as BlogAdminReview;
  }
  return undefined;
}

export async function startBlogAutomation(
  runKey: string,
  deps: BlogAutomationDeps,
  opts?: { config?: Partial<BlogConfig>; graphRunId?: string },
): Promise<BlogAutomationResult> {
  const cfg = { ...DEFAULT_BLOG_CONFIG, ...(opts?.config ?? {}) };
  const { graphRunId, threadId } = ids(runKey, opts?.graphRunId);
  await createGraphRun({ graphRunId, workflowType: WORKFLOW, threadId });
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, cfg, { graphRunId, threadId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId, workflowType: WORKFLOW, status: "RUNNING" }, config)) as typeof BlogState.State;

  const state = await app.getState(config);
  const review = pendingReview(state);
  if (review) {
    await updateGraphRun(graphRunId, { status: "AWAITING_APPROVAL", approvalState: "REQUESTED" });
    return { status: "AWAITING_ADMIN", graphRunId, threadId, review };
  }
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId, outcome: final.outcome, resourceId: final.resourceId };
}

export async function resumeBlogAutomation(
  runKey: string,
  decision: BlogApprovalDecision,
  deps: BlogAutomationDeps,
  opts?: { config?: Partial<BlogConfig>; graphRunId?: string },
): Promise<BlogAutomationResult> {
  const cfg = { ...DEFAULT_BLOG_CONFIG, ...(opts?.config ?? {}) };
  const { graphRunId, threadId } = ids(runKey, opts?.graphRunId);
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_resumed" });
  const { Command } = await import("@langchain/langgraph");

  const app = buildGraph(deps, cfg, { graphRunId, threadId });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke(new Command({ resume: decision }), config)) as typeof BlogState.State;
  return { status: final.status === "COMPLETE" ? "COMPLETE" : "BLOCKED", graphRunId, outcome: final.outcome, resourceId: final.resourceId };
}
