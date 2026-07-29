// ─────────────────────────────────────────────────────────────────────────────
// Mock-interview retention sweep
//
// Enforces the per-session retention window. Each mock interview is stamped with
// expiresAt = createdAt + retentionDays (MOCK_INTERVIEW_RETENTION_DAYS, default
// 30) at creation, but nothing ever deleted expired sessions — so transcripts,
// feedback, and recordings persisted indefinitely past their stated window.
//
// Recordings live in S3 (MockInterviewArtifact.storageKey, main uploads bucket).
// That bucket is VERSIONED and its lifecycle only transitions noncurrent versions
// to Glacier — it never expires them — so an unversioned delete would just write a
// delete marker and keep the recording bytes forever. We therefore list and delete
// EVERY version (and delete marker) for each key, then delete the session row
// (which cascades the artifact rows). S3 first, so the cascade can't drop the keys
// before the bytes are gone; on S3 failure the row is kept for a retry. The cycle
// loops until no expired sessions remain (draining a backlog in one run) and stops
// making progress when a batch can't be deleted. Idempotent.
// ─────────────────────────────────────────────────────────────────────────────

import {
  S3Client,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";

export const MOCK_INTERVIEW_RETENTION_INTERVAL_MS =
  parseInt(process.env.MOCK_RETENTION_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

const BATCH_SIZE = parseInt(process.env.MOCK_RETENTION_BATCH_SIZE || "200", 10);
// Backstop so a pathological data state can never spin forever; well above any
// realistic single-cycle backlog (MAX_BATCHES * BATCH_SIZE sessions).
const MAX_BATCHES = 100;
const S3_DELETE_CHUNK = 1000; // DeleteObjects hard limit

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  return s3Client;
}

/** List every version + delete marker for one exact key (paginated). */
async function listAllVersions(bucket: string, key: string): Promise<ObjectIdentifier[]> {
  const client = getS3Client();
  const out: ObjectIdentifier[] = [];
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;
  do {
    const res = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionMarker,
      }),
    );
    // Prefix is not an exact match, so filter to the exact key.
    for (const v of res.Versions ?? []) {
      if (v.Key === key && v.VersionId) out.push({ Key: key, VersionId: v.VersionId });
    }
    for (const d of res.DeleteMarkers ?? []) {
      if (d.Key === key && d.VersionId) out.push({ Key: key, VersionId: d.VersionId });
    }
    keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
    versionMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
  } while (keyMarker || versionMarker);
  return out;
}

/** Permanently delete all versions of the given keys. Returns true only if every
 * object version was removed (or there was nothing to remove), so the caller can
 * safely drop the DB row. */
async function purgeObjects(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const bucket = process.env.S3_UPLOADS_BUCKET;
  if (!bucket) return true; // no bucket configured (e.g. local dev) — nothing to purge

  const versions: ObjectIdentifier[] = [];
  for (const key of keys) {
    versions.push(...(await listAllVersions(bucket, key)));
  }
  if (versions.length === 0) return true; // already gone

  const client = getS3Client();
  for (let i = 0; i < versions.length; i += S3_DELETE_CHUNK) {
    const chunk = versions.slice(i, i + S3_DELETE_CHUNK);
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }),
    );
    if (res.Errors && res.Errors.length > 0) {
      logger.warn(
        { bucket, errors: res.Errors.length },
        "[mock-interview-retention] some S3 versions failed to delete; deferring row delete",
      );
      return false;
    }
  }
  return true;
}

export async function runMockInterviewRetentionCycle(): Promise<void> {
  let deletedSessions = 0;
  let purgedObjects = 0;
  let failed = 0;

  // Drain every expired batch this cycle; stop when nothing is left or a batch
  // makes no progress (all remaining rows failed to purge — retry next cycle).
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const expired = await prisma.mockInterviewSession.findMany({
      where: { expiresAt: { not: null, lte: new Date() } },
      select: { id: true, artifacts: { select: { storageKey: true } } },
      take: BATCH_SIZE,
    });
    if (expired.length === 0) break;

    let deletedThisBatch = 0;
    for (const session of expired) {
      const keys = session.artifacts.map((a) => a.storageKey).filter(Boolean);
      try {
        if (!(await purgeObjects(keys))) {
          failed += 1;
          continue; // keep the row (and its keys) for retry
        }
        await prisma.mockInterviewSession.delete({ where: { id: session.id } });
        deletedSessions += 1;
        deletedThisBatch += 1;
        purgedObjects += keys.length;
      } catch (err) {
        failed += 1;
        logger.error(
          { err: String(err), sessionId: session.id },
          "[mock-interview-retention] purge failed for session (continuing)",
        );
      }
    }

    // No forward progress (every remaining row failed) — avoid an infinite loop.
    if (deletedThisBatch === 0) break;
  }

  if (deletedSessions === 0 && failed === 0) return;
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
