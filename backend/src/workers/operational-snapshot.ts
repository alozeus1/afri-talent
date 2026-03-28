import { AbuseReportStatus, JobStatus, TrustCaseStatus, VerificationArtifactStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { getLastSyncTime } from "./aggregator-cron.js";
import { recordOpsSnapshotMetric } from "../lib/ops/events.js";
import { summarizeDeadLetters } from "../lib/ops/resilience.js";

const AGGREGATOR_STALENESS_MINUTES = parseInt(process.env.AGGREGATOR_STALENESS_MINUTES || "180", 10);

export async function runOperationalSnapshotCycle(): Promise<void> {
  const [
    lastSyncAt,
    pendingJobs,
    verificationQueueBacklog,
    moderationQueueBacklog,
    abuseReportsOpen,
    fraudDetectionsLast24h,
    deadLettersBySource,
  ] = await Promise.all([
    getLastSyncTime(),
    prisma.job.count({ where: { status: JobStatus.PENDING_REVIEW } }),
    prisma.verificationArtifact.count({
      where: {
        status: {
          in: [VerificationArtifactStatus.PENDING, VerificationArtifactStatus.NEEDS_MORE_INFO],
        },
      },
    }),
    prisma.trustCase.count({
      where: {
        status: {
          in: [TrustCaseStatus.OPEN, TrustCaseStatus.IN_REVIEW],
        },
      },
    }),
    prisma.abuseReport.count({
      where: {
        status: {
          in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED],
        },
      },
    }),
    prisma.trustRiskEvent.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    summarizeDeadLetters(),
  ]);

  const minutesSinceLastSync = lastSyncAt
    ? Math.max(0, Math.round((Date.now() - lastSyncAt.getTime()) / 60000))
    : AGGREGATOR_STALENESS_MINUTES + 1;
  const totalDeadLetters = Object.values(deadLettersBySource).reduce((sum, count) => sum + count, 0);

  recordOpsSnapshotMetric({
    metricName: "job_ingestion_freshness_minutes",
    value: minutesSinceLastSync,
    details: {
      last_sync_at: lastSyncAt?.toISOString() ?? "never",
      stale: minutesSinceLastSync > AGGREGATOR_STALENESS_MINUTES,
    },
  });

  recordOpsSnapshotMetric({
    metricName: "moderation_queue_backlog",
    value: pendingJobs + moderationQueueBacklog,
    details: {
      pending_jobs: pendingJobs,
      trust_cases_open: moderationQueueBacklog,
    },
  });

  recordOpsSnapshotMetric({
    metricName: "employer_verification_queue_backlog",
    value: verificationQueueBacklog,
  });

  recordOpsSnapshotMetric({
    metricName: "abuse_reports_open",
    value: abuseReportsOpen,
  });

  recordOpsSnapshotMetric({
    metricName: "fraud_detections_24h",
    value: fraudDetectionsLast24h,
  });

  recordOpsSnapshotMetric({
    metricName: "dead_letter_backlog",
    value: totalDeadLetters,
  });

  logger.info(
    {
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      minutesSinceLastSync,
      pendingJobs,
      verificationQueueBacklog,
      moderationQueueBacklog,
      abuseReportsOpen,
      fraudDetectionsLast24h,
      totalDeadLetters,
    },
    "[ops] operational snapshot emitted",
  );
}
