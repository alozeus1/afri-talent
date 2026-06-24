// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — shared state schemas (Zod v4)
//
// Every AfriTalent graph extends BaseGraphState. State is the durable, auditable
// record of an AI workflow run. It deliberately stores *references* (inputRefs /
// outputRefs), never raw PII payloads, so checkpoints and traces never leak
// resume text, contact details, or document contents.
//
// Phase 1 (foundation): schemas + types only. No behavior change.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod/v4";

/** The 12 orchestrated workflows. Used as the discriminator across registries. */
export const WorkflowTypeSchema = z.enum([
  "resume_review",
  "job_match",
  "apply_pack",
  "candidate_autopilot",
  "employer_verification",
  "candidate_verification",
  "job_ingestion_quality",
  "interview_prep",
  "follow_up",
  "blog_automation",
  "trust_moderation",
  "billing_recovery",
]);
export type WorkflowType = z.infer<typeof WorkflowTypeSchema>;

/**
 * Lifecycle status of a graph run.
 * - RUNNING            actively executing
 * - INTERRUPTED        paused at an interrupt() (generic pause)
 * - AWAITING_APPROVAL  paused specifically for a human approval gate
 * - COMPLETE           finished successfully
 * - PARTIAL            finished but degraded (e.g. budget exhausted)
 * - BLOCKED            stopped by a deterministic gate (score/coverage/quota/risk)
 * - FAILED             unrecoverable error
 */
export const GraphRunStatusSchema = z.enum([
  "RUNNING",
  "INTERRUPTED",
  "AWAITING_APPROVAL",
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "FAILED",
]);
export type GraphRunStatus = z.infer<typeof GraphRunStatusSchema>;

export const ApprovalStateSchema = z.enum(["NONE", "REQUESTED", "GRANTED", "DENIED"]);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

/** Aligns with src/lib/trust risk tiers. */
export const RiskTierSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

/** A surfaced risk signal. `code` is machine-readable; `detail` must be PII-free. */
export const RiskFlagSchema = z.object({
  code: z.string(),
  tier: RiskTierSchema,
  detail: z.string().optional(),
  at: z.string(), // ISO timestamp
});
export type RiskFlag = z.infer<typeof RiskFlagSchema>;

/** A non-PII pointer to an input/output artifact (DB row, S3 key, hash). */
export const ArtifactRefSchema = z.object({
  kind: z.string(), // e.g. "resume", "job", "cover_letter", "guard_report"
  ref: z.string(), // id / hash / s3 key — NEVER the payload itself
  hash: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const GraphErrorSchema = z.object({
  node: z.string(),
  message: z.string(),
  retryable: z.boolean().default(false),
  at: z.string(),
});
export type GraphError = z.infer<typeof GraphErrorSchema>;

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** Append-only audit trail entry. Mirrors GraphRunEvent rows. Must be PII-free. */
export const AuditEventSchema = z.object({
  type: z.string(),
  node: z.string().optional(),
  at: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/**
 * BaseGraphState — every graph's state object includes these fields.
 * Graph-specific state schemas should `.extend({ ... })` this.
 */
export const BaseGraphStateSchema = z.object({
  graphRunId: z.string(),
  workflowType: WorkflowTypeSchema,

  // Subject identifiers (all optional; presence depends on the workflow).
  userId: z.string().optional(),
  candidateId: z.string().optional(),
  employerId: z.string().optional(),
  jobId: z.string().optional(),
  applicationId: z.string().optional(),

  currentStep: z.string().default("start"),
  status: GraphRunStatusSchema.default("RUNNING"),

  inputRefs: z.array(ArtifactRefSchema).default([]),
  outputRefs: z.array(ArtifactRefSchema).default([]),

  riskFlags: z.array(RiskFlagSchema).default([]),

  humanApprovalRequired: z.boolean().default(false),
  approvalState: ApprovalStateSchema.default("NONE"),

  tokenUsage: TokenUsageSchema.default({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
  costEstimateUsd: z.number().nonnegative().default(0),

  retryCount: z.number().int().nonnegative().default(0),
  errors: z.array(GraphErrorSchema).default([]),
  auditEvents: z.array(AuditEventSchema).default([]),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BaseGraphState = z.infer<typeof BaseGraphStateSchema>;

/** Factory for an initial base state. */
export function initBaseState(input: {
  graphRunId: string;
  workflowType: WorkflowType;
  userId?: string;
  candidateId?: string;
  employerId?: string;
  jobId?: string;
  applicationId?: string;
}): BaseGraphState {
  const now = new Date().toISOString();
  return BaseGraphStateSchema.parse({
    ...input,
    createdAt: now,
    updatedAt: now,
  });
}
