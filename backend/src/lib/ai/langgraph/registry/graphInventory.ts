// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — graph inventory (catalog)
//
// Single discovery surface listing every workflow graph: its description, whether
// it has a human-in-the-loop interrupt, its entry-point functions, and its
// deterministic thread-ID builder. Used by docs, ops dashboards, and the
// coverage test that guarantees all 12 WorkflowType values have a graph.
// ─────────────────────────────────────────────────────────────────────────────

import { threadIds } from "./graphRegistry.js";
import { WorkflowTypeSchema, type WorkflowType } from "../state/schemas.js";

export interface GraphCatalogEntry {
  workflowType: WorkflowType;
  description: string;
  /** Has a human-approval / admin-review interrupt. */
  interruptible: boolean;
  entryPoints: string[];
  threadId: (params: Record<string, string>) => string;
}

export const GRAPH_CATALOG: GraphCatalogEntry[] = [
  { workflowType: "resume_review", description: "Parse + ATS + gap helper for a resume.", interruptible: false, entryPoints: ["runOrchestratorViaGraph"], threadId: (p) => threadIds.resumeReview(p.userId, p.resumeId) },
  { workflowType: "job_match", description: "Score candidate vs jobs (deterministic rubric).", interruptible: false, entryPoints: ["runOrchestratorViaGraph"], threadId: (p) => threadIds.jobMatch(p.candidateId, p.jobId) },
  { workflowType: "apply_pack", description: "Tailor + cover letter + truth guard; submission HITL.", interruptible: true, entryPoints: ["runOrchestratorViaGraph", "startApplicationApproval", "resumeApplicationApproval"], threadId: (p) => threadIds.applyPack(p.applicationId) },
  { workflowType: "candidate_autopilot", description: "Gated pack generation; never auto-submits.", interruptible: false, entryPoints: ["runCandidateAutopilot"], threadId: (p) => threadIds.candidateAutopilot(p.candidateId) },
  { workflowType: "employer_verification", description: "Risk-tier gating; admin review (TOTP).", interruptible: true, entryPoints: ["startEmployerVerification", "resumeEmployerVerification"], threadId: (p) => threadIds.employerVerification(p.employerId) },
  { workflowType: "candidate_verification", description: "Deterministic score; document review (TOTP).", interruptible: true, entryPoints: ["startCandidateVerification", "resumeCandidateVerification"], threadId: (p) => threadIds.candidateVerification(p.candidateId) },
  { workflowType: "job_ingestion_quality", description: "Quality + source reliability; publish/hold/reject.", interruptible: false, entryPoints: ["runJobIngestionQuality"], threadId: (p) => threadIds.jobIngestionQuality(p.fingerprint) },
  { workflowType: "interview_prep", description: "Role/company questions + readiness score.", interruptible: false, entryPoints: ["runInterviewPrep"], threadId: (p) => threadIds.interviewPrep(p.candidateId, p.jobId) },
  { workflowType: "follow_up", description: "Cadence follow-up draft; user-approved send.", interruptible: true, entryPoints: ["startFollowUp", "resumeFollowUp"], threadId: (p) => threadIds.followUp(p.applicationId) },
  { workflowType: "blog_automation", description: "Fact-check + draft; admin-approved publish.", interruptible: true, entryPoints: ["startBlogAutomation", "resumeBlogAutomation"], threadId: (p) => threadIds.blogAutomation(p.resourceId) },
  { workflowType: "trust_moderation", description: "Severity triage; admin review (TOTP); suspend.", interruptible: true, entryPoints: ["startTrustModeration", "resumeTrustModeration"], threadId: (p) => threadIds.trustModeration(p.caseRef) },
  { workflowType: "billing_recovery", description: "Reconcile provider vs local; pause/resume premium.", interruptible: false, entryPoints: ["runBillingRecovery"], threadId: (p) => threadIds.billingRecovery(p.userId) },
];

export function getCatalogEntry(workflow: WorkflowType): GraphCatalogEntry | undefined {
  return GRAPH_CATALOG.find((e) => e.workflowType === workflow);
}

/** Workflow types declared in the schema but missing from the catalog (should be none). */
export function missingWorkflows(): WorkflowType[] {
  const present = new Set(GRAPH_CATALOG.map((e) => e.workflowType));
  return WorkflowTypeSchema.options.filter((w) => !present.has(w));
}

export function interruptibleWorkflows(): WorkflowType[] {
  return GRAPH_CATALOG.filter((e) => e.interruptible).map((e) => e.workflowType);
}
