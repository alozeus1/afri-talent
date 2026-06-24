// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — model routing policy
//
// Centralizes the Haiku-vs-Sonnet decision and the per-graph token/cost ceilings.
//   FAST  → extraction, classification, parsing, lightweight scoring   (Haiku)
//   QUAL  → generation, tailoring, cover letters, truth/trust reasoning (Sonnet)
//
// Model strings are env-configurable; defaults match the existing orchestrator.
// MOCK_AI=1 is honored at the model-call boundary so every graph is deterministic
// in CI. Cost numbers are ESTIMATES and must be verified against current Anthropic
// pricing — override via env, never treat as authoritative.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowType } from "../state/schemas.js";

export type ModelTier = "FAST" | "QUAL";

const DEFAULT_FAST = "claude-haiku-4-5-20251001";
const DEFAULT_QUAL = "claude-sonnet-4-6";

/** Resolve the concrete model string for a tier (env-overridable). */
export function resolveModel(tier: ModelTier): string {
  if (tier === "FAST") return process.env.AI_MODEL_FAST?.trim() || DEFAULT_FAST;
  return process.env.AI_MODEL_QUAL?.trim() || DEFAULT_QUAL;
}

/** True when AI calls must be stubbed (CI / local deterministic mode). */
export function isMockAi(): boolean {
  return process.env.MOCK_AI === "1";
}

/** True when AI is administratively disabled (degrade to deterministic fallbacks). */
export function isAiDisabled(): boolean {
  return process.env.AI_DISABLED === "1";
}

export interface GraphBudget {
  /** Hard ceiling on total tokens for a single graph run. */
  maxTokens: number;
  /** Soft ceiling on estimated USD cost for a single graph run. */
  maxCostUsd: number;
}

/**
 * Per-graph budgets. Conservative defaults; tune with real telemetry.
 * Mirrors the orchestrator's 60k default for the apply pipeline.
 */
const GRAPH_BUDGETS: Record<WorkflowType, GraphBudget> = {
  resume_review: { maxTokens: 12_000, maxCostUsd: 0.15 },
  job_match: { maxTokens: 20_000, maxCostUsd: 0.25 },
  apply_pack: { maxTokens: 60_000, maxCostUsd: 0.9 },
  candidate_autopilot: { maxTokens: 90_000, maxCostUsd: 1.5 },
  employer_verification: { maxTokens: 15_000, maxCostUsd: 0.2 },
  candidate_verification: { maxTokens: 15_000, maxCostUsd: 0.2 },
  job_ingestion_quality: { maxTokens: 10_000, maxCostUsd: 0.12 },
  interview_prep: { maxTokens: 30_000, maxCostUsd: 0.45 },
  follow_up: { maxTokens: 8_000, maxCostUsd: 0.1 },
  blog_automation: { maxTokens: 40_000, maxCostUsd: 0.6 },
  trust_moderation: { maxTokens: 15_000, maxCostUsd: 0.2 },
  billing_recovery: { maxTokens: 6_000, maxCostUsd: 0.08 },
};

export function getGraphBudget(workflow: WorkflowType): GraphBudget {
  const envTokens = Number(process.env[`LG_BUDGET_TOKENS_${workflow.toUpperCase()}`]);
  const base = GRAPH_BUDGETS[workflow];
  return {
    maxTokens: Number.isFinite(envTokens) && envTokens > 0 ? envTokens : base.maxTokens,
    maxCostUsd: base.maxCostUsd,
  };
}

// Cost estimate rates (USD per million tokens). ESTIMATES — verify & override via env.
function rate(envKey: string, fallback: number): number {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Rough USD cost estimate for a single model call. Not billing-grade. */
export function estimateCostUsd(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const inPerM = tier === "FAST" ? rate("AI_COST_FAST_IN_PER_MTOK", 1.0) : rate("AI_COST_QUAL_IN_PER_MTOK", 3.0);
  const outPerM = tier === "FAST" ? rate("AI_COST_FAST_OUT_PER_MTOK", 5.0) : rate("AI_COST_QUAL_OUT_PER_MTOK", 15.0);
  return (inputTokens / 1_000_000) * inPerM + (outputTokens / 1_000_000) * outPerM;
}
