#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// §12.1 — re-index semantic storage for the pgvector cutover.
//
// The master prompt directive:
//   "Truncate the existing SemanticDocument rows (they were indexed under the
//    hash fallback in staging). Re-index."
//
// This script resets the index sources so the standing workers
// (skills-job-embedder + semantic-indexer) re-embed them on their next pass.
// It does NOT call OpenAI itself — embedding spend stays inside the workers
// so the cost ceiling is observable in one place.
//
// Resets:
//   * TRUNCATE "SemanticDocument" (always — those rows are hash vectors).
//   * UPDATE "Job"                SET embedding = NULL  (worker re-embeds).
//   * UPDATE "UserResume"         SET embedding = NULL  (worker re-embeds).
//   * UPDATE "CandidateResumeVersion" SET embedding = NULL (worker re-embeds).
//
// Usage:
//   npx tsx backend/scripts/jobs/reindex-semantic.ts \
//     --semantic-only          # truncate SemanticDocument only
//     --jobs-only              # null Job.embedding only
//     --resumes-only           # null UserResume + CandidateResumeVersion only
//     --dry-run                # report counts, write nothing
//   (no flag → all four)
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";

interface Args {
  dryRun: boolean;
  semanticOnly: boolean;
  jobsOnly: boolean;
  resumesOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    semanticOnly: false,
    jobsOnly: false,
    resumesOnly: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--semantic-only") out.semanticOnly = true;
    else if (arg === "--jobs-only") out.jobsOnly = true;
    else if (arg === "--resumes-only") out.resumesOnly = true;
  }
  // If no scope flag, run all.
  if (!out.semanticOnly && !out.jobsOnly && !out.resumesOnly) {
    out.semanticOnly = true;
    out.jobsOnly = true;
    out.resumesOnly = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[reindex-semantic] starting", args);

  if (args.semanticOnly) {
    const before = await prisma.semanticDocument.count();
    console.log(`[reindex-semantic] SemanticDocument rows before: ${before}`);
    if (!args.dryRun && before > 0) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "SemanticDocument"`);
      console.log("[reindex-semantic] SemanticDocument truncated");
    }
  }

  if (args.jobsOnly) {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Job" WHERE embedding IS NOT NULL
    `;
    const before = Number(result[0]?.count ?? 0n);
    console.log(`[reindex-semantic] Job rows with embedding: ${before}`);
    if (!args.dryRun && before > 0) {
      await prisma.$executeRawUnsafe(`UPDATE "Job" SET embedding = NULL WHERE embedding IS NOT NULL`);
      console.log(`[reindex-semantic] cleared Job.embedding on ${before} rows`);
    }
  }

  if (args.resumesOnly) {
    const resumeRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "UserResume" WHERE embedding IS NOT NULL
    `;
    const resumeBefore = Number(resumeRows[0]?.count ?? 0n);
    console.log(`[reindex-semantic] UserResume rows with embedding: ${resumeBefore}`);
    if (!args.dryRun && resumeBefore > 0) {
      await prisma.$executeRawUnsafe(`UPDATE "UserResume" SET embedding = NULL WHERE embedding IS NOT NULL`);
      console.log(`[reindex-semantic] cleared UserResume.embedding on ${resumeBefore} rows`);
    }

    // CandidateResumeVersion.embedding is added by 20260512000100; the column
    // may not exist on environments that haven't migrated yet, so probe first.
    const columnExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'CandidateResumeVersion' AND column_name = 'embedding'
      ) AS exists
    `;
    if (columnExists[0]?.exists) {
      const versionRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "CandidateResumeVersion" WHERE embedding IS NOT NULL
      `;
      const versionBefore = Number(versionRows[0]?.count ?? 0n);
      console.log(`[reindex-semantic] CandidateResumeVersion rows with embedding: ${versionBefore}`);
      if (!args.dryRun && versionBefore > 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "CandidateResumeVersion" SET embedding = NULL WHERE embedding IS NOT NULL`,
        );
        console.log(`[reindex-semantic] cleared CandidateResumeVersion.embedding on ${versionBefore} rows`);
      }
    } else {
      console.log("[reindex-semantic] CandidateResumeVersion.embedding column not present yet; skipping");
    }
  }

  console.log(
    "[reindex-semantic] done. The standing workers (skills-job-embedder + semantic-indexer) " +
      "will re-populate embeddings on their next cycle.",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[reindex-semantic] fatal", err);
  process.exit(1);
});
