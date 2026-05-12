#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// §5.2 — backfill Job.applyStrategy + applyEmailDetected + applyFormDomain.
//
// Cursor-paginated pass over Job WHERE applyStrategy IS NULL. Pure DB work —
// the classifier is local, no external API calls, no cost budget needed.
//
// Usage:
//   npx tsx backend/scripts/jobs/backfill-apply-strategy.ts \
//     --batch-size=500 --limit=200000
//
// Flags:
//   --dry-run        Classify but do not write (default false).
//   --batch-size=N   Rows per page (default 500).
//   --limit=N        Cap total rows processed (default no cap).
//
// Re-runnable: the WHERE applyStrategy IS NULL filter narrows successive runs
// to unhandled rows.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { classifyApplyStrategy } from "../../src/lib/jobs/apply-strategy.js";

interface Args {
  dryRun: boolean;
  batchSize: number;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, batchSize: 500, limit: null };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--batch-size=")) out.batchSize = Math.max(1, parseInt(arg.split("=")[1], 10));
    else if (arg.startsWith("--limit=")) out.limit = Math.max(1, parseInt(arg.split("=")[1], 10));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[backfill-apply-strategy] starting", args);

  let processed = 0;
  const counts: Record<string, number> = {};
  let cursor: string | null = null;

  while (true) {
    const remaining = args.limit ? args.limit - processed : Number.MAX_SAFE_INTEGER;
    if (remaining <= 0) {
      console.log("[backfill-apply-strategy] hit --limit; stopping");
      break;
    }

    const take = Math.min(args.batchSize, remaining);
    const rows = await prisma.job.findMany({
      where: {
        applyStrategy: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        description: true,
        jobSource: true,
        sourceName: true,
        sourceUrl: true,
        applicationUrl: true,
      },
      orderBy: { id: "asc" },
      take,
    });

    if (rows.length === 0) {
      console.log("[backfill-apply-strategy] no more rows; done");
      break;
    }

    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      // For aggregated rows the `jobSource: "AGGREGATED"` doesn't carry the
      // vendor; sourceName is the closest proxy (set to the vendor token by
      // the aggregator sources). For employer-posted rows jobSource is the
      // useful enum value.
      const sourceForClassifier =
        row.jobSource === "AGGREGATED" ? row.sourceName : row.jobSource;
      const decision = classifyApplyStrategy({
        jobSource: sourceForClassifier,
        description: row.description,
        sourceUrl: row.sourceUrl,
        applicationUrl: row.applicationUrl,
      });

      counts[decision.strategy] = (counts[decision.strategy] ?? 0) + 1;

      if (!args.dryRun) {
        await prisma.job.update({
          where: { id: row.id },
          data: {
            applyStrategy: decision.strategy,
            applyEmailDetected: decision.applyEmailDetected ?? null,
            applyFormDomain: decision.applyFormDomain ?? null,
          },
        });
      }
    }

    processed += rows.length;
    console.log(`[backfill-apply-strategy] batch ${rows.length} rows (cursor=${cursor}, total=${processed})`);
  }

  console.log("[backfill-apply-strategy] done", {
    processed,
    breakdown: counts,
    dryRun: args.dryRun,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-apply-strategy] fatal", err);
  process.exit(1);
});
