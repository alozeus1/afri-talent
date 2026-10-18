#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// One-off: bring stored AGGREGATED jobs on a LOCAL database in line with the
// inventory-hygiene rules the aggregator now applies at ingest.
//
//   1. Evergreen catch-all postings ("Don't see your role…", "General
//      application", "Talent pool") are retired (REJECTED + expired).
//   2. On-site rows whose title or location says "Remote" ("Sr Security
//      Engineer | Remote | Europe") become workplaceType=REMOTE.
//   3. The "Hires from Africa" badge is removed from non-remote roles outside
//      Africa with no stated visa sponsorship (relocation-only or unknown).
//   4. Rows that now share a dedup key (same company + title + canonical
//      location, e.g. OKX "EMEA; Roles - EMEA" vs "Roles - EMEA") keep the most
//      recently published row; the rest are retired.
//
// A re-run of the ingestion pipeline re-evaluates every posting it still
// sees; this script covers rows a feed no longer returns.
//
//   npx tsx scripts/jobs/backfill-inventory-hygiene.ts            # dry run
//   npx tsx scripts/jobs/backfill-inventory-hygiene.ts --apply    # write changes
//
// Refuses to run unless DATABASE_URL points at a local host.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { isEvergreenPosting } from "../../src/lib/jobs/aggregator/engine/quality.js";
import { mentionsAfrica } from "../../src/lib/jobs/aggregator/engine/eligibility.js";
import { signalsRemote } from "../../src/lib/jobs/aggregator/taxonomy.js";
import { buildDedupKeys } from "../../src/lib/jobs/dedup.js";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
const TAG = "[backfill-inventory-hygiene]";

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const host = new URL(raw).hostname;
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`Refusing to backfill: DATABASE_URL host "${host}" is not a local database`);
  }
}

const LIVE = { jobSource: "AGGREGATED" as const, employerId: null, status: "PUBLISHED" as const, isExpired: false };
const RETIRE = { status: "REJECTED" as const, isExpired: true, freshnessScore: 0 };

async function counts() {
  const rows = await prisma.job.findMany({
    where: LIVE,
    select: { title: true, location: true, workplaceType: true, visaSponsorship: true, hiresFromAfrica: true },
  });
  return {
    live: rows.length,
    badged: rows.filter((row) => row.hiresFromAfrica).length,
    evergreen: rows.filter((row) => isEvergreenPosting(row.title)).length,
    badgedNonRemoteAbroadNoVisa: rows.filter(
      (row) =>
        row.hiresFromAfrica &&
        row.workplaceType !== "REMOTE" &&
        row.visaSponsorship !== "YES" &&
        !mentionsAfrica(row.location ?? ""),
    ).length,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  assertLocalDatabase();

  const before = await counts();
  const rows = await prisma.job.findMany({
    where: LIVE,
    select: {
      id: true,
      title: true,
      location: true,
      sourceName: true,
      workplaceType: true,
      visaSponsorship: true,
      hiresFromAfrica: true,
      publishedAt: true,
    },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
  });

  const retire = new Map<string, string>();
  const updates = new Map<string, { workplaceType?: "REMOTE"; hiresFromAfrica?: boolean }>();
  const patch = (id: string, data: { workplaceType?: "REMOTE"; hiresFromAfrica?: boolean }) =>
    updates.set(id, { ...updates.get(id), ...data });

  const firstByKey = new Map<string, string>();
  for (const row of rows) {
    if (isEvergreenPosting(row.title)) {
      retire.set(row.id, `evergreen: ${row.title}`);
      continue;
    }

    const k1 = buildDedupKeys({ title: row.title, company: row.sourceName, location: row.location }).k1;
    const keeper = firstByKey.get(k1);
    if (keeper) {
      retire.set(row.id, `duplicate of ${keeper}: ${row.title} @ ${row.location}`);
      continue;
    }
    firstByKey.set(k1, row.id);

    const remote = row.workplaceType === "REMOTE" || signalsRemote(row.title) || signalsRemote(row.location);
    if (remote && row.workplaceType !== "REMOTE" && row.workplaceType !== "HYBRID") {
      patch(row.id, { workplaceType: "REMOTE" });
      console.log(`${TAG} workplaceType REMOTE: ${row.title} @ ${row.location}`);
    }

    if (row.hiresFromAfrica && !remote && row.visaSponsorship !== "YES" && !mentionsAfrica(row.location ?? "")) {
      patch(row.id, { hiresFromAfrica: false });
      console.log(`${TAG} badge removed: ${row.title} @ ${row.location} (visa ${row.visaSponsorship})`);
    }
  }

  for (const [id, reason] of retire) console.log(`${TAG} retire ${id} — ${reason}`);

  if (apply) {
    if (retire.size > 0) await prisma.job.updateMany({ where: { id: { in: [...retire.keys()] } }, data: RETIRE });
    for (const [id, data] of updates) await prisma.job.update({ where: { id }, data });
  }

  const after = apply ? await counts() : null;
  console.log(`${TAG} scanned ${rows.length} live aggregated job(s)`);
  console.log(`${TAG} retire=${retire.size} update=${updates.size} ${apply ? "(applied)" : "(dry run)"}`);
  console.log(`${TAG} before: ${JSON.stringify(before)}`);
  if (after) console.log(`${TAG} after:  ${JSON.stringify(after)}`);
  else console.log(`${TAG} dry run — re-run with --apply to write`);
}

main()
  .catch((error) => {
    console.error(`${TAG} failed:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
