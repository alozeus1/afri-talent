// ─────────────────────────────────────────────────────────────────────────────
// Cross-source dedupe + change detection.
//
// Two postings are the same job when EITHER
//   - their identity key matches: sha1(normCompany | normTitle | normCity), or
//   - their canonical apply URL matches (tracking params stripped).
// The most complete posting of each group is kept; the rest become variants
// (recorded in sourceLineage by the persistence layer).
//
// contentHash is a sha256 of every field we persist from the source. When it
// equals the stored Job.contentHash, the persistence layer skips the write and
// all classification work (that was the per-upsert LLM cost bug).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import type { AggregatedJob } from "../types.js";
import { buildDedupKeys } from "../../dedup.js";
import type { NormalizedPosting } from "./normalize-posting.js";

const TRACKING_PARAMS = /^(utm_[a-z]+|gh_src|gh_jid|lever-source|lever-origin|source|ref|referrer|src|trk|fbclid|gclid|mc_[a-z]+)$/i;

export function canonicalApplyUrl(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    const path = parsed.pathname.replace(/\/+$/, "").replace(/\/apply$/i, "");
    const query = parsed.searchParams.toString();
    return `${parsed.host.toLowerCase().replace(/^www\./, "")}${path.toLowerCase()}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** K1 from the shared dedup module — keeps in-run and DB dedupe consistent. */
export function identityKey(job: Pick<AggregatedJob, "title" | "company" | "location" | "description">): string {
  return buildDedupKeys({
    title: job.title,
    description: job.description,
    company: job.company,
    location: job.location,
  }).k1;
}

export function contentHash(job: AggregatedJob): string {
  const payload = JSON.stringify([
    job.title,
    job.company,
    job.location,
    job.locationType,
    job.description,
    job.salary?.min ?? null,
    job.salary?.max ?? null,
    job.salary?.currency ?? null,
    job.applicationUrl,
    job.jobType,
    job.visaSponsorship,
    job.relocationAssistance,
    job.expiresAt ? job.expiresAt.toISOString() : null,
    job.skills,
  ]);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function completeness(job: AggregatedJob): number {
  let score = 0;
  if (job.description.length > 400) score += 3;
  else if (job.description.length > 100) score += 1;
  if (job.salary) score += 2;
  if (job.companyLogo) score += 1;
  if (job.skills.length > 0) score += 1;
  if (job.visaSponsorship !== "UNKNOWN") score += 1;
  // Direct ATS postings beat re-posts on aggregator boards (better apply URL).
  if (["GREENHOUSE", "LEVER", "ASHBY", "WORKABLE", "SMARTRECRUITERS", "RECRUITEE"].includes(job.source)) score += 2;
  return score;
}

export interface PostingGroup {
  canonical: NormalizedPosting;
  variants: NormalizedPosting[];
}

/** Union-find over identity key + canonical apply URL. Order-stable. */
export function groupDuplicates(postings: NormalizedPosting[]): PostingGroup[] {
  const groups: PostingGroup[] = [];
  const byKey = new Map<string, PostingGroup>();

  for (const posting of postings) {
    const keys = [`id:${identityKey(posting.job)}`];
    const url = canonicalApplyUrl(posting.job.applicationUrl);
    if (url) keys.push(`url:${url}`);
    const externalKey = `ext:${posting.job.externalId}`;
    keys.push(externalKey);

    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    if (!existing) {
      const group: PostingGroup = { canonical: posting, variants: [posting] };
      groups.push(group);
      for (const key of keys) byKey.set(key, group);
      continue;
    }

    existing.variants.push(posting);
    for (const key of keys) if (!byKey.has(key)) byKey.set(key, existing);
    const current = existing.canonical.job;
    const candidate = posting.job;
    if (
      completeness(candidate) > completeness(current) ||
      (completeness(candidate) === completeness(current) && candidate.postedAt.getTime() > current.postedAt.getTime())
    ) {
      existing.canonical = posting;
    }
  }

  return groups;
}
