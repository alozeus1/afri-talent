// PR Q — apply-email-queue BullMQ worker (Track B / EMAIL_DRAFT).
//
// Consumes jobs enqueued by lib/apply/dispatch.ts when APPLY_QUEUES_ENABLED.
// Each job carries { applicationId }; the worker sends the application email
// and settles the Application row (SUBMITTED + EMAIL_MESSAGE_ID proof, or
// FAILED with lastSubmissionError on the final attempt).
//
// Idempotency: the dispatcher enqueues with a stable jobId per application,
// and the /submit route's gateSubmit blocks re-submits while the row sits in
// SUBMITTING — so a given application is sent at most once per submission.
// BullMQ retries (3 attempts, exp backoff) re-run the whole handler; sends
// that already settled the row short-circuit on the status check below.

import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { SubmissionStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { isApplyQueuesEnabled } from "../lib/queues/apply-queues.js";
import {
  settleEmailApplication,
  failEmailApplication,
  EmployerOptedOutError,
} from "../lib/apply/email-draft.js";

export interface ApplyEmailJobData {
  applicationId: string;
}

let worker: Worker | null = null;

export function startApplyEmailWorker(): Worker | null {
  if (!isApplyQueuesEnabled()) {
    logger.debug("[apply-email-worker] disabled (APPLY_QUEUES_ENABLED=0 or no Redis)");
    return null;
  }
  if (worker) return worker;

  const url = process.env.APPLY_QUEUES_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  worker = new Worker<ApplyEmailJobData>(
    "apply-email-queue",
    async (job) => {
      const { applicationId } = job.data;

      // Short-circuit retries of an already-settled row.
      const current = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { submissionStatus: true },
      });
      if (!current) {
        logger.warn({ applicationId }, "[apply-email-worker] application no longer exists");
        return;
      }
      if (current.submissionStatus !== SubmissionStatus.SUBMITTING) {
        logger.info(
          { applicationId, status: current.submissionStatus },
          "[apply-email-worker] application not in SUBMITTING; skipping",
        );
        return;
      }

      try {
        const sent = await settleEmailApplication(applicationId);
        logger.info(
          { applicationId, messageId: sent.messageId },
          "[apply-email-worker] application email sent + settled",
        );
      } catch (error) {
        // Opt-out at send time is terminal (no point retrying); the queued
        // path can't degrade to assisted-redirect because the candidate's
        // request has already returned.
        const attemptsAllowed = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= attemptsAllowed;
        if (error instanceof EmployerOptedOutError || isFinalAttempt) {
          await failEmailApplication(applicationId, error);
        }
        throw error; // let BullMQ record the failure / drive retries
      }
    },
    { connection, concurrency: 5 },
  );

  worker.on("error", (err: Error) => {
    logger.warn({ err: err.message }, "[apply-email-worker] worker error");
  });

  logger.info("[apply-email-worker] started");
  return worker;
}

export async function stopApplyEmailWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
