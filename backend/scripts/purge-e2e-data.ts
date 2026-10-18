#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// Purge end-to-end test data from a LOCAL database.
//
// The local-docker Playwright suite (frontend/e2e/local-docker) registers
// throwaway accounts whose email starts with the reserved "e2e-" prefix, and
// older runs used timestamped addresses (hr@acme<ts>.com, cand<ts>@example.com,
// ...). This script finds those accounts and:
//   1. takes their employer-posted jobs off public listings (status REMOVED),
//   2. anonymizes + soft-deletes the account (same path as GDPR erasure).
// Admin accounts and the fixed seed logins are never touched.
//
//   npx tsx scripts/purge-e2e-data.ts            # dry run: list what matches
//   npx tsx scripts/purge-e2e-data.ts --apply    # perform the purge
//
// Refuses to run unless DATABASE_URL points at a local host (localhost,
// 127.0.0.1, ::1 or the compose service "postgres").
// ─────────────────────────────────────────────────────────────────────────────

import { JobStatus, Role } from "@prisma/client";
import prisma from "../src/lib/prisma.js";
import { anonymizeUser } from "../src/lib/privacy/anonymize.js";

/** Reserved prefix for accounts created by E2E specs. */
export const E2E_EMAIL_PREFIX = "e2e-";

/** Addresses produced by specs written before the reserved prefix existed. */
const LEGACY_E2E_EMAIL_PATTERNS: RegExp[] = [
  /^hr@acme\d{10,}\.com$/,
  /^hr\d{10,}@acme-hiring\.com$/,
  /^cand\d{10,}@example\.com$/,
  /^admin-e2e-cand\d{10,}@example\.com$/,
  /^hr@adm\d{10,}\.com$/,
  /^contrast-\d{10,}@example\.com$/,
];

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);

export function isE2eEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  return value.startsWith(E2E_EMAIL_PREFIX) || LEGACY_E2E_EMAIL_PATTERNS.some((pattern) => pattern.test(value));
}

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const host = new URL(raw).hostname;
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`Refusing to purge: DATABASE_URL host "${host}" is not a local database`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  assertLocalDatabase();

  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { not: Role.ADMIN },
      OR: [
        { email: { startsWith: E2E_EMAIL_PREFIX, mode: "insensitive" } },
        { email: { contains: "acme", mode: "insensitive" } },
        { email: { startsWith: "hr@adm", mode: "insensitive" } },
        { email: { endsWith: "@example.com", mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, role: true, employer: { select: { id: true } } },
  });
  const users = candidates.filter((user) => isE2eEmail(user.email));
  const employerIds = users.flatMap((user) => (user.employer ? [user.employer.id] : []));

  const jobs = employerIds.length
    ? await prisma.job.findMany({
        where: { employerId: { in: employerIds }, status: { not: JobStatus.REMOVED } },
        select: { id: true, title: true, status: true },
      })
    : [];

  console.log(`[purge-e2e] matched ${users.length} account(s) and ${jobs.length} job(s)${apply ? "" : " (dry run; pass --apply to purge)"}`);
  for (const user of users) console.log(`  user ${user.role.padEnd(9)} ${user.email}`);
  for (const job of jobs) console.log(`  job  ${job.status.padEnd(9)} ${job.title}`);
  if (!apply) return;

  if (jobs.length) {
    const removed = await prisma.job.updateMany({
      where: { id: { in: jobs.map((job) => job.id) } },
      data: {
        status: JobStatus.REMOVED,
        isFeatured: false,
        featuredAt: null,
        moderationReason: "E2E test data purged",
      },
    });
    console.log(`[purge-e2e] removed ${removed.count} job(s) from listings`);
  }

  let anonymized = 0;
  for (const user of users) {
    const result = await anonymizeUser(user.id);
    if (result.status === "anonymized") anonymized += 1;
  }
  console.log(`[purge-e2e] anonymized + soft-deleted ${anonymized} account(s)`);
}

main()
  .catch((error) => {
    console.error("[purge-e2e] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
