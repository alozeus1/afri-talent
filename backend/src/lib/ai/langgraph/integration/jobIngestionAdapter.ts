// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — job ingestion adapter (rollout wiring)
//
// Connects the jobIngestionQuality graph's injected deps to the real platform
// functions (trust content-risk, source reliability, ops metrics) and maps the
// graph's decision onto Job persistence fields. Used by the aggregator ONLY when
// LANGGRAPH_JOB_INGESTION_QUALITY (or the global flag) is on — flag off = the
// aggregator's existing behavior, untouched.
// ─────────────────────────────────────────────────────────────────────────────

import { JobStatus, TrustRiskLevel } from "@prisma/client";
import { assessContentRisk, riskLevelForScore } from "../../../trust/risk.js";
import { recordOpsEvent } from "../../../ops/events.js";
import {
  runJobIngestionQuality,
  type IngestionDecision,
  type IngestionResult,
  type JobIngestionDeps,
} from "../graphs/jobIngestionQuality.graph.js";

export interface JobGateInput {
  jobRef: string;
  source: string;
  fingerprint: string;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  hasSalary: boolean;
  hasLocation: boolean;
  postedAt: Date;
}

// Deterministic per-source reliability (0–100). ATS partner boards are most
// trustworthy; broad aggregators least. Tune from source diagnostics over time.
const SOURCE_RELIABILITY: Record<string, number> = {
  GREENHOUSE: 92,
  LEVER: 90,
  ASHBY: 88,
  WORKABLE: 85,
  JOBBERMAN: 78,
  BRIGHTERMONDAY: 75,
  REMOTEOK: 70,
  WEWORKREMOTELY: 70,
  HIMALAYAS: 68,
  REMOTIVE: 68,
  ARBEITNOW: 65,
  ADZUNA: 62,
  APIFY: 55,
};

export function sourceReliability(source: string): number {
  return SOURCE_RELIABILITY[source] ?? 60;
}

/** Build the graph deps from real platform functions. */
export function buildJobIngestionDeps(): JobIngestionDeps {
  return {
    // The aggregator owns dedup (it routes duplicates to UPDATE, not reject), so
    // the gate always scores quality here.
    isDuplicate: async () => false,
    assessContentRisk: (text) => assessContentRisk(text).score,
    getSourceReliability: async (source) => sourceReliability(source),
    // Embedding of published jobs is owned by the semantic-indexer worker.
    embedJob: async () => {},
    recordDecision: async (jobRef, decision, qualityScore) => {
      recordOpsEvent({
        metricName: "job_ingestion_decision",
        category: "aggregator",
        owner: "ai-platform",
        outcome: decision === "reject" ? "held" : "success",
        details: { decision, quality: qualityScore, job_ref: jobRef },
      });
    },
  };
}

/** Run the quality gate for one normalized job. */
export async function gateJobIngestion(input: JobGateInput): Promise<IngestionResult> {
  return runJobIngestionQuality(
    {
      jobRef: input.jobRef,
      source: input.source,
      fingerprint: input.fingerprint,
      title: input.title,
      company: input.company,
      descriptionLength: input.description.length,
      requirementsCount: input.requirements.length,
      hasSalary: input.hasSalary,
      hasLocation: input.hasLocation,
      postedAt: input.postedAt,
      scamSampleText: `${input.title}\n${input.description}`,
    },
    buildJobIngestionDeps(),
    { graphRunId: `job-ingest:${input.fingerprint}:${Date.now()}` },
  );
}

export interface JobPersistenceOverride {
  status: JobStatus;
  riskScore: number;
  riskLevel: TrustRiskLevel;
}

/**
 * Map a gate decision to Job persistence fields. Returns null when the job must
 * be rejected (the caller skips the insert entirely).
 */
export function jobPersistenceForDecision(decision: IngestionDecision, scamScore: number): JobPersistenceOverride | null {
  switch (decision) {
    case "reject":
      return null; // caller skips persistence
    case "hold":
      return { status: JobStatus.PENDING_REVIEW, riskScore: scamScore, riskLevel: riskLevelForScore(scamScore) };
    case "publish_with_warning":
      return { status: JobStatus.PUBLISHED, riskScore: scamScore, riskLevel: TrustRiskLevel.MEDIUM };
    case "publish":
    default:
      return { status: JobStatus.PUBLISHED, riskScore: scamScore, riskLevel: TrustRiskLevel.LOW };
  }
}
