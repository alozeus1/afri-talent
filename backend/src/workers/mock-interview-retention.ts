// ─────────────────────────────────────────────────────────────────────────────
// Mock-interview retention sweep
//
// Enforces the per-session retention window. Each mock interview is stamped with
// expiresAt = createdAt + retentionDays (MOCK_INTERVIEW_RETENTION_DAYS, default
// 30) at creation, but nothing ever deleted expired sessions — so transcripts,
// feedback, and recordings persisted indefinitely past their stated window.
//
// Recordings live in S3 (MockInterviewArtifact.storageKey, main uploads bucket).
// The uploads bucket lifecycle only expires NONCURRENT versions, so current
// objects are never reclaimed automatically — and once the artifact rows cascade
// away we lose the keys. So we purge the S3 objects FIRST, then delete the
// session row (which cascades the artifact rows). If the S3 delete fails, the
// row is left in place so the keys survive for a retry next cycle. Idempotent.
// ─────────────────────────────────────────────────────────────────────────────

import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";

export const MOCK_INTERVIEW_RETENTION_INTERVAL_MS =
  parseInt(process.env.MOCK_RETENTION_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

const BATCH_SIZE = parseInt(process.env.MOCK_RETENTION_BATCH_SIZE || "200", 10);

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  return s3Client;
}

/** Delete the given S3 keys. Returns true only if every object was removed (or
 * there was nothing to remove), so the caller can safely drop the DB row. */
async function purgeObjects(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const bucket = process.env.S3_UPLOADS_BUCKET;
  if (!bucket) return true; // no bucket configured (e.g. local dev) — nothing to purge
  const res = await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
  if (res.Errors && res.Errors.length > 0) {
    logger.warn(
      { bucket, errors: res.Errors.length },
      "[mock-interview-retention] some S3 objects failed to delete; deferring row delete",
    );
    return false;
  }
  return true;
}

export async function runMockInterviewRetentionCycle(): Promise<void> {
  // Read the storage keys BEFORE deleting — the row cascade would drop them.
  const expired = await prisma.mockInterviewSession.findMany({
    where: { expiresAt: { not: null, lte: new Date() } },
    select: { id: true, artifacts: { select: { storageKey: true } } },
    take: BATCH_SIZE,
  });
  if (expired.length === 0) return;

  let deletedSessions = 0;
  let purgedObjects = 0;
  let failed = 0;
  for (const session of expired) {
    const keys = session.artifacts.map((a) => a.storageKey).filter(Boolean);
    try {
      const purged = await purgeObjects(keys);
      if (!purged) {
        failed += 1;
        continue; // keep the row (and its keys) for retry
      }
      await prisma.mockInterviewSession.delete({ where: { id: session.id } });
      deletedSessions += 1;
      purgedObjects += keys.length;
    } catch (err) {
      failed += 1;
      logger.error(
        { err: String(err), sessionId: session.id },
        "[mock-interview-retention] purge failed for session (continuing)",
      );
    }
  }

  recordOpsEvent({
    metricName: "mock_interview_retention_swept",
    category: "privacy",
    details: { sessions: deletedSessions, objects: purgedObjects, failed },
  });
  logger.info(
    { sessions: deletedSessions, objects: purgedObjects, failed },
    "[mock-interview-retention] cycle complete",
  );
}
