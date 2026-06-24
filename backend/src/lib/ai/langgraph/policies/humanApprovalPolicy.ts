// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — human approval policy
//
// Single source of truth for which actions MUST pause the graph (interrupt) and
// wait for explicit human approval before proceeding. These map directly to the
// non-negotiable safety gates in the brief.
// ─────────────────────────────────────────────────────────────────────────────

export const SENSITIVE_ACTIONS = [
  "send_application",
  "send_employer_email",
  "overwrite_candidate_profile",
  "publish_blog",
  "approve_high_risk_employer",
  "verify_sensitive_document",
  "resolve_high_risk_trust_event",
  "manual_billing_change",
] as const;

export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number];

const SENSITIVE_SET = new Set<string>(SENSITIVE_ACTIONS);

/** Whether an action requires a human approval interrupt before execution. */
export function requiresHumanApproval(action: string): boolean {
  return SENSITIVE_SET.has(action);
}

/**
 * The exact acknowledgements a user must confirm before an application is sent.
 * Mirrors src/lib/apply/state-machine.ts validateAcknowledgements() so the graph
 * and the existing HTTP route enforce identical strings.
 */
export const REQUIRED_APPLY_ACKNOWLEDGEMENTS = [
  "I have reviewed the cover letter",
  "I confirm the apply target",
] as const;

export function missingAcknowledgements(given: string[]): string[] {
  const set = new Set(given.map((s) => s.trim()));
  return REQUIRED_APPLY_ACKNOWLEDGEMENTS.filter((a) => !set.has(a));
}
