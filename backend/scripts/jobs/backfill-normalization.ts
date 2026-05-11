#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// §4.5 — Backfill canonical company + location forms on existing Job rows.
//
// Iterates all Job rows in batches and rewrites `sourceName` (via
// normalizeCompany) and `location` (via normalizeLocation) when the canonical
// form differs from the stored value.
//
// Pure DB work: no external API calls, no cost ceiling needed.
//
// Usage:
//   npx tsx backend/scripts/jobs/backfill-normalization.ts \
//     --batch-size=500 --limit=200000
//
// Flags:
//   --dry-run        Compute deltas but do not write (default false).
//   --batch-size=N   Rows per page (default 500).
//   --limit=N        Cap total rows processed (default no cap).
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { normalizeCompany, normalizeLocation } from "../../src/lib/jobs/normalize.js";

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
  console.log("[backfill-normalization] starting", args);

  let processed = 0;
  let companyChanged = 0;
  let locationChanged = 0;
  let unchanged = 0;
  let cursor: string | null = null;

  while (true) {
    const remaining = args.limit ? args.limit - processed : Number.MAX_SAFE_INTEGER;
    if (remaining <= 0) {
      console.log("[backfill-normalization] hit --limit; stopping");
      break;
    }

    const take = Math.min(args.batchSize, remaining);
    const rows = await prisma.job.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      select: { id: true, sourceName: true, location: true, workplaceType: true },
      orderBy: { id: "asc" },
      take,
    });

    if (rows.length === 0) {
      console.log("[backfill-normalization] no more rows; done");
      break;
    }

    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const nextCompany = normalizeCompany(row.sourceName);
      const hint =
        row.workplaceType === "REMOTE" ? "remote"
        : row.workplaceType === "HYBRID" ? "hybrid"
        : row.workplaceType === "ONSITE" ? "onsite"
        : null;
      const nextLocation = normalizeLocation(row.location, hint).display;

      const companyDelta = nextCompany && nextCompany !== row.sourceName;
      const locationDelta = nextLocation && nextLocation !== row.location;

      if (!companyDelta && !locationDelta) {
        unchanged += 1;
        continue;
      }

      if (companyDelta) companyChanged += 1;
      if (locationDelta) locationChanged += 1;

      if (!args.dryRun) {
        await prisma.job.update({
          where: { id: row.id },
          data: {
            sourceName: companyDelta ? nextCompany : undefined,
            location: locationDelta ? nextLocation : undefined,
          },
        });
      }
    }

    processed += rows.length;
    console.log(
      `[backfill-normalization] batch ${rows.length} rows (cursor=${cursor}, ` +
        `company_changed=${companyChanged}, location_changed=${locationChanged}, unchanged=${unchanged})`,
    );
  }

  console.log("[backfill-normalization] done", {
    processed,
    companyChanged,
    locationChanged,
    unchanged,
    dryRun: args.dryRun,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-normalization] fatal", err);
  process.exit(1);
});
