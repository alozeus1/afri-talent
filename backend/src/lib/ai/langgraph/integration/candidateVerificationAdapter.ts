// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — candidate verification adapter (rollout wiring)
//
// Runs the candidateVerification graph when a candidate submits a credential /
// ID document. When a document reference is present the graph pauses at a
// TOTP-gated document-review interrupt — flipping the GraphRun to REQUESTED and
// firing the n8n approval broker (email alert with a console deep link).
//
// Only a document REFERENCE is ever passed in — never document content — so
// sensitive files are not exposed via checkpoints or traces. setVerification
// delegates to refreshCandidateTrustProfile (the canonical scorer); the graph's
// own score is recorded as an audit event, not treated as authoritative.
//
// Gated behind LANGGRAPH_CANDIDATE_VERIFICATION (falls back to LANGGRAPH_ENABLED);
// a no-op when off. Best-effort: never blocks or breaks submission.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import logger from "../../../logger.js";
import { recordOpsEvent } from "../../../ops/events.js";
import { refreshCandidateTrustProfile } from "../../../trust/service.js";
import { isGraphEnabled } from "../index.js";
import {
  startCandidateVerification,
  type CandidateVerificationDeps,
  type CandidateVerificationResult,
} from "../graphs/candidateVerification.graph.js";

const WORKFLOW = "candidate_verification" as const;

/** Deps built from real platform state. `documentRef` (an id/key, never content)
 * routes the graph into the admin document-review interrupt. */
export function buildCandidateVerificationDeps(documentRef?: string): CandidateVerificationDeps {
  return {
    getSignals: async (candidateId) => {
      const [user, profile, partnerMarkers] = await Promise.all([
        prisma.user.findUnique({
          where: { id: candidateId },
          select: { emailVerified: true, phoneVerifiedAt: true },
        }),
        prisma.candidateProfile.findUnique({
          where: { userId: candidateId },
          select: { linkedinUrl: true },
        }),
        prisma.candidatePartnerMarker
          .count({ where: { userId: candidateId, status: { not: "PENDING" } } })
          .catch(() => 0),
      ]);
      return {
        emailVerified: Boolean(user?.emailVerified),
        phoneVerified: Boolean(user?.phoneVerifiedAt),
        linkedinVerified: Boolean(profile?.linkedinUrl),
        partnerBadge: partnerMarkers > 0,
        documentRef,
      };
    },
    setVerification: async (candidateId, score, documentVerified) => {
      // Persist canonically; record the graph's score for observability.
      await refreshCandidateTrustProfile(candidateId).catch(() => undefined);
      recordOpsEvent({
        metricName: "candidate_verification_scored",
        category: "trust",
        details: { candidate_id: candidateId, score, document_verified: documentVerified },
      });
    },
    recordEvent: async (candidateId, type, details) => {
      recordOpsEvent({
        metricName: `candidate_verification_${type}`,
        category: "trust",
        details: { candidate_id: candidateId, ...details },
      });
    },
  };
}

/**
 * Kick off candidate verification for a submitted artifact. No-ops when the graph
 * is disabled or when a review is already pending for this candidate. Returns
 * null in those cases. Never throws.
 */
export async function runCandidateVerificationRollout(
  candidateId: string,
  opts: { artifactId: string; documentRef?: string },
): Promise<CandidateVerificationResult | null> {
  if (!isGraphEnabled(WORKFLOW)) return null;

  try {
    const pending = await prisma.graphRun.findFirst({
      where: { candidateId, workflowType: WORKFLOW, approvalState: "REQUESTED" },
      select: { id: true },
    });
    if (pending) return null;

    const graphRunId = `candidate-verify:${candidateId}:${opts.artifactId}`;
    return await startCandidateVerification(
      candidateId,
      buildCandidateVerificationDeps(opts.documentRef),
      graphRunId,
    );
  } catch (err) {
    logger.warn(
      { err: String(err), candidate_id: candidateId, artifact_id: opts.artifactId },
      "[graph] candidate verification rollout failed (non-fatal)",
    );
    return null;
  }
}
