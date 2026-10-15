// ─────────────────────────────────────────────────────────────────────────────
// Aggregator dry-run: fetches every configured feed LIVE, runs normalisation,
// Africa-eligibility and cross-source dedupe, and prints per-source counts.
// Never touches the database (no Prisma client is created).
//
//   npx tsx scripts/aggregator-dry-run.ts            # table + samples
//   npx tsx scripts/aggregator-dry-run.ts --json     # full JSON report
//   npx tsx scripts/aggregator-dry-run.ts --feeds remotive,greenhouse
//   npx tsx scripts/aggregator-dry-run.ts --days 14 --rejected 5 --eligible 5
// LLM tie-breaks only run when ANTHROPIC_API_KEY is set and MOCK_AI != 1.
// ─────────────────────────────────────────────────────────────────────────────

import { runIngestion } from "../src/lib/jobs/aggregator/engine/pipeline.js";
import { buildFeedSources } from "../src/lib/jobs/aggregator/engine/registry.js";
import { normalizePosting } from "../src/lib/jobs/aggregator/engine/normalize-posting.js";
import { HttpClient } from "../src/lib/jobs/aggregator/engine/http.js";
import type { FeedSource } from "../src/lib/jobs/aggregator/engine/types.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const json = process.argv.includes("--json");
  const only = arg("feeds")?.split(",").map((id) => id.trim());
  const days = Number.parseInt(arg("days") ?? "21", 10);
  const rejectedSamples = Number.parseInt(arg("rejected") ?? "0", 10);
  const eligibleSamples = Number.parseInt(arg("eligible") ?? "0", 10);

  let { feeds, companies } = buildFeedSources({});
  if (only?.length) feeds = feeds.filter((feed) => only.includes(feed.id));

  // Optionally capture a few rejected postings per feed for rule review.
  const rejected: Array<{ feed: string; title: string; location: string; reason: string }> = [];
  const accepted: Array<{ feed: string; title: string; company: string; location: string; reason: string }> = [];
  const wrapped: FeedSource[] = feeds.map((feed) => ({
    ...feed,
    async fetch(ctx) {
      const result = await feed.fetch(ctx);
      if (eligibleSamples > 0) {
        let taken = 0;
        for (const raw of result.postings) {
          if (taken >= eligibleSamples) break;
          const normalized = normalizePosting(feed.id, raw, ctx.now);
          if (normalized.eligibility.verdict === "eligible") {
            accepted.push({
              feed: feed.id,
              title: normalized.job.title,
              company: normalized.job.company,
              location: normalized.job.location,
              reason: normalized.eligibility.reasons.join("; "),
            });
            taken += 1;
          }
        }
      }
      if (rejectedSamples > 0) {
        let taken = 0;
        for (const raw of result.postings) {
          if (taken >= rejectedSamples) break;
          const normalized = normalizePosting(feed.id, raw, ctx.now);
          if (normalized.eligibility.verdict !== "eligible") {
            rejected.push({
              feed: feed.id,
              title: normalized.job.title,
              location: normalized.job.location,
              reason: `${normalized.eligibility.verdict}: ${normalized.eligibility.reasons.join("; ")}`,
            });
            taken += 1;
          }
        }
      }
      return result;
    },
  }));

  const http = new HttpClient();
  const report = await runIngestion({
    dryRun: true,
    feeds: wrapped,
    http,
    ignoreMinInterval: true,
    postedWithinDays: days,
    sampleSize: 2,
  });

  if (json) {
    console.log(JSON.stringify({ report, accepted, rejected, httpRequests: http.requestCount }, null, 2));
    return;
  }

  console.log(`\nAggregator dry-run — ${report.startedAt} — ${(report.durationMs / 1000).toFixed(1)}s — status ${report.status}`);
  console.log(`ATS boards in catalog: ${companies.length}; HTTP requests (incl. robots.txt): ${http.requestCount}; posting window: ${days}d\n`);
  const header = ["source", "status", "fetched", "eligible", "rejected", "uncertain", "dupes", "scopes ok/fail", "ms", "note"];
  const rows = report.sources.map((metric) => [
    metric.source,
    metric.status + (metric.skipReason ? `(${metric.skipReason})` : ""),
    String(metric.fetched),
    String(metric.eligible),
    String(metric.rejected),
    String(metric.uncertain),
    String(metric.duplicates),
    `${metric.scopesOk}/${metric.scopesFailed}`,
    String(metric.durationMs),
    metric.errorSamples[0]?.slice(0, 70) ?? "",
  ]);
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => row[index].length)));
  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");
  console.log(line(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  rows.forEach((row) => console.log(line(row)));
  const t = report.totals;
  console.log(
    `\nTOTAL fetched=${t.fetched} eligible=${t.eligible} rejected=${t.rejected} uncertain=${t.uncertain} ` +
      `cross-source-dupes=${t.duplicates} errors=${t.errors} llmCalls=${t.llmCalls} llmCacheHits=${t.llmCacheHits}`,
  );
  console.log(`Unique Africa-eligible jobs after dedupe: ${t.eligible - t.duplicates}\n`);

  if (report.sample?.length) {
    console.log("Sample eligible postings:");
    for (const item of report.sample) {
      console.log(`  [${item.source}] ${item.title} — ${item.company} — ${item.location} — ${item.scopes.join(",")}`);
    }
  }
  if (accepted.length) {
    console.log("\nEligible postings with reasons:");
    for (const item of accepted) console.log(`  [${item.feed}] ${item.title} — ${item.company} — ${item.location} — ${item.reason}`);
  }
  if (rejected.length) {
    console.log("\nSample non-eligible postings:");
    for (const item of rejected) console.log(`  [${item.feed}] ${item.title} — ${item.location} — ${item.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
