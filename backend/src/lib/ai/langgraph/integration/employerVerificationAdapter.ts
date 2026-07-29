// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — employer verification adapter (rollout wiring)
//
// Runs the employerVerification graph when an employer submits verification
// evidence. The graph assesses risk and, for HIGH-risk employers, pauses at a
// TOTP-gated admin-review interrupt — which flips the GraphRun to REQUESTED and
// fires the n8n approval broker (email alert with a console deep link).
//
// Design notes:
//   - assessEmployer READS the persisted risk score. The submitting route calls
//     refreshEmployerTrustProfile() first, which is the canonical scorer AND
//     applies the account-restriction (accountRestrictionStatus). So the graph's
//     allow/restrict/suspend side effects here are audit signals only — they do
//     not re-mutate account state and cannot fight the canonical restriction.
//   - Gated behind LANGGRAPH_EMPLOYER_VERIFICATION (falls back to LANGGRAPH_
//     ENABLED); a no-op when off. Best-effort: never blocks or breaks submission.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import logger from "../../../logger.js";
import { recordOpsEvent } from "../../../ops/events.js";
import { isGraphEnabled } from "../index.js";
import {
  startEmployerVerification,
  type EmployerVerificationDeps,
  type EmployerVerificationOutcome,
} from "../graphs/employerVerification.graph.js";

const WORKFLOW = "employer_verification" as const;

function auditEvent(employerId: string, action: string): void {
  recordOpsEvent({
    metricName: `employer_verification_${action}`,
    category: "trust",
    details: { employer_id: employerId },
  });
}

/** Deps built from real platform state. Assessment reads the already-refreshed
 * trust profile; publishing outcomes are audit-only (see file header). */
export function buildEmployerVerificationDeps(): EmployerVerificationDeps {
  return {
    assessEmployer: async (employerId) => {
      const profile = await prisma.employerTrustProfile.findUnique({
        where: { employerId },
        select: { riskScore: true, throwawayDomainDetected: true },
      });
      return {
        riskScore: profile?.riskScore ?? 0,
        throwawayDomain: profile?.throwawayDomainDetected ?? false,
      };
    },
    allowPublishing: async (employerId) => auditEvent(employerId, "allow_publishing"),
    restrictPublishing: async (employerId) => auditEvent(employerId, "restrict_publishing"),
    suspendEmployer: async (employerId) => auditEvent(employerId, "suspend"),
    recordEvent: async (employerId, type, details) => {
      recordOpsEvent({
        metricName: `employer_verification_${type}`,
        category: "trust",
        details: { employer_id: employerId, ...details },
      });
    },
  };
}

/**
 * Kick off employer verification for a submitted artifact. No-ops when the graph
 * is disabled or when a review is already pending for this employer (avoids a
 * duplicate run/email). Returns null in those cases. Never throws.
 */
export async function runEmployerVerificationRollout(
  employerId: string,
  opts: { artifactId: string },
): Promise<EmployerVerificationOutcome | null> {
  if (!isGraphEnabled(WORKFLOW)) return null;

  try {
    const pending = await prisma.graphRun.findFirst({
      where: { employerId, workflowType: WORKFLOW, approvalState: "REQUESTED" },
      select: { id: true },
    });
    if (pending) return null;

    const graphRunId = `employer-verify:${employerId}:${opts.artifactId}`;
    return await startEmployerVerification(employerId, buildEmployerVerificationDeps(), graphRunId);
  } catch (err) {
    logger.warn(
      { err: String(err), employer_id: employerId, artifact_id: opts.artifactId },
      "[graph] employer verification rollout failed (non-fatal)",
    );
    return null;
  }
}
