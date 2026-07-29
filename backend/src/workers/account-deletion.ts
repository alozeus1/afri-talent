// ─────────────────────────────────────────────────────────────────────────────
// Account deletion reaper
//
// Runs daily (via scheduler.ts). Anonymizes accounts whose deletion request has
// aged past ACCOUNT_DELETION_WINDOW_DAYS, fulfilling the "permanently deleted
// within 30 days" promise made at request time (routes/profile.ts). Without this
// worker the request only stamped deletionRequestedAt and nothing ever erased.
//
// Selection: deletionRequestedAt <= cutoff AND deletedAt IS NULL. Canceling a
// request (clearing deletionRequestedAt on login) removes the account from this
// set; an already-anonymized account (deletedAt set) is skipped. Per-user work
// is best-effort so one failure never blocks the batch.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import { anonymizeUser, ACCOUNT_DELETION_WINDOW_DAYS } from "../lib/privacy/anonymize.js";

export const ACCOUNT_DELETION_INTERVAL_MS =
  parseInt(process.env.ACCOUNT_DELETION_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

// Cap per cycle so a large backlog is drained over several runs rather than in
// one long transaction storm.
const BATCH_SIZE = parseInt(process.env.ACCOUNT_DELETION_BATCH_SIZE || "100", 10);

export async function runAccountDeletionCycle(): Promise<void> {
  const cutoff = new Date(Date.now() - ACCOUNT_DELETION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { lte: cutoff }, deletedAt: null },
    select: { id: true },
    orderBy: { deletionRequestedAt: "asc" },
    take: BATCH_SIZE,
  });

  if (due.length === 0) return;

  let anonymized = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const result = await anonymizeUser(id);
      if (result.status === "anonymized") anonymized += 1;
    } catch (err) {
      failed += 1;
      logger.error(
        { err: String(err), userId: id.slice(0, 8) },
        "[account-deletion] anonymize failed for user (continuing)",
      );
    }
  }

  recordOpsEvent({
    metricName: "account_deletion_cycle",
    category: "privacy",
    details: { due: due.length, anonymized, failed },
  });
  logger.info(
    { due: due.length, anonymized, failed },
    "[account-deletion] cycle complete",
  );
}
