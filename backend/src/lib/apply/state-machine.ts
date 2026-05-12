// §5.7 — apply pathway consent-gate state machine.
//
//   NOT_SUBMITTED
//        │
//        ▼  (POST /api/applications/draft)
//   DRAFTING ─────► AWAITING_USER_CONFIRMATION
//        │                    │
//        │                    ▼  (POST /api/applications/:id/submit)
//        └───────────────► SUBMITTING ───► SUBMITTED
//                              │
//                              └──────► FAILED
//
// Pure transition logic. Acknowledgement validation lives here so the routes
// don't have to keep the required-phrase list in sync with the test suite.
// The DB layer (routes/applications.ts) wraps these decisions with the actual
// Prisma updates.

import { SubmissionStatus } from "@prisma/client";

// Phrases the candidate must check before /submit will move the row out of
// AWAITING_USER_CONFIRMATION. Per master prompt §5.7 — exact strings.
export const REQUIRED_ACKNOWLEDGEMENTS: ReadonlyArray<string> = [
  "I have reviewed the cover letter",
  "I confirm the apply target",
];

export interface AcknowledgementValidationFailure {
  ok: false;
  reason: "MISSING_ACKNOWLEDGEMENT" | "EXTRA_ACKNOWLEDGEMENT";
  missing?: string[];
  extra?: string[];
}

export interface AcknowledgementValidationSuccess {
  ok: true;
}

export type AcknowledgementValidation = AcknowledgementValidationSuccess | AcknowledgementValidationFailure;

export function validateAcknowledgements(
  given: ReadonlyArray<string> | undefined | null,
): AcknowledgementValidation {
  const safe = Array.isArray(given) ? given : [];
  const missing = REQUIRED_ACKNOWLEDGEMENTS.filter((req) => !safe.includes(req));
  if (missing.length > 0) {
    return { ok: false, reason: "MISSING_ACKNOWLEDGEMENT", missing };
  }
  // No EXTRA check today — clients may send extras for forward-compat. If we
  // ever need to reject unknown acknowledgements, add the diff here.
  return { ok: true };
}

// Allowed transitions. Anything not in this map is a hard error.
const ALLOWED: Record<SubmissionStatus, ReadonlySet<SubmissionStatus>> = {
  [SubmissionStatus.NOT_SUBMITTED]: new Set([SubmissionStatus.DRAFTING]),
  [SubmissionStatus.DRAFTING]: new Set([
    SubmissionStatus.AWAITING_USER_CONFIRMATION,
    SubmissionStatus.SUBMITTING,
    SubmissionStatus.FAILED,
  ]),
  [SubmissionStatus.AWAITING_USER_CONFIRMATION]: new Set([
    SubmissionStatus.SUBMITTING,
    SubmissionStatus.FAILED,
  ]),
  [SubmissionStatus.SUBMITTING]: new Set([
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.FAILED,
  ]),
  [SubmissionStatus.SUBMITTED]: new Set(),
  [SubmissionStatus.FAILED]: new Set([
    // Allow retry from FAILED by going back through DRAFTING. Each retry
    // bumps submissionAttempts in the route handler so we keep an audit.
    SubmissionStatus.DRAFTING,
  ]),
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return ALLOWED[from].has(to);
}

export interface TransitionDecision {
  ok: boolean;
  reason?: "TERMINAL_STATE" | "ILLEGAL_TRANSITION";
}

export function transition(
  from: SubmissionStatus,
  to: SubmissionStatus,
): TransitionDecision {
  if (from === SubmissionStatus.SUBMITTED) {
    return { ok: false, reason: "TERMINAL_STATE" };
  }
  if (!canTransition(from, to)) {
    return { ok: false, reason: "ILLEGAL_TRANSITION" };
  }
  return { ok: true };
}

// Helper for the /submit route: from a candidate's current submissionStatus,
// decide what `submit` should do.
export type SubmitGate =
  | { ok: true; nextStatus: typeof SubmissionStatus.SUBMITTING }
  | { ok: false; reason: "ALREADY_SUBMITTED" | "NOT_DRAFTED" | "ILLEGAL_TRANSITION" };

export function gateSubmit(current: SubmissionStatus): SubmitGate {
  if (current === SubmissionStatus.SUBMITTED) {
    return { ok: false, reason: "ALREADY_SUBMITTED" };
  }
  if (
    current !== SubmissionStatus.DRAFTING &&
    current !== SubmissionStatus.AWAITING_USER_CONFIRMATION
  ) {
    return { ok: false, reason: "NOT_DRAFTED" };
  }
  const t = transition(current, SubmissionStatus.SUBMITTING);
  if (!t.ok) return { ok: false, reason: "ILLEGAL_TRANSITION" };
  return { ok: true, nextStatus: SubmissionStatus.SUBMITTING };
}
