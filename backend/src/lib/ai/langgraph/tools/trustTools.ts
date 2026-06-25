// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — trust tools (shared types for the verification/moderation graphs)
//
// Admin actions on sensitive trust workflows must be TOTP-gated. The resume
// payload an admin sends to an interrupted graph carries an explicit
// `totpVerified` flag (set by the route only after the existing admin TOTP gate
// passes). The graph refuses to honor an approval unless TOTP is verified.
// ─────────────────────────────────────────────────────────────────────────────

import { riskTierForScore } from "../policies/riskPolicy.js";
import type { RiskTier } from "../state/schemas.js";

export { riskTierForScore };

/** The decision an admin returns when resuming a paused trust/verification graph. */
export interface AdminDecision {
  decision: "approve" | "reject";
  adminId: string;
  /** Must be true — set by the route only after the admin TOTP gate passes. */
  totpVerified: boolean;
  notes?: string;
}

export type AdminActionOutcome =
  | { ok: true; approved: boolean }
  | { ok: false; reason: "totp_required" };

/** Enforce the TOTP gate before honoring any admin decision. */
export function evaluateAdminDecision(d: AdminDecision): AdminActionOutcome {
  if (!d.totpVerified) return { ok: false, reason: "totp_required" };
  return { ok: true, approved: d.decision === "approve" };
}

export function tierFor(score: number): RiskTier {
  return riskTierForScore(score);
}
