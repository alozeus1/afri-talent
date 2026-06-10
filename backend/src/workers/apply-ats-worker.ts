// PR S — apply-ats-queue BullMQ worker (Track A / ATS_API_*).
//
// Consumes jobs enqueued by lib/apply/dispatch.ts when APPLY_QUEUES_ENABLED.
// Each job carries { applicationId, strategy }; the worker submits the
// application to the vendor ATS and settles the Application row (SUBMITTED +
// ATS_ID proof, or FAILED with lastSubmissionError on the final attempt).
//
// Same idempotency posture as apply-email-worker: stable per-application
// jobId at enqueue time, gateSubmit blocks re-submits while SUBMITTING, and
// retries short-circuit on rows no longer in SUBMITTING.

import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { ApplyStrategy, SubmissionStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { isApplyQueuesEnabled, type ApplyAtsJobData } from "../lib/queues/apply-queues.js";
import { settleAtsApplication, failAtsApplication } from "../lib/apply/ats-submit.js";

let worker: Worker | null = null;

export function startApplyAtsWorker(): Worker | null {
  if (!isApplyQueuesEnabled()) {
    logger.debug("[apply-ats-worker] disabled (APPLY_QUEUES_ENABLED=0 or no Redis)");
    return null;
  }
  if (worker) return worker;

  const url = process.env.APPLY_QUEUES_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  worker = new Worker<ApplyAtsJobData>(
    "apply-ats-queue",
    async (job) => {
      const { applicationId, strategy } = job.data;

      const current = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { submissionStatus: true },
      });
      if (!current) {
        logger.warn({ applicationId }, "[apply-ats-worker] application no longer exists");
        return;
      }
      if (current.submissionStatus !== SubmissionStatus.SUBMITTING) {
        logger.info(
          { applicationId, status: current.submissionStatus },
          "[apply-ats-worker] application not in SUBMITTING; skipping",
        );
        return;
      }

      try {
        const result = await settleAtsApplication(applicationId, strategy as ApplyStrategy);
        logger.info(
          { applicationId, provider: result.provider, externalApplicationId: result.externalApplicationId },
          "[apply-ats-worker] application submitted + settled",
        );
      } catch (error) {
        const attemptsAllowed = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;
        if (isFinalAttempt) {
          await failAtsApplication(applicationId, error);
        }
        throw error; // let BullMQ record the failure / drive retries
      }
    },
    { connection, concurrency: 3 },
  );

  worker.on("error", (err: Error) => {
    logger.warn({ err: err.message }, "[apply-ats-worker] worker error");
  });

  logger.info("[apply-ats-worker] started");
  return worker;
}

export async function stopApplyAtsWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
