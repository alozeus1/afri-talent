// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — job ingestion quality graph (Phase 6)
//
// Gates aggregated jobs before they become visible:
//   dedup (fingerprint) → score (deterministic rubric) → decide → embed → finalize
//
// Decisions: publish | publish_with_warning | hold | reject. Scoring is a fixed,
// explainable rubric (anti-inflation) blended with source reliability. Scam
// signals come from the existing trust content-risk assessment (injected).
// ─────────────────────────────────────────────────────────────────────────────

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseGraphAnnotation } from "../state/graphState.js";
import { lastWriteWins, appendReducer } from "../state/reducers.js";
import { getCheckpointer } from "../memory/checkpointer.js";
import { emitGraphEvent } from "../observability/graphEvents.js";
import { recordGraphRunOutcome } from "../observability/graphMetrics.js";
import { createGraphRun, updateGraphRun } from "../tools/prismaTools.js";
import { tierFor } from "../tools/trustTools.js";
import type { GraphRunStatus } from "../state/schemas.js";

const WORKFLOW = "job_ingestion_quality" as const;

export type IngestionDecision = "publish" | "publish_with_warning" | "hold" | "reject";

/** PII-free subset of a normalized job the graph needs to score. */
export interface JobQualityInput {
  jobRef: string;
  source: string;
  fingerprint: string;
  title: string;
  company: string;
  descriptionLength: number;
  requirementsCount: number;
  hasSalary: boolean;
  hasLocation: boolean;
  postedAt: Date;
  /** Free text used only for scam assessment (not stored in state). */
  scamSampleText: string;
}

export interface JobIngestionDeps {
  isDuplicate: (fingerprint: string) => Promise<boolean>;
  /** Content risk score 0–100 (reuse trust assessContentRisk). */
  assessContentRisk: (text: string) => number;
  /** Source reliability score 0–100. */
  getSourceReliability: (source: string) => Promise<number>;
  embedJob: (jobRef: string) => Promise<void>;
  recordDecision: (jobRef: string, decision: IngestionDecision, qualityScore: number) => Promise<void>;
}

export interface JobIngestionConfig {
  freshnessMaxDays: number;
  shortDescriptionChars: number;
}

export const DEFAULT_INGESTION_CONFIG: JobIngestionConfig = {
  freshnessMaxDays: 60,
  shortDescriptionChars: 200,
};

const IngestionState = Annotation.Root({
  ...BaseGraphAnnotation.spec,
  decision: Annotation<IngestionDecision | undefined>({ reducer: lastWriteWins, default: () => undefined }),
  qualityScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  scamScore: Annotation<number>({ reducer: lastWriteWins, default: () => 0 }),
  breakdown: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
});

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

interface Ctx {
  graphRunId: string;
  threadId: string;
  job: JobQualityInput;
}

function buildGraph(deps: JobIngestionDeps, cfg: JobIngestionConfig, ctx: Ctx) {
  const evt = (
    type: Parameters<typeof emitGraphEvent>[0]["type"],
    node?: string,
    details?: Record<string, string | number | boolean | null | undefined>,
  ) => emitGraphEvent({ graphRunId: ctx.graphRunId, workflowType: WORKFLOW, threadId: ctx.threadId, type, node, details });

  const job = ctx.job;

  const graph = new StateGraph(IngestionState)
    .addNode("dedup", async () => {
      const dup = await deps.isDuplicate(job.fingerprint);
      if (dup) {
        evt("node_completed", "dedup", { duplicate: true });
        return { decision: "reject" as IngestionDecision, status: "BLOCKED" as GraphRunStatus, currentStep: "finalize", breakdown: ["rejected: duplicate fingerprint"] };
      }
      return { currentStep: "score" };
    })
    .addNode("score", async () => {
      const breakdown: string[] = [];
      let quality = 100;
      if (!job.hasSalary) { quality -= 15; breakdown.push("-15 missing salary"); }
      if (!job.hasLocation) { quality -= 10; breakdown.push("-10 missing location"); }
      if (job.requirementsCount === 0) { quality -= 15; breakdown.push("-15 no requirements"); }
      if (job.descriptionLength < cfg.shortDescriptionChars) { quality -= 20; breakdown.push("-20 thin description"); }

      const ageDays = (Date.now() - new Date(job.postedAt).getTime()) / 86_400_000;
      if (ageDays > cfg.freshnessMaxDays) { quality -= 10; breakdown.push("-10 stale posting"); }

      const scam = clamp(deps.assessContentRisk(job.scamSampleText));
      const sourceReliability = clamp(await deps.getSourceReliability(job.source));

      // Blend content quality with source reliability.
      const blended = clamp(0.7 * clamp(quality) + 0.3 * sourceReliability);
      breakdown.push(`source reliability ${sourceReliability}`, `scam ${scam}`, `quality ${blended}`);
      return { qualityScore: blended, scamScore: scam, breakdown, currentStep: "decide" };
    })
    .addNode("decide", async (s) => {
      const scamTier = tierFor(s.scamScore);
      let decision: IngestionDecision;
      if (scamTier === "CRITICAL") decision = "reject";
      else if (scamTier === "HIGH" || s.qualityScore < 40) decision = "hold";
      else if (s.qualityScore < 60) decision = "publish_with_warning";
      else decision = "publish";

      if (scamTier === "HIGH" || scamTier === "CRITICAL") evt("risk_threshold_triggered", "decide", { scam_tier: scamTier });
      const status: GraphRunStatus = decision === "reject" || decision === "hold" ? "BLOCKED" : "COMPLETE";
      return { decision, status, currentStep: decision === "publish" || decision === "publish_with_warning" ? "embed" : "finalize" };
    })
    .addNode("embed", async () => {
      await deps.embedJob(job.jobRef);
      evt("side_effect_executed", "embed", { job_ref: job.jobRef });
      return { currentStep: "finalize" };
    })
    .addNode("finalize", async (s) => {
      const decision = s.decision ?? "hold";
      await deps.recordDecision(job.jobRef, decision, s.qualityScore);
      await updateGraphRun(ctx.graphRunId, { status: s.status, currentStep: "done" });
      recordGraphRunOutcome(WORKFLOW, s.status);
      evt("graph_completed", "finalize", { decision, quality: s.qualityScore, scam: s.scamScore });
      return {};
    })
    .addEdge(START, "dedup")
    .addConditionalEdges("dedup", (s) => (s.decision === "reject" ? "finalize" : "score"), { finalize: "finalize", score: "score" })
    .addEdge("score", "decide")
    .addConditionalEdges("decide", (s) => (s.currentStep === "embed" ? "embed" : "finalize"), { embed: "embed", finalize: "finalize" })
    .addEdge("embed", "finalize")
    .addEdge("finalize", END);

  return graph.compile({ checkpointer: getCheckpointer() });
}

export interface IngestionResult {
  decision: IngestionDecision;
  qualityScore: number;
  scamScore: number;
  breakdown: string[];
  graphRunId: string;
}

export async function runJobIngestionQuality(
  job: JobQualityInput,
  deps: JobIngestionDeps,
  opts?: { config?: Partial<JobIngestionConfig>; graphRunId?: string },
): Promise<IngestionResult> {
  const cfg = { ...DEFAULT_INGESTION_CONFIG, ...(opts?.config ?? {}) };
  const graphRunId = opts?.graphRunId ?? `job-ingest:${job.fingerprint}`;
  const threadId = `job:${job.fingerprint}:ingestion-quality`;

  await createGraphRun({ graphRunId, workflowType: WORKFLOW, threadId });
  emitGraphEvent({ graphRunId, workflowType: WORKFLOW, threadId, type: "graph_started" });

  const app = buildGraph(deps, cfg, { graphRunId, threadId, job });
  const config = { configurable: { thread_id: threadId } };
  const final = (await app.invoke({ graphRunId, workflowType: WORKFLOW, status: "RUNNING" }, config)) as typeof IngestionState.State;

  return {
    decision: final.decision ?? "hold",
    qualityScore: final.qualityScore,
    scamScore: final.scamScore,
    breakdown: final.breakdown,
    graphRunId,
  };
}
