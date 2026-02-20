#!/usr/bin/env npx tsx
// Usage: npx tsx backend/scripts/ingest_jobs_rss.ts <rss_feed_url>
// Example: npx tsx backend/scripts/ingest_jobs_rss.ts https://remoteok.com/remote-jobs.rss

import prisma from "../src/lib/prisma.js";
import { JobStatus, JobSource } from "@prisma/client";

const feedUrl = process.argv[2];

if (!feedUrl) {
  console.error("Usage: npx tsx backend/scripts/ingest_jobs_rss.ts <rss_feed_url>");
  process.exit(1);
}

function generateSlug(title: string, uniqueSuffix: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    + "-" + uniqueSuffix;
}

// Simple XML text extractor - no dependencies needed
function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataMatch = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i"));
  if (cdataMatch) return cdataMatch[1].trim();

  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (match) return match[1].replace(/<[^>]+>/g, " ").trim();
  return "";
}

function extractItems(xml: string): string[] {
  const items: string[] = [];
  const regex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    items.push(m[1]);
  }
  return items;
}

async function main() {
  console.log(`Fetching RSS feed: ${feedUrl}`);

  const response = await fetch(feedUrl, {
    headers: { "User-Agent": "AfriTalent-Ingestion/1.0" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const xml = await response.text();
  const items = extractItems(xml);

  console.log(`Found ${items.length} items in feed`);

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const title = extractTag(item, "title") || "Untitled Job";
    const link = extractTag(item, "link");
    const description = extractTag(item, "description") || extractTag(item, "content:encoded") || "";
    const company = extractTag(item, "company") || extractTag(item, "author") || "";
    const location = extractTag(item, "location") || "Remote";
    const guid = extractTag(item, "guid") || link || title;

    if (!title || description.length < 50) {
      skipped++;
      continue;
    }

    // Dedup by sourceId (guid/link)
    const sourceId = guid.slice(0, 200);
    const existing = await prisma.job.findFirst({ where: { sourceId } });
    if (existing) {
      skipped++;
      continue;
    }

    const slug = generateSlug(title, Date.now().toString(36) + Math.random().toString(36).slice(2, 5));

    await prisma.job.create({
      data: {
        title: title.slice(0, 255),
        slug,
        description: description.slice(0, 50000),
        location: location.slice(0, 255),
        type: "full-time",
        seniority: "mid",
        tags: [],
        status: JobStatus.PUBLISHED,
        publishedAt: new Date(),
        jobSource: JobSource.AGGREGATED,
        sourceUrl: link.slice(0, 500) || null,
        sourceId,
        sourceName: company.slice(0, 255) || null,
        employerId: null,
      },
    });

    created++;

    if (created % 10 === 0) {
      console.log(`  Created ${created} jobs so far...`);
    }
  }

  console.log(`Done. Created: ${created}, Skipped: ${skipped}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
