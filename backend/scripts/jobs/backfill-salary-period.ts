#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-off: populate `Job.salaryPeriod` for rows written before the column
// existed, on a LOCAL database.
//
// Every legacy salary was rendered as "/year" (the aggregator defaulted an
// undeclared period to yearly and persist dropped it), so each row is resolved
// as if it declared YEARLY: plausible annual amounts become YEARLY, amounts
// <= 300 (contract rates such as "USD 60 - 120") become HOURLY, and 300-999
// stay null (ambiguous; the UI shows the range without a period suffix).
//
//   npx tsx scripts/jobs/backfill-salary-period.ts            # dry run
//   npx tsx scripts/jobs/backfill-salary-period.ts --apply    # write changes
//
// Only rows with a salary and salaryPeriod IS NULL are touched. Refuses to run
// unless DATABASE_URL points at a local host.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { resolveSalaryPeriod } from "../../src/lib/jobs/salary-period.js";

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

  const after = new Map<string, number>();
  let scanned = 0;
  let changed = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.job.findMany({
      where: {
        salaryPeriod: null,
        OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }],
      },
      select: { id: true, title: true, salaryMin: true, salaryMax: true, currency: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned += 1;
      const next = resolveSalaryPeriod({ min: row.salaryMin, max: row.salaryMax, period: "yearly" });
      after.set(next ?? "(null)", (after.get(next ?? "(null)") ?? 0) + 1);
      if (next === null) continue;
      changed += 1;
      console.log(
        `[backfill-salary-period] ${next}: ${row.currency ?? "USD"} ${row.salaryMin ?? "–"}-${row.salaryMax ?? "–"} ${row.title}`,
      );
      if (apply) await prisma.job.update({ where: { id: row.id }, data: { salaryPeriod: next } });
    }
  }

  const fmt = [...after.entries()].map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`[backfill-salary-period] scanned ${scanned} job(s) with salary and no period; ${changed} ${apply ? "updated" : "would change"}`);
  console.log(`[backfill-salary-period] resolved: ${fmt}`);
  if (!apply) console.log("[backfill-salary-period] dry run — re-run with --apply to write");
}

main()
  .catch((error) => {
    console.error("[backfill-salary-period] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
