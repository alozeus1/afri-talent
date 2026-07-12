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
// NOT covered here (documented follow-ups): physical deletion of S3 objects
// referenced by resumes / verification artifacts / interview recordings — there
// is no S3 delete helper in the codebase yet; a bucket lifecycle rule or a
// dedicated purge pass should reclaim the blobs. The DB references are removed.
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

  await prisma.$transaction([
    // Free-text / profile PII (keep the row for FK integrity; blank the content).
    prisma.candidateProfile.updateMany({
      where: { userId },
      data: { headline: null, bio: null, linkedinUrl: null, githubUrl: null, portfolioUrl: null },
    }),
    // Sensitive documents and their DB references (ID docs, CVs, recordings).
    prisma.resume.deleteMany({ where: { profile: { userId } } }),
    prisma.verificationArtifact.deleteMany({ where: { userId } }),
    prisma.mockInterviewSession.deleteMany({ where: { userId } }),
    // Every credential / access path.
    prisma.oAuthAccount.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.userPhoneOtp.deleteMany({ where: { userId } }),
    // Scrub the identity and lock the account.
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
