// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — risk policy
//
// Thin, deterministic wrapper over the trust risk tiers used in src/lib/trust.
// Tiers: LOW 0–24, MEDIUM 25–54, HIGH 55–79, CRITICAL 80–100.
// Graphs use this to decide whether automation may proceed. The authoritative
// scoring lives in src/lib/trust; this only maps scores → tiers → gate decisions.
// ─────────────────────────────────────────────────────────────────────────────

import type { RiskTier } from "../state/schemas.js";

export function riskTierForScore(score: number): RiskTier {
  if (score >= 80) return "CRITICAL";
  if (score >= 55) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

/**
 * Whether automated (no-human) AI actions are permitted for a risk tier.
 * HIGH/CRITICAL require human review; CRITICAL additionally triggers suspension
 * in the trust layer.
 */
export function isAutomationAllowed(tier: RiskTier): boolean {
  return tier === "LOW" || tier === "MEDIUM";
}

/** Whether the entity must be auto-suspended (mirrors trust CRITICAL behavior). */
export function requiresSuspension(tier: RiskTier): boolean {
  return tier === "CRITICAL";
}

/** Whether a human review queue entry is required before proceeding. */
export function requiresHumanReview(tier: RiskTier): boolean {
  return tier === "HIGH" || tier === "CRITICAL";
}
