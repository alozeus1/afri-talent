// §5.8 — apply-batch-queue BullMQ worker.
//
// Consumes one task per (batchId, jobId) emitted by routes/autopilot.ts when
// APPLY_QUEUES_ENABLED. Recreates the per-job slice of the old in-process
// processBatch loop: validate job, dedup, generate cover letter, create
// Application, increment AutoApplyBatch.jobsApplied / jobsFailed. On every
// finish, recomputes the parent batch's terminal status.
//
// BullMQ retries failed jobs (3 attempts, exp backoff) — the worker therefore
// must not double-increment counters. Idempotency is enforced by an existing
// (jobId, candidateId) Application row.

import { Worker } from "bullmq";
import { Redis } from "ioredis";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";
import { recomputeAutoApplyBatchStatus } from "../lib/apply/batch-rollup.js";
import { isApplyQueuesEnabled, type ApplyBatchJobData } from "../lib/queues/apply-queues.js";

let worker: Worker | null = null;

export function startApplyBatchWorker(): Worker | null {
  if (!isApplyQueuesEnabled()) {
    logger.debug("[apply-batch-worker] disabled (APPLY_QUEUES_ENABLED=0 or no Redis)");
    return null;
  }
  if (worker) return worker;

  const url = process.env.APPLY_QUEUES_REDIS_URL || process.env.REDIS_URL;
  if (!url) return null;
  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  worker = new Worker<ApplyBatchJobData>(
    "apply-batch-queue",
    async (job) => {
      const { batchId, candidateId, jobId, customMessage } = job.data;
      try {
        const target = await prisma.job.findUnique({ where: { id: jobId } });
        if (!target || target.status !== "PUBLISHED") {
          await prisma.autoApplyBatch.update({
            where: { id: batchId },
            data: { jobsFailed: { increment: 1 } },
          });
          return;
        }

        const existing = await prisma.application.findFirst({
          where: { jobId, candidateId },
          select: { id: true },
        });
        if (existing) {
          // Idempotent: either a prior attempt landed or the candidate had
          // already applied. Count as failed (existing-application case) and
          // move on — no double-create.
          await prisma.autoApplyBatch.update({
            where: { id: batchId },
            data: { jobsFailed: { increment: 1 } },
          });
          return;
        }

        const profile = await prisma.candidateProfile.findUnique({
          where: { userId: candidateId },
          include: { resumes: { where: { isActive: true, securityStatus: "CLEAN" }, take: 1 } },
        });
        const user = await prisma.user.findUnique({ where: { id: candidateId }, select: { name: true } });
        const companyName = target.employerId
          ? (await prisma.employer.findUnique({
              where: { id: target.employerId },
              select: { companyName: true },
            }))?.companyName ?? target.sourceName ?? "the company"
          : target.sourceName ?? "the company";

        const cl = await generateQuickCoverLetter({
          candidateName: user?.name ?? "Candidate",
          headline: profile?.headline ?? null,
          skills: profile?.skills ?? [],
          bio: profile?.bio ?? null,
          yearsExperience: profile?.yearsExperience ?? 0,
          jobTitle: target.title,
          companyName,
          jobDescription: customMessage
            ? `${target.description}\n\nCandidate note: ${customMessage}`
            : target.description,
        });

        await prisma.application.create({
          data: {
            jobId,
            candidateId,
            cvUrl: profile?.resumes?.[0]?.s3Key ?? null,
            coverLetter: cl.coverLetter,
            notes: `[Batch Application via queue] Cover letter source: ${cl.source}`,
            status: "PENDING",
          },
        });

        await prisma.autoApplyBatch.update({
          where: { id: batchId },
          data: { jobsApplied: { increment: 1 }, creditsUsed: { increment: 1 } },
        });
      } catch (err) {
        logger.warn({ err, batchId, jobId }, "[apply-batch-worker] job failed");
        // Only count once even if BullMQ retries — count on the final attempt.
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await prisma.autoApplyBatch.update({
            where: { id: batchId },
            data: { jobsFailed: { increment: 1 } },
          }).catch(() => undefined);
        }
        throw err; // surface to BullMQ for the retry / fail-event pipeline
      } finally {
        await recomputeAutoApplyBatchStatus(prisma, batchId).catch(() => undefined);
      }
    },
    { connection, concurrency: parseInt(process.env.APPLY_BATCH_WORKER_CONCURRENCY || "4", 10) },
  );

  worker.on("failed", (job, err) => {
    logger.warn({ err: err?.message, jobId: job?.id, attempts: job?.attemptsMade }, "[apply-batch-worker] job failed");
  });

  logger.info({ concurrency: worker.opts.concurrency }, "[apply-batch-worker] started");
  return worker;
}

export async function stopApplyBatchWorker(): Promise<void> {
  if (!worker) return;
  await worker.close().catch(() => undefined);
  worker = null;
}
