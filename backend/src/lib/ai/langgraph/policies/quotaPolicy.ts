// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — quota / entitlement policy (interface)
//
// Phase 1 defines the contract that graph pre-flight guards use to enforce plan
// entitlements, AI quotas, and apply caps. The concrete implementation delegates
// to src/lib/billing/entitlements and src/lib/apply/caps and is wired in the
// phases that build the apply/autopilot graphs (Phases 3–4). Keeping the
// interface here prevents graphs from re-implementing gating logic.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowType } from "../state/schemas.js";

export type QuotaDecisionCode =
  | "ALLOWED"
  | "PLAN_NOT_ENTITLED"
  | "AI_QUOTA_EXHAUSTED"
  | "APPLY_CAP_REACHED"
  | "BILLING_INVALID"
  | "TRUST_BLOCKED";

export interface QuotaDecision {
  ok: boolean;
  code: QuotaDecisionCode;
  /** PII-free human-readable reason for messaging / audit. */
  reason?: string;
  /** When a cap will reset, if applicable. */
  nextAllowedAt?: string;
}

export interface QuotaContext {
  workflow: WorkflowType;
  userId?: string;
  candidateId?: string;
  jobId?: string;
}

/** Implemented by the billing/caps adapter in later phases. */
export interface QuotaGate {
  check(ctx: QuotaContext): Promise<QuotaDecision>;
}

export const ALLOW: QuotaDecision = { ok: true, code: "ALLOWED" };

/**
 * Default gate used only as a safe placeholder until the real adapter is
 * injected. It ALLOWS read-only/non-premium workflows and DENIES premium
 * automation, so a misconfiguration fails closed for sensitive flows.
 */
export const conservativeDefaultGate: QuotaGate = {
  async check(ctx: QuotaContext): Promise<QuotaDecision> {
    const premium: WorkflowType[] = ["apply_pack", "candidate_autopilot"];
    if (premium.includes(ctx.workflow)) {
      return {
        ok: false,
        code: "PLAN_NOT_ENTITLED",
        reason: "Quota gate not yet wired; premium automation fails closed by default.",
      };
    }
    return ALLOW;
  },
};
