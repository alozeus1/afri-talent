#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-off: recompute `Job.jobField` for aggregated jobs on a LOCAL database.
//
// The old aggregator classifier was first-match-wins over title + the full
// description with Healthcare listed first, so benefits boilerplate ("medical
// insurance", "financial wellbeing") pushed engineering roles into
// Healthcare/Finance/Marketing. Ingest now resolves the field title-first,
// then from the controlled `taxonomyField`; this script applies the same
// resolution to rows that were written before the fix.
//
//   npx tsx scripts/jobs/backfill-job-field.ts            # dry run: print the diff
//   npx tsx scripts/jobs/backfill-job-field.ts --apply    # write the changes
//
// Only jobSource = AGGREGATED rows are touched; employer-posted jobs keep the
// field the employer chose. Refuses to run unless DATABASE_URL points at a
// local host (localhost, 127.0.0.1, ::1 or the compose service "postgres").
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { resolveJobField } from "../../src/lib/jobs/aggregator/taxonomy.js";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
const BATCH_SIZE = 500;

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const host = new URL(raw).hostname;
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`Refusing to backfill: DATABASE_URL host "${host}" is not a local database`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  assertLocalDatabase();

  const before = new Map<string, number>();
  const after = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.job.findMany({
      where: { jobSource: "AGGREGATED" },
      select: { id: true, title: true, description: true, tags: true, jobField: true, taxonomyField: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned += 1;
      // `existing` is intentionally not passed: the stored value is the output
      // of the broken classifier, so it must not act as a fallback here.
      const next = resolveJobField({
        title: row.title,
        taxonomyField: row.taxonomyField,
        description: row.description,
        tags: row.tags,
      });
      bump(before, row.jobField ?? "(null)");
      bump(after, next);
      if (next === row.jobField) continue;
      changed += 1;
      if (!apply && changed <= 40) {
        console.log(`[backfill-job-field] ${row.jobField ?? "(null)"} -> ${next}: ${row.title}`);
      }
      if (apply) {
        await prisma.job.update({ where: { id: row.id }, data: { jobField: next } });
      }
    }
  }

  const fmt = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`[backfill-job-field] scanned ${scanned} aggregated job(s); ${changed} ${apply ? "updated" : "would change"}`);
  console.log(`[backfill-job-field] before: ${fmt(before)}`);
  console.log(`[backfill-job-field] after:  ${fmt(after)}`);
  if (!apply) console.log("[backfill-job-field] dry run — re-run with --apply to write");
}

main()
  .catch((error) => {
    console.error("[backfill-job-field] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
