// §5.7 — apply dispatcher.
//
// The /submit route calls this after moving submissionStatus → SUBMITTING.
// Each branch handles one ApplyStrategy and returns the proof artefacts the
// /submit handler writes back to the Application:
//
//   { ok: true, proofKind, proofRef, provider?, providerApplicationId? }
//     → /submit moves the row to SUBMITTED with the proof fields populated.
//
//   { ok: false, error }
//     → /submit moves the row to FAILED with `lastSubmissionError = error`.
//
// PR P ships the dispatcher shell + the ASSISTED_REDIRECT branch (the
// candidate clicks our app's outbound link; we capture a CLICKOUT_TIMESTAMP
// proof). The other six strategies stub-fail with a forward-pointer to the
// PR that lights them up.
//
//   ATS_API_GREENHOUSE | ATS_API_LEVER | ATS_API_ASHBY | ATS_API_WORKABLE  → PR S
//   EMAIL_DRAFT                                                            → PR Q
//   OPERATOR_HANDOFF                                                       → PR T
//
// The §5.6 24h-nudge worker + ApplyAttempt model that turn the assisted
// redirect from "we clicked out" into "we confirmed it landed" still ship in
// PR R — but the immediate proof (timestamp) is already real here.

import { ApplyStrategy, SubmissionProofKind, SubmissionStatus } from "@prisma/client";

export interface DispatchInput {
  applicationId: string;
  applyStrategy: ApplyStrategy;
  applyEmailDetected: string | null;
  applyFormDomain: string | null;
  sourceUrl: string | null;
  applicationUrl: string | null;
}

export interface DispatchSuccess {
  ok: true;
  proofKind: SubmissionProofKind;
  proofRef: string;
  provider?: string;
  providerApplicationId?: string;
  // §5.6 — tracks that finish asynchronously (e.g. ASSISTED_REDIRECT waits
  // for the candidate's clickout-confirm) request a non-terminal next state.
  // Omit to settle the Application directly to SUBMITTED.
  nextStatus?: SubmissionStatus;
  // §5.6 — when true, the route handler creates an ApplyAttempt row alongside
  // the Application update so the 24h-nudge worker can pick it up.
  createApplyAttempt?: boolean;
}

export interface DispatchFailure {
  ok: false;
  error: string;
}

export type DispatchResult = DispatchSuccess | DispatchFailure;

const NOT_YET_IMPLEMENTED: Record<ApplyStrategy, string | null> = {
  ATS_API_GREENHOUSE: "ATS_API_GREENHOUSE adapter ships in PR S",
  ATS_API_LEVER:      "ATS_API_LEVER adapter ships in PR S",
  ATS_API_ASHBY:      "ATS_API_ASHBY adapter ships in PR S",
  ATS_API_WORKABLE:   "ATS_API_WORKABLE adapter ships in PR S",
  EMAIL_DRAFT:        "EMAIL_DRAFT track ships in PR Q",
  OPERATOR_HANDOFF:   "OPERATOR_HANDOFF (Computer Use) track ships in PR T",
  ASSISTED_REDIRECT:  null,
};

export async function dispatchApply(input: DispatchInput): Promise<DispatchResult> {
  switch (input.applyStrategy) {
    case ApplyStrategy.ASSISTED_REDIRECT: {
      // §5.6 — record the clickout, but park the Application in
      // AWAITING_USER_CONFIRMATION. The route handler creates an
      // ApplyAttempt row; the 24h-nudge worker pings the candidate; their
      // clickout-confirm / clickout-deny finalises to SUBMITTED / FAILED;
      // 7-day silence transitions to NO_RESPONSE_TIMEOUT + FAILED.
      const clickoutAt = new Date().toISOString();
      const ref = input.applicationUrl ?? input.sourceUrl ?? "";
      return {
        ok: true,
        proofKind: SubmissionProofKind.CLICKOUT_TIMESTAMP,
        proofRef: `${clickoutAt}|${ref}`,
        provider: "clickout",
        nextStatus: SubmissionStatus.AWAITING_USER_CONFIRMATION,
        createApplyAttempt: true,
      };
    }
    default: {
      const reason = NOT_YET_IMPLEMENTED[input.applyStrategy];
      return { ok: false, error: reason ?? "no track implementation" };
    }
  }
}
