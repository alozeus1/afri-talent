// ─────────────────────────────────────────────────────────────────────────────
// Account erasure — anonymize + soft-delete
//
// Fulfils the "permanently deleted within N days" promise made when a user
// requests account deletion (routes/profile.ts). Rather than a hard delete
// across ~26 relations (mixed cascade / SetNull — orphan-prone and truly
// irreversible), we ANONYMIZE: scrub PII, cut every access path, and stamp
// deletedAt. Referential integrity is preserved (applications, analytics, and
// aggregate rows survive de-identified), which satisfies GDPR/CCPA erasure
// while staying operationally safe.
//
// Idempotent: a user with deletedAt already set is skipped. Runs in a single
// transaction so a partial scrub can't leave a half-erased account.
//
// NOT covered here (documented follow-ups):
//   - Physical deletion of S3 objects referenced by resumes / verification
//     artifacts / interview recordings — there is no S3 delete helper yet; a
//     bucket lifecycle rule or dedicated purge should reclaim the blobs. The DB
//     references are removed.
//   - SemanticDocument (RAG index) may hold resume/profile text but is keyed by
//     (namespace, sourceType, sourceId) with no userId column and a heterogeneous
//     source-id convention, so a blind delete could hit other users' vectors.
//     Needs the indexing owner to confirm the candidate source-id mapping first.
//   - Kept intentionally (de-identified once the User row is scrubbed): billing
//     ledgers (legal/tax retention), abuse reports & audit logs (safety),
//     analytics/notification/saved-search/lifecycle rows.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../prisma.js";
import logger from "../logger.js";
import { recordOpsEvent } from "../ops/events.js";

/** Days between a deletion request and irreversible anonymization. Single source
 * of truth — imported by the request route and the reaper worker. */
export const ACCOUNT_DELETION_WINDOW_DAYS = 30;

export interface AnonymizeResult {
  userId: string;
  status: "anonymized" | "already_deleted" | "not_found";
}

/**
 * Anonymize + soft-delete one user. Best-effort caller should catch; this throws
 * only on an unexpected DB error so the worker can dead-letter it.
 */
export async function anonymizeUser(userId: string): Promise<AnonymizeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });
  if (!user) return { userId, status: "not_found" };
  if (user.deletedAt) return { userId, status: "already_deleted" };

  // One atomic transaction: either the account is fully erased or nothing
  // changes (no half-scrubbed state). Every delete below was FK-verified so it
  // can't block the transaction: inbound references are all Cascade or SetNull.
  await prisma.$transaction([
    // ── Scrub-in-place (keep the row; blank the PII) ──────────────────────────
    // Profile free-text.
    prisma.candidateProfile.updateMany({
      where: { userId },
      data: { headline: null, bio: null, linkedinUrl: null, githubUrl: null, portfolioUrl: null },
    }),
    // Applications are retained de-identified (row-delete is Restrict-blocked by
    // MessageThread/AdminReview) — scrub the free text + CV link.
    prisma.application.updateMany({
      where: { candidateId: userId },
      data: { coverLetter: null, notes: null, cvUrl: null },
    }),
    // Billing profile kept for financial/tax retention — null only the tax id.
    prisma.userBillingProfile.updateMany({
      where: { userId },
      data: { taxIdValue: null, taxIdType: null },
    }),
    // Trust profile kept (de-identified score/history) — drop the phone copy.
    prisma.candidateTrustProfile.updateMany({ where: { userId }, data: { phoneNumber: null } }),

    // ── Documents / resumes (uploaded, generated, parsed) ─────────────────────
    prisma.resume.deleteMany({ where: { profile: { userId } } }),
    prisma.userResume.deleteMany({ where: { userId } }), // cascades AtsReport
    prisma.candidateResumeVersion.deleteMany({ where: { userId } }),
    prisma.coverLetterVersion.deleteMany({ where: { candidateId: userId } }),
    prisma.verificationArtifact.deleteMany({ where: { userId } }),
    prisma.mockInterviewSession.deleteMany({ where: { userId } }),
    prisma.aiRun.deleteMany({ where: { userId } }), // cascades AiRunJob (tailored outputs)

    // ── Free-text personal narratives / sessions ──────────────────────────────
    prisma.message.deleteMany({ where: { senderId: userId } }),
    prisma.chatConversation.deleteMany({ where: { userId } }), // cascades ChatMessage
    prisma.salaryNegotiationSession.deleteMany({ where: { userId } }),
    prisma.careerGapSession.deleteMany({ where: { candidateId: userId } }),
    prisma.careerAdvice.deleteMany({ where: { userId } }),
    prisma.immigrationProcess.deleteMany({ where: { userId } }), // cascades ImmigrationStep
    prisma.calendarEvent.deleteMany({ where: { userId } }),

    // ── Public contributions (userId is non-nullable → can't de-identify) ─────
    prisma.companyReview.deleteMany({ where: { userId } }),
    prisma.interviewExperience.deleteMany({ where: { userId } }),
    prisma.salaryReport.deleteMany({ where: { userId } }),

    // ── Copied-PII / contact identifiers / device channels ────────────────────
    prisma.learningFeedback.deleteMany({ where: { userId } }), // snapshotted names
    prisma.smsDeliveryLog.deleteMany({ where: { userId } }), // phone + message
    prisma.phoneVerificationChallenge.deleteMany({ where: { candidateTrustProfile: { userId } } }),
    prisma.botSubscription.deleteMany({ where: { userId } }), // chat handle
    prisma.pushSubscription.deleteMany({ where: { userId } }), // device push channel
    prisma.socialProfile.deleteMany({ where: { userId } }),
    prisma.socialConnection.deleteMany({ where: { OR: [{ requesterId: userId }, { recipientId: userId }] } }),
    prisma.referral.deleteMany({ where: { OR: [{ referrerId: userId }, { refereeId: userId }] } }),

    // ── Autopilot / skills / evidence ─────────────────────────────────────────
    prisma.candidateAgentTask.deleteMany({ where: { userId } }),
    prisma.candidateAutopilotProfile.deleteMany({ where: { userId } }),
    prisma.skillAssessment.deleteMany({ where: { userId } }),
    prisma.candidateVerifiedSkill.deleteMany({ where: { userId } }),
    prisma.candidatePartnerMarker.deleteMany({ where: { userId } }),
    prisma.employerTalentPoolCandidate.deleteMany({ where: { candidateUserId: userId } }), // recruiter notes about the person

    // ── Every credential / access path ────────────────────────────────────────
    prisma.oAuthAccount.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.userPhoneOtp.deleteMany({ where: { userId } }),

    // ── Scrub the identity and lock the account (keep the row for FK integrity) ─
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@removed.invalid`,
        name: "Deleted User",
        password: "",
        avatarUrl: null,
        phoneNumber: null,
        phoneVerifiedAt: null,
        emailVerified: false,
        accountRestrictionStatus: "SUSPENDED",
        deletedAt: new Date(),
      },
    }),
  ]);

  logger.info({ userId: userId.slice(0, 8) }, "[privacy] account anonymized + soft-deleted");
  recordOpsEvent({
    metricName: "account_anonymized",
    category: "privacy",
    details: { user_id_prefix: userId.slice(0, 8) },
  });

  return { userId, status: "anonymized" };
}
