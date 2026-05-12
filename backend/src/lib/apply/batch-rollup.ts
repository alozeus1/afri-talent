// §5.8 — AutoApplyBatch completion rollup.
//
// "Persist AutoApplyBatch.completedAt only when all child applications are in
// a terminal state." — master prompt §5.8.
//
// The fan-out (apply-batch-queue) increments jobsApplied / jobsFailed as each
// task lands. This module decides whether the parent batch is fully resolved
// and, if so, stamps completedAt + status="completed". Returns the final
// counters so callers can log them.

import type { PrismaClient } from "@prisma/client";

export interface BatchRollupOutcome {
  isTerminal: boolean;
  applied: number;
  failed: number;
  pending: number;
}

export async function recomputeAutoApplyBatchStatus(
  prisma: PrismaClient,
  batchId: string,
): Promise<BatchRollupOutcome> {
  const batch = await prisma.autoApplyBatch.findUnique({
    where: { id: batchId },
    select: { jobsTargeted: true, jobsApplied: true, jobsFailed: true, completedAt: true },
  });
  if (!batch) return { isTerminal: false, applied: 0, failed: 0, pending: 0 };

  const applied = batch.jobsApplied ?? 0;
  const failed = batch.jobsFailed ?? 0;
  const total = batch.jobsTargeted ?? 0;
  const pending = Math.max(0, total - applied - failed);
  const isTerminal = pending === 0 && total > 0;

  if (isTerminal && !batch.completedAt) {
    await prisma.autoApplyBatch.update({
      where: { id: batchId },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  return { isTerminal, applied, failed, pending };
}
