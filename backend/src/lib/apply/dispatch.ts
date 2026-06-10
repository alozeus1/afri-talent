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
import { getApplyQueue } from "../queues/apply-queues.js";
import { composeAndSendApplyEmail, EmployerOptedOutError } from "./email-draft.js";
import logger from "../logger.js";

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
  EMAIL_DRAFT:        null, // PR Q — implemented below
  OPERATOR_HANDOFF:   "OPERATOR_HANDOFF (Computer Use) track ships in PR T",
  ASSISTED_REDIRECT:  null,
};

// Shared by ASSISTED_REDIRECT and the EMAIL_DRAFT opt-out fallback: park the
// row in AWAITING_USER_CONFIRMATION with a clickout proof + ApplyAttempt.
function assistedRedirectResult(input: DispatchInput): DispatchSuccess {
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

export async function dispatchApply(input: DispatchInput): Promise<DispatchResult> {
  switch (input.applyStrategy) {
    case ApplyStrategy.ASSISTED_REDIRECT: {
      // §5.6 — record the clickout, but park the Application in
      // AWAITING_USER_CONFIRMATION. The route handler creates an
      // ApplyAttempt row; the 24h-nudge worker pings the candidate; their
      // clickout-confirm / clickout-deny finalises to SUBMITTED / FAILED;
      // 7-day silence transitions to NO_RESPONSE_TIMEOUT + FAILED.
      return assistedRedirectResult(input);
    }

    case ApplyStrategy.EMAIL_DRAFT: {
      // PR Q — Track B. Queue path (APPLY_QUEUES_ENABLED=1): enqueue and park
      // in SUBMITTING; the apply-email-worker sends + settles. Inline path:
      // send synchronously and hand the SES MessageId proof to the route.
      if (!input.applyEmailDetected?.trim()) {
        return { ok: false, error: "Job has no detected apply email address" };
      }

      const queue = getApplyQueue("apply-email-queue");
      if (queue) {
        try {
          await queue.add(
            "send-apply-email",
            { applicationId: input.applicationId },
            // Stable jobId: BullMQ dedups re-submits of the same application
            // while a send is already queued.
            { jobId: `apply-email-${input.applicationId}` },
          );
          return {
            ok: true,
            proofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
            proofRef: `queued:${input.applicationId}`,
            provider: "ses",
            nextStatus: SubmissionStatus.SUBMITTING,
          };
        } catch (error) {
          // Redis hiccup — fall through to the inline send below.
          logger.warn(
            { applicationId: input.applicationId, err: (error as Error).message },
            "[dispatch] apply-email enqueue failed; falling back to inline send",
          );
        }
      }

      try {
        const sent = await composeAndSendApplyEmail(input.applicationId);
        return {
          ok: true,
          proofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
          proofRef: sent.messageId,
          provider: "ses",
        };
      } catch (error) {
        if (error instanceof EmployerOptedOutError) {
          // §5.9 — employer opted out after classification: degrade to the
          // assisted-redirect track so the candidate can still apply.
          logger.info(
            { applicationId: input.applicationId },
            "[dispatch] EMAIL_DRAFT opt-out at send time; falling back to assisted redirect",
          );
          return assistedRedirectResult(input);
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : "EMAIL_DRAFT send failed",
        };
      }
    }

    default: {
      const reason = NOT_YET_IMPLEMENTED[input.applyStrategy];
      return { ok: false, error: reason ?? "no track implementation" };
    }
  }
}
