// ─────────────────────────────────────────────────────────────────────────────
// Mock-interview retention sweep
//
// Enforces the per-session retention window. Each mock interview is stamped with
// expiresAt = createdAt + retentionDays (MOCK_INTERVIEW_RETENTION_DAYS, default
// 30) at creation, but nothing ever deleted expired sessions — so transcripts,
// feedback, and recordings persisted indefinitely past their stated window.
//
// Deleting the session cascades its MockInterviewArtifact rows (recordings /
// transcripts — onDelete: Cascade), removing all the sensitive content. The
// physical S3 objects behind artifact.storageKey are not deleted here (no S3
// delete helper yet — same follow-up as the erasure path); a bucket lifecycle
// rule should reclaim them. Idempotent: deleted rows can't re-match.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";

export const MOCK_INTERVIEW_RETENTION_INTERVAL_MS =
  parseInt(process.env.MOCK_RETENTION_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

export async function runMockInterviewRetentionCycle(): Promise<void> {
  const { count } = await prisma.mockInterviewSession.deleteMany({
    where: { expiresAt: { not: null, lte: new Date() } },
  });

  if (count === 0) return;

  recordOpsEvent({
    metricName: "mock_interview_retention_swept",
    category: "privacy",
    details: { deleted: count },
  });
  logger.info({ deleted: count }, "[mock-interview-retention] swept expired sessions");
}
