#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// §4.1 — Backfill controlled-taxonomy classification for existing Job rows.
//
// Iterates Job WHERE taxonomyField IS NULL in batches, runs the
// classifyJobField pipeline (LLM-primary, keyword fallback), and writes
// taxonomyField/taxonomyVersion/taxonomyConfidence.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx backend/scripts/jobs/backfill-taxonomy.ts \
//     --batch-size=200 --limit=50000 --max-cost=10
//
// Flags:
//   --dry-run        Classify but do not write (default false).
//   --batch-size=N   Rows per page (default 200).
//   --limit=N        Cap total rows processed (default no cap).
//   --max-cost=USD   Soft-stop once cumulative est cost exceeds this (default 25).
//   --concurrency=N  Parallel classifications per batch (default 4).
//
// Cost model: Claude Haiku 4.5 inputs are short (≈800 tokens prompt + 100 output).
// At public pricing that's ≈$0.0005/job; the script tracks an estimate and
// halts when it crosses --max-cost.
// ─────────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import prisma from "../../src/lib/prisma.js";
import { classifyJobField } from "../../src/lib/ai/skills/job-field-classifier.js";

interface Args {
  dryRun: boolean;
  batchSize: number;
  limit: number | null;
  maxCostUsd: number;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    dryRun: false,
    batchSize: 200,
    limit: null,
    maxCostUsd: 25,
    concurrency: 4,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--batch-size=")) out.batchSize = Math.max(1, parseInt(arg.split("=")[1], 10));
    else if (arg.startsWith("--limit=")) out.limit = Math.max(1, parseInt(arg.split("=")[1], 10));
    else if (arg.startsWith("--max-cost=")) out.maxCostUsd = parseFloat(arg.split("=")[1]);
    else if (arg.startsWith("--concurrency=")) out.concurrency = Math.max(1, parseInt(arg.split("=")[1], 10));
  }
  return out;
}

// Conservative estimate per classification (input ~800 tok @ $0.25/Mtok +
// output ~100 tok @ $1.25/Mtok ≈ $0.000325). Round up to leave headroom.
const ESTIMATED_USD_PER_CLASSIFICATION = 0.0005;

async function processBatch(
  rows: { id: string; title: string; description: string; sourceName: string | null; seniority: string | null; tags: string[] }[],
  concurrency: number,
  dryRun: boolean,
) {
  let updated = 0;
  let fallbackOnly = 0;
  let llmSucceeded = 0;
  const errors: string[] = [];

  // Simple windowed concurrency.
  for (let i = 0; i < rows.length; i += concurrency) {
    const slice = rows.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (row) => {
        try {
          const result = await classifyJobField({
            title: row.title,
            description: row.description,
            companyName: row.sourceName ?? undefined,
            seniority: row.seniority ?? undefined,
            tags: row.tags,
          });

          if (result.source === "llm") llmSucceeded += 1;
          else fallbackOnly += 1;

          if (!dryRun) {
            await prisma.job.update({
              where: { id: row.id },
              data: {
                taxonomyField: result.field,
                taxonomyVersion: result.version,
                taxonomyConfidence: result.confidence,
              },
            });
          }
          updated += 1;
        } catch (err) {
          errors.push(`${row.id}: ${(err as Error).message}`);
        }
      }),
    );
  }

  return { updated, fallbackOnly, llmSucceeded, errors };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[backfill-taxonomy] starting", args);

  let processed = 0;
  let totalLlm = 0;
  let totalFallback = 0;
  let totalErrors = 0;
  let estCostUsd = 0;

  while (true) {
    const remaining = args.limit ? args.limit - processed : Number.MAX_SAFE_INTEGER;
    if (remaining <= 0) {
      console.log("[backfill-taxonomy] hit --limit; stopping");
      break;
    }

    const take = Math.min(args.batchSize, remaining);
    const rows = await prisma.job.findMany({
      where: { taxonomyField: null },
      select: {
        id: true,
        title: true,
        description: true,
        sourceName: true,
        seniority: true,
        tags: true,
      },
      orderBy: { createdAt: "asc" },
      take,
    });

    if (rows.length === 0) {
      console.log("[backfill-taxonomy] no more rows; done");
      break;
    }

    const batchStart = Date.now();
    const { updated, llmSucceeded, fallbackOnly, errors } = await processBatch(
      rows,
      args.concurrency,
      args.dryRun,
    );

    processed += updated;
    totalLlm += llmSucceeded;
    totalFallback += fallbackOnly;
    totalErrors += errors.length;
    estCostUsd += llmSucceeded * ESTIMATED_USD_PER_CLASSIFICATION;

    console.log(
      `[backfill-taxonomy] batch ${rows.length} rows in ${Date.now() - batchStart}ms ` +
        `(llm=${llmSucceeded}, fallback=${fallbackOnly}, errors=${errors.length}, est_cost=$${estCostUsd.toFixed(4)})`,
    );
    if (errors.length > 0) {
      console.warn("[backfill-taxonomy] errors sample:", errors.slice(0, 5));
    }

    if (estCostUsd >= args.maxCostUsd) {
      console.log(`[backfill-taxonomy] est cost $${estCostUsd.toFixed(2)} ≥ --max-cost $${args.maxCostUsd}; stopping`);
      break;
    }

    // Defensive: if a whole batch was errors and nothing updated, the next page
    // of findMany will return the same rows. Break to avoid an infinite loop.
    if (updated === 0) {
      console.warn("[backfill-taxonomy] batch updated 0 rows; aborting to avoid infinite loop");
      break;
    }
  }

  console.log("[backfill-taxonomy] done", {
    processed,
    llm: totalLlm,
    fallback: totalFallback,
    errors: totalErrors,
    estCostUsd: estCostUsd.toFixed(4),
    dryRun: args.dryRun,
  });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill-taxonomy] fatal", err);
  process.exit(1);
});
