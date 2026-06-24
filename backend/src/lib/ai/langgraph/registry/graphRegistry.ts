// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — graph registry
//
// Maps a WorkflowType to its compiled graph factory and its deterministic
// thread-ID builder. Phase 1 ships the registry plumbing + thread-ID helpers;
// individual graphs register themselves as they are built in later phases.
//
// Deterministic thread IDs make checkpoint reuse and resume-after-approval
// idempotent — re-invoking the same logical run resumes rather than forks.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowType } from "../state/schemas.js";

/** A compiled graph exposes invoke/getState/updateState — kept loose to avoid
 *  coupling the registry to a specific LangGraph generic signature. */
export interface CompiledGraphLike {
  invoke: (input: unknown, config?: unknown) => Promise<unknown>;
  getState: (config: unknown) => Promise<unknown>;
}

export interface GraphDefinition {
  workflowType: WorkflowType;
  description: string;
  /** Lazily build + compile the graph (so checkpointer wiring is deferred). */
  build: () => CompiledGraphLike | Promise<CompiledGraphLike>;
  /** Build the deterministic checkpointer thread id for a run. */
  buildThreadId: (params: Record<string, string>) => string;
}

const REGISTRY = new Map<WorkflowType, GraphDefinition>();

export function registerGraph(def: GraphDefinition): void {
  REGISTRY.set(def.workflowType, def);
}

export function getGraph(workflow: WorkflowType): GraphDefinition | undefined {
  return REGISTRY.get(workflow);
}

export function listGraphs(): GraphDefinition[] {
  return [...REGISTRY.values()];
}

export function _resetGraphRegistry(): void {
  REGISTRY.clear();
}

// ── Deterministic thread-ID builders (match AUDIT_AND_PLAN §4.2) ─────────────
export const threadIds = {
  resumeReview: (userId: string, resumeId: string) => `user:${userId}:resume-review:${resumeId}`,
  jobMatch: (candidateId: string, jobId: string) => `candidate:${candidateId}:job-match:${jobId}`,
  applyPack: (applicationId: string) => `application:${applicationId}:apply-pack`,
  employerVerification: (employerId: string) => `employer:${employerId}:verification`,
  candidateVerification: (candidateId: string) => `candidate:${candidateId}:verification`,
  blogAutomation: (resourceId: string) => `blog:${resourceId}:automation`,
  interviewPrep: (candidateId: string, jobId: string) => `candidate:${candidateId}:interview-prep:${jobId}`,
  followUp: (applicationId: string) => `application:${applicationId}:follow-up`,
  trustModeration: (caseId: string) => `trust:${caseId}:moderation`,
  billingRecovery: (userId: string) => `user:${userId}:billing-recovery`,
  candidateAutopilot: (candidateId: string) => `candidate:${candidateId}:autopilot`,
  jobIngestionQuality: (jobFingerprint: string) => `job:${jobFingerprint}:ingestion-quality`,
};
