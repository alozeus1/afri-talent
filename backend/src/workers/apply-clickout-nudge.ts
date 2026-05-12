// ─────────────────────────────────────────────────────────────────────────────
// §5.6 — Track D (assisted redirect) clickout-nudge worker.
//
// Runs hourly (via scheduler.ts). Two phases per pass:
//
//   1. 24-HOUR NUDGE
//      Pick ApplyAttempt rows where:
//        candidateResponse = PENDING
//        nudgeSentAt        IS NULL
//        clickedAt          ≤ now − NUDGE_AFTER_HOURS
//      Send "did you complete the application?" notification + stamp
//      nudgeSentAt so we don't ping twice.
//
//   2. 7-DAY TIMEOUT
//      Pick ApplyAttempt rows where:
//        candidateResponse = PENDING
//        clickedAt          ≤ now − TIMEOUT_AFTER_DAYS
//      Mark NO_RESPONSE_TIMEOUT + transition the parent Application from
//      AWAITING_USER_CONFIRMATION to FAILED with a readable
//      lastSubmissionError.
//
// Pure decision rules are exported (`decideNudgeAction`) so the unit tests can
// drive the worker logic without seeding Prisma rows.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CandidateApplyResponse,
  NotificationType,
  SubmissionStatus,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { createUserNotification } from "../lib/notifications.js";
import { recordOpsEvent } from "../lib/ops/events.js";

export const APPLY_CLICKOUT_NUDGE_INTERVAL_MS =
  parseInt(process.env.APPLY_CLICKOUT_NUDGE_INTERVAL_MINUTES || "60", 10) * 60 * 1000;

export const NUDGE_AFTER_HOURS = parseInt(process.env.APPLY_CLICKOUT_NUDGE_HOURS || "24", 10);
export const TIMEOUT_AFTER_DAYS = parseInt(process.env.APPLY_CLICKOUT_TIMEOUT_DAYS || "7", 10);

const BATCH_SIZE = Math.min(
  parseInt(process.env.APPLY_CLICKOUT_NUDGE_BATCH_SIZE || "100", 10),
  500,
);

interface CycleStats {
  nudged: number;
  timedOut: number;
  errors: number;
}

export async function runApplyClickoutNudgeCycle(now: Date = new Date()): Promise<CycleStats> {
  const stats: CycleStats = { nudged: 0, timedOut: 0, errors: 0 };

  const nudgeCutoff = new Date(now.getTime() - NUDGE_AFTER_HOURS * 3_600_000);
  const timeoutCutoff = new Date(now.getTime() - TIMEOUT_AFTER_DAYS * 86_400_000);

  // ── Phase 1: 24-hour nudge ─────────────────────────────────────────────
  const dueForNudge = await prisma.applyAttempt.findMany({
    where: {
      candidateResponse: CandidateApplyResponse.PENDING,
      nudgeSentAt: null,
      clickedAt: { lte: nudgeCutoff },
      // Don't nudge if we're already past the timeout — phase 2 will handle it.
      AND: [{ clickedAt: { gt: timeoutCutoff } }],
    },
    include: {
      application: {
        select: { id: true, candidateId: true, jobId: true, job: { select: { title: true, sourceName: true } } },
      },
    },
    orderBy: { clickedAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const attempt of dueForNudge) {
    try {
      const jobTitle = attempt.application.job?.title ?? "the role you applied to";
      const company = attempt.application.job?.sourceName ?? "the company";
      await createUserNotification({
        userId: attempt.application.candidateId,
        type: NotificationType.RETENTION_NUDGE,
        title: `Did you complete your application to ${company}?`,
        body: `It's been a day since you opened the application for ${jobTitle}. Let us know whether you finished — it helps us track your apply pipeline.`,
        channel: "applicationReminders",
        metadata: { applicationId: attempt.applicationId, applyAttemptId: attempt.id, kind: "apply_clickout_nudge" },
      });
      await prisma.applyAttempt.update({
        where: { id: attempt.id },
        data: { nudgeSentAt: now },
      });
      stats.nudged += 1;
    } catch (err) {
      stats.errors += 1;
      logger.warn(
        { err: (err as Error).message, applyAttemptId: attempt.id },
        "[apply-clickout-nudge] failed to send nudge",
      );
    }
  }

  // ── Phase 2: 7-day timeout ─────────────────────────────────────────────
  const dueForTimeout = await prisma.applyAttempt.findMany({
    where: {
      candidateResponse: CandidateApplyResponse.PENDING,
      clickedAt: { lte: timeoutCutoff },
    },
    select: { id: true, applicationId: true },
    orderBy: { clickedAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const attempt of dueForTimeout) {
    try {
      await prisma.$transaction([
        prisma.applyAttempt.update({
          where: { id: attempt.id },
          data: {
            candidateResponse: CandidateApplyResponse.NO_RESPONSE_TIMEOUT,
            respondedAt: now,
          },
        }),
        prisma.application.updateMany({
          where: {
            id: attempt.applicationId,
            // Only flip to FAILED if the parent is still parked in
            // AWAITING_USER_CONFIRMATION — don't clobber rows the candidate
            // confirmed under a different attempt or that already failed.
            submissionStatus: SubmissionStatus.AWAITING_USER_CONFIRMATION,
          },
          data: {
            submissionStatus: SubmissionStatus.FAILED,
            lastSubmissionError: `Candidate did not confirm completion within ${TIMEOUT_AFTER_DAYS} days`,
          },
        }),
      ]);
      stats.timedOut += 1;
    } catch (err) {
      stats.errors += 1;
      logger.warn(
        { err: (err as Error).message, applyAttemptId: attempt.id },
        "[apply-clickout-nudge] failed to timeout attempt",
      );
    }
  }

  logger.info(
    { ...stats, nudgeAfterHours: NUDGE_AFTER_HOURS, timeoutAfterDays: TIMEOUT_AFTER_DAYS },
    "[apply-clickout-nudge] cycle complete",
  );

  recordOpsEvent({
    metricName: "apply_clickout_nudge_cycle",
    category: "applications",
    outcome: stats.errors > 0 ? "failure" : "success",
    severity: stats.errors > 0 ? "warning" : "info",
    details: { ...stats },
  });

  return stats;
}

// ─── Test seam — decision logic without DB/notifications. ────────────────
export type NudgeDecision =
  | { action: "send_nudge" }
  | { action: "timeout" }
  | { action: "skip" };

export function decideNudgeAction(
  attempt: { clickedAt: Date; nudgeSentAt: Date | null; candidateResponse: CandidateApplyResponse },
  now: Date = new Date(),
  config: { nudgeAfterHours?: number; timeoutAfterDays?: number } = {},
): NudgeDecision {
  if (attempt.candidateResponse !== CandidateApplyResponse.PENDING) return { action: "skip" };
  const nudgeHours = config.nudgeAfterHours ?? NUDGE_AFTER_HOURS;
  const timeoutDays = config.timeoutAfterDays ?? TIMEOUT_AFTER_DAYS;
  const nudgeCutoff = new Date(now.getTime() - nudgeHours * 3_600_000);
  const timeoutCutoff = new Date(now.getTime() - timeoutDays * 86_400_000);

  if (attempt.clickedAt.getTime() <= timeoutCutoff.getTime()) {
    return { action: "timeout" };
  }
  if (attempt.clickedAt.getTime() <= nudgeCutoff.getTime() && !attempt.nudgeSentAt) {
    return { action: "send_nudge" };
  }
  return { action: "skip" };
}
