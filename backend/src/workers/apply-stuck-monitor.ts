// §5.8 — stuck-application monitor (DLQ surrogate).
//
// Hourly. Finds Application rows in SUBMITTING for longer than
// APPLY_STUCK_THRESHOLD_MINUTES (default 30). Marks them FAILED with a
// readable lastSubmissionError so candidates see real status, and emits an
// ops event so admins can investigate. A true Lambda DLQ for the per-track
// adapters ships with PR Q / PR S / PR T.

import { SubmissionStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";

export const APPLY_STUCK_MONITOR_INTERVAL_MS =
  parseInt(process.env.APPLY_STUCK_MONITOR_INTERVAL_MINUTES || "60", 10) * 60 * 1000;

export const STUCK_THRESHOLD_MINUTES = parseInt(process.env.APPLY_STUCK_THRESHOLD_MINUTES || "30", 10);

export async function runApplyStuckMonitorCycle(now: Date = new Date()): Promise<{ rescued: number }> {
  const cutoff = new Date(now.getTime() - STUCK_THRESHOLD_MINUTES * 60_000);
  const stuck = await prisma.application.findMany({
    where: { submissionStatus: SubmissionStatus.SUBMITTING, updatedAt: { lte: cutoff } },
    select: { id: true },
    take: 100,
  });
  if (stuck.length === 0) {
    return { rescued: 0 };
  }
  const error = `Stuck in SUBMITTING for > ${STUCK_THRESHOLD_MINUTES} min`;
  await prisma.application.updateMany({
    where: { id: { in: stuck.map((s) => s.id) } },
    data: { submissionStatus: SubmissionStatus.FAILED, lastSubmissionError: error },
  });
  recordOpsEvent({
    metricName: "apply_pathway_stuck_rescued",
    category: "applications",
    outcome: "failure",
    severity: "warning",
    details: { count: stuck.length, thresholdMinutes: STUCK_THRESHOLD_MINUTES },
  });
  logger.warn({ count: stuck.length }, "[apply-stuck-monitor] rescued stuck applications");
  return { rescued: stuck.length };
}
