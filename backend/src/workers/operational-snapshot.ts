import {
  AbuseReportStatus,
  BillingDiscrepancyStatus,
  BillingDiscrepancyType,
  BillingEventOutcome,
  JobStatus,
  TrustCaseStatus,
  VerificationArtifactStatus,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { getIngestionReliabilityState, getLastSyncTime } from "./aggregator-cron.js";
import { recordOpsSnapshotMetric } from "../lib/ops/events.js";
import { summarizeDeadLetters } from "../lib/ops/resilience.js";

const AGGREGATOR_STALENESS_MINUTES = parseInt(process.env.AGGREGATOR_STALENESS_MINUTES || "180", 10);

export async function runOperationalSnapshotCycle(): Promise<void> {
  const [
    lastSyncAt,
    ingestionReliability,
    pendingJobs,
    verificationQueueBacklog,
    moderationQueueBacklog,
    abuseReportsOpen,
    fraudDetectionsLast24h,
    deadLettersBySource,
    billingFailedPaymentsOpen,
    billingPendingRefundsOpen,
    billingWebhookFailuresOpen,
    billingSuccessfulPayments24h,
    semanticDocumentsTotal,
    semanticJobDocumentsTotal,
    latestSemanticIndex,
  ] = await Promise.all([
    getLastSyncTime(),
    getIngestionReliabilityState(),
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
    prisma.billingDiscrepancy.count({
      where: {
        type: BillingDiscrepancyType.PAYMENT_FAILURE,
        status: {
          in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED],
        },
      },
    }),
    prisma.billingDiscrepancy.count({
      where: {
        type: BillingDiscrepancyType.PENDING_REFUND,
        status: {
          in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED],
        },
      },
    }),
    prisma.billingDiscrepancy.count({
      where: {
        type: BillingDiscrepancyType.WEBHOOK_FAILURE,
        status: {
          in: [BillingDiscrepancyStatus.OPEN, BillingDiscrepancyStatus.ACKNOWLEDGED],
        },
      },
    }),
    prisma.billingEventAudit.count({
      where: {
        eventType: {
          in: ["invoice.paid", "invoice.payment_succeeded"],
        },
        outcome: BillingEventOutcome.PROCESSED,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.semanticDocument.count(),
    prisma.semanticDocument.count({
      where: {
        namespace: "jobs",
        sourceType: "JOB",
      },
    }),
    prisma.semanticDocument.findFirst({
      orderBy: { lastIndexedAt: "desc" },
      select: { lastIndexedAt: true },
    }),
  ]);

  const minutesSinceLastSync = lastSyncAt
    ? Math.max(0, Math.round((Date.now() - lastSyncAt.getTime()) / 60000))
    : AGGREGATOR_STALENESS_MINUTES + 1;
  const totalDeadLetters = Object.values(deadLettersBySource).reduce((sum, count) => sum + count, 0);
  const semanticIndexFreshnessMinutes = latestSemanticIndex?.lastIndexedAt
    ? Math.max(0, Math.round((Date.now() - latestSemanticIndex.lastIndexedAt.getTime()) / 60000))
    : -1;

  recordOpsSnapshotMetric({
    metricName: "job_ingestion_freshness_minutes",
    value: minutesSinceLastSync,
    details: {
      last_sync_at: lastSyncAt?.toISOString() ?? "never",
      stale: minutesSinceLastSync > AGGREGATOR_STALENESS_MINUTES,
    },
  });

  recordOpsSnapshotMetric({
    metricName: "ingestion_cycle_status",
    value: ingestionReliability.lastCycleStatus === "failure" ? 0 : 1,
    details: {
      cycle_status: ingestionReliability.lastCycleStatus,
      last_cycle_at: ingestionReliability.lastCycleAt?.toISOString() ?? "never",
    },
  });

  recordOpsSnapshotMetric({
    metricName: "consecutive_failure_count",
    value: ingestionReliability.consecutiveFailureCount,
  });

  recordOpsSnapshotMetric({
    metricName: "consecutive_zero_result_count",
    value: ingestionReliability.consecutiveZeroResultCount,
  });

  recordOpsSnapshotMetric({
    metricName: "jobs_ingested_per_cycle",
    value: ingestionReliability.lastJobsIngested,
    details: {
      cycle_status: ingestionReliability.lastCycleStatus,
    },
  });

  recordOpsSnapshotMetric({
    metricName: "last_successful_ingestion_timestamp",
    value: ingestionReliability.lastSuccessfulIngestionAt
      ? Math.floor(ingestionReliability.lastSuccessfulIngestionAt.getTime() / 1000)
      : 0,
    details: {
      iso8601: ingestionReliability.lastSuccessfulIngestionAt?.toISOString() ?? "never",
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
    metricName: "billing_failed_payments_open",
    value: billingFailedPaymentsOpen,
  });

  recordOpsSnapshotMetric({
    metricName: "billing_pending_refunds_open",
    value: billingPendingRefundsOpen,
  });

  recordOpsSnapshotMetric({
    metricName: "billing_webhook_failures_open",
    value: billingWebhookFailuresOpen,
  });

  recordOpsSnapshotMetric({
    metricName: "billing_successful_payments_24h",
    value: billingSuccessfulPayments24h,
  });

  recordOpsSnapshotMetric({
    metricName: "dead_letter_backlog",
    value: totalDeadLetters,
  });

  recordOpsSnapshotMetric({
    metricName: "semantic_documents_total",
    value: semanticDocumentsTotal,
  });

  recordOpsSnapshotMetric({
    metricName: "semantic_job_documents_total",
    value: semanticJobDocumentsTotal,
  });

  recordOpsSnapshotMetric({
    metricName: "semantic_index_freshness_minutes",
    value: semanticIndexFreshnessMinutes,
    details: {
      last_indexed_at: latestSemanticIndex?.lastIndexedAt?.toISOString() ?? "never",
      indexed: semanticIndexFreshnessMinutes >= 0,
    },
  });

  logger.info(
    {
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      minutesSinceLastSync,
      ingestionReliability,
      pendingJobs,
      verificationQueueBacklog,
      moderationQueueBacklog,
      abuseReportsOpen,
      fraudDetectionsLast24h,
      billingFailedPaymentsOpen,
      billingPendingRefundsOpen,
      billingWebhookFailuresOpen,
      billingSuccessfulPayments24h,
      totalDeadLetters,
      semanticDocumentsTotal,
      semanticJobDocumentsTotal,
      semanticIndexFreshnessMinutes,
    },
    "[ops] operational snapshot emitted",
  );
}
