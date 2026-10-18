// ─────────────────────────────────────────────────────────────────────────────
// Persistence for the aggregator engine.
//
//  - Existing rows are looked up in batches (sourceId / dedupKeyV2 /
//    sourceFingerprint) — no per-posting dedup queries, no per-posting
//    embedding call (K3 cosine stays with the semantic-indexer worker).
//  - Unchanged postings (same contentHash) only get sourceLastSeenAt touched,
//    in one updateMany — no classification, no LLM, no row rewrite.
//  - Changed/new postings: deterministic taxonomy first; the LLM classifier is
//    only used when keyword confidence is low AND the per-run budget allows.
//  - Aggregated rows never overwrite employer-posted jobs (a K1 hit on an
//    employer job counts as a duplicate and is skipped).
//  - Stale-expiry: jobs from a fully-read feed scope that were not seen this
//    run (and were inside the posting window) are expired.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, type PrismaClient } from "@prisma/client";
import logger from "../../../logger.js";
import { buildJobIntelligenceUpdate, buildSourceFingerprint } from "../../discovery.js";
import { buildDedupKeys } from "../../dedup.js";
import { normalizeCompany, normalizeLocation } from "../../normalize.js";
import { resolveSalaryPeriod } from "../../salary-period.js";
import { classifyApplyStrategy } from "../../apply-strategy.js";
import { resolveEffectiveApplyStrategy } from "../../../apply/caps.js";
import {
  CLASSIFIER_MIN_LLM_CONFIDENCE,
  classifyJobField as classifyJobFieldWithLlm,
  classifyJobFieldDeterministic,
  type ClassificationResult,
} from "../../../ai/skills/job-field-classifier.js";
import { isGraphEnabled } from "../../../ai/langgraph/index.js";
import { gateJobIngestion, jobPersistenceForDecision } from "../../../ai/langgraph/integration/jobIngestionAdapter.js";
import type { AggregatedJob } from "../types.js";
import { resolveJobField } from "../taxonomy.js";
import { mapWithConcurrency } from "./circuit-breaker.js";
import { contentHash } from "./dedupe.js";
import type { PostingGroup } from "./dedupe.js";
import type { FeedSourceId } from "./types.js";

const LOOKUP_CHUNK = 300;
const WRITE_CONCURRENCY = 4;

export interface PersistCounters {
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  qualityRejected: number;
  failed: number;
}

export interface PersistResult {
  byFeed: Map<FeedSourceId, PersistCounters>;
  llmClassifications: number;
  seenExternalIds: Set<string>;
}

interface ExistingRow {
  id: string;
  slug: string;
  sourceId: string | null;
  dedupKeyV2: string | null;
  sourceFingerprint: string | null;
  contentHash: string | null;
  sourceLineage: Prisma.JsonValue | null;
  status: string;
  isExpired: boolean;
  jobSource: string;
  employerId: string | null;
}

function emptyCounters(): PersistCounters {
  return { inserted: 0, updated: 0, unchanged: 0, duplicates: 0, qualityRejected: 0, failed: 0 };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

export function toJobDocument(job: AggregatedJob, now: Date) {
  return {
    title: job.title,
    description: job.description,
    location: job.location,
    type: job.jobType,
    seniority: job.seniority,
    jobField: job.jobField,
    workplaceType: job.workplaceType,
    tags: job.skills,
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    currency: job.salary?.currency ?? null,
    salaryPeriod: job.salary ? resolveSalaryPeriod(job.salary) : null,
    visaSponsorship: job.visaSponsorship,
    relocationAssistance: job.relocationAssistance,
    eligibleCountries: job.eligibleCountries,
    sourceUrl: job.sourceUrl,
    sourceId: job.externalId,
    sourceName: job.company,
    jobSource: job.source,
    applicationUrl: job.applicationUrl,
    companyCareerSourceId: job.companyCareerSourceId ?? null,
    publishedAt: job.postedAt,
    sourceFirstSeenAt: job.postedAt,
    sourceLastSeenAt: now,
    expiresAt: job.expiresAt ?? null,
    riskScore: 0,
    riskLevel: "LOW" as const,
  };
}

function slugify(title: string, company: string): string {
  return `${title} ${company}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function uniqueSlug(prisma: PrismaClient, base: string): Promise<string> {
  const taken = await prisma.job.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let counter = 2; counter < 10_000; counter += 1) {
    const candidate = `${base}-${counter}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export class TaxonomyClassifier {
  private readonly cache = new Map<string, ClassificationResult>();
  llmCalls = 0;

  constructor(
    private budget: number,
    private readonly llm: typeof classifyJobFieldWithLlm = classifyJobFieldWithLlm,
    private readonly llmEnabled = process.env.MOCK_AI !== "1" && Boolean(process.env.ANTHROPIC_API_KEY),
  ) {}

  async classify(hash: string, job: AggregatedJob): Promise<ClassificationResult> {
    const cached = this.cache.get(hash);
    if (cached) return cached;
    const input = {
      title: job.title,
      description: job.description,
      companyName: job.company,
      seniority: job.seniority ?? undefined,
      tags: job.skills,
    };
    let result = classifyJobFieldDeterministic(input);
    if (result.confidence < CLASSIFIER_MIN_LLM_CONFIDENCE && this.llmEnabled && this.budget > 0) {
      this.budget -= 1;
      this.llmCalls += 1;
      result = await this.llm(input);
    }
    this.cache.set(hash, result);
    return result;
  }
}

async function lookupExisting(prisma: PrismaClient, keys: { sourceIds: string[]; k1s: string[]; fingerprints: string[] }): Promise<ExistingRow[]> {
  const rows: ExistingRow[] = [];
  const select = {
    id: true,
    slug: true,
    sourceId: true,
    dedupKeyV2: true,
    sourceFingerprint: true,
    contentHash: true,
    sourceLineage: true,
    status: true,
    isExpired: true,
    jobSource: true,
    employerId: true,
  } as const;
  for (const ids of chunk(keys.sourceIds, LOOKUP_CHUNK)) {
    rows.push(...(await prisma.job.findMany({ where: { sourceId: { in: ids } }, select })));
  }
  for (const k1s of chunk(keys.k1s, LOOKUP_CHUNK)) {
    rows.push(...(await prisma.job.findMany({ where: { dedupKeyV2: { in: k1s } }, select })));
  }
  for (const fps of chunk(keys.fingerprints, LOOKUP_CHUNK)) {
    rows.push(...(await prisma.job.findMany({ where: { sourceFingerprint: { in: fps } }, select })));
  }
  return rows;
}

export async function persistGroups(
  prisma: PrismaClient,
  groups: PostingGroup[],
  options: { now: Date; classifier: TaxonomyClassifier },
): Promise<PersistResult> {
  const { now, classifier } = options;
  const byFeed = new Map<FeedSourceId, PersistCounters>();
  const counters = (feed: FeedSourceId) => {
    let entry = byFeed.get(feed);
    if (!entry) {
      entry = emptyCounters();
      byFeed.set(feed, entry);
    }
    return entry;
  };
  const seenExternalIds = new Set<string>();

  const prepared = groups.map((group) => {
    const job = group.canonical.job;
    const document = toJobDocument(job, now);
    const fingerprint = buildSourceFingerprint(document);
    const k1 = buildDedupKeys({
      title: job.title,
      description: job.description,
      company: job.company,
      location: job.location,
      sourceFingerprint: fingerprint,
      sourceName: job.company,
    }).k1;
    return { group, job, document, fingerprint, k1, hash: contentHash(job) };
  });

  const existing = await lookupExisting(prisma, {
    sourceIds: prepared.map((item) => item.job.externalId),
    k1s: prepared.map((item) => item.k1).filter((key) => key && key !== "::"),
    fingerprints: prepared.map((item) => item.fingerprint),
  });
  const bySourceId = new Map<string, ExistingRow>();
  const byK1 = new Map<string, ExistingRow>();
  const byFingerprint = new Map<string, ExistingRow>();
  for (const row of existing) {
    if (row.sourceId && !bySourceId.has(row.sourceId)) bySourceId.set(row.sourceId, row);
    if (row.dedupKeyV2 && !byK1.has(row.dedupKeyV2)) byK1.set(row.dedupKeyV2, row);
    if (row.sourceFingerprint && !byFingerprint.has(row.sourceFingerprint)) byFingerprint.set(row.sourceFingerprint, row);
  }

  const touchIds: string[] = [];
  const claimed = new Set<string>();

  await mapWithConcurrency(prepared, WRITE_CONCURRENCY, async (item) => {
    const feed = item.group.canonical.feed;
    const match =
      bySourceId.get(item.job.externalId) ?? byK1.get(item.k1) ?? byFingerprint.get(item.fingerprint) ?? null;

    for (const variant of item.group.variants) seenExternalIds.add(variant.job.externalId);

    if (match && (match.employerId || match.jobSource !== "AGGREGATED")) {
      counters(feed).duplicates += 1; // never overwrite an employer-posted job
      return;
    }
    if (match && claimed.has(match.id)) {
      counters(feed).duplicates += 1; // two groups resolved to the same row this run
      return;
    }
    if (match) claimed.add(match.id);

    if (match && match.contentHash === item.hash && !match.isExpired && match.status === "PUBLISHED") {
      touchIds.push(match.id);
      counters(feed).unchanged += 1;
      return;
    }

    try {
      const data = await buildWriteData(prisma, item, match, classifier, now);
      if (!data) {
        counters(feed).qualityRejected += 1; // rejected by the LangGraph quality gate
        return;
      }
      if (match) {
        await prisma.job.update({ where: { id: match.id }, data });
        counters(feed).updated += 1;
      } else {
        try {
          await prisma.job.create({ data: { ...data, slug: await uniqueSlug(prisma, data.slug) } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            await prisma.job.create({ data: { ...data, slug: `${data.slug}-${Math.random().toString(36).slice(2, 7)}` } });
          } else {
            throw error;
          }
        }
        counters(feed).inserted += 1;
      }
    } catch (error) {
      counters(feed).failed += 1;
      logger.error({ err: (error as Error).message, sourceId: item.job.externalId }, "[aggregator] failed to persist posting");
    }
  });

  for (const ids of chunk(touchIds, 500)) {
    await prisma.job.updateMany({ where: { id: { in: ids } }, data: { sourceLastSeenAt: now, lastCheckedAt: now } });
  }

  return { byFeed, llmClassifications: classifier.llmCalls, seenExternalIds };
}

async function buildWriteData(
  prisma: PrismaClient,
  item: { group: PostingGroup; job: AggregatedJob; document: ReturnType<typeof toJobDocument>; fingerprint: string; k1: string; hash: string },
  match: ExistingRow | null,
  classifier: TaxonomyClassifier,
  now: Date,
) {
  const { job, document, fingerprint, k1, hash } = item;
  const eligibility = item.group.canonical.eligibility;

  let qualityOverride: ReturnType<typeof jobPersistenceForDecision> | undefined;
  if (isGraphEnabled("job_ingestion_quality")) {
    const gate = await gateJobIngestion({
      jobRef: job.externalId,
      source: job.source,
      fingerprint,
      title: job.title,
      company: job.company,
      description: job.description,
      requirements: job.requirements,
      hasSalary: Boolean(job.salary && (job.salary.min != null || job.salary.max != null)),
      hasLocation: Boolean(job.location && job.location.trim()),
      postedAt: job.postedAt,
    });
    qualityOverride = jobPersistenceForDecision(gate.decision, gate.scamScore);
    if (qualityOverride === null) return null;
  }

  const classification = await classifier.classify(hash, job);
  const applyDecision = classifyApplyStrategy({
    jobSource: job.source,
    description: job.description,
    sourceUrl: job.sourceUrl,
    applicationUrl: job.applicationUrl,
  });
  const effective = await resolveEffectiveApplyStrategy(prisma, {
    applyStrategy: applyDecision.strategy,
    applyEmailDetected: applyDecision.applyEmailDetected,
  });
  const normalizedCompany = normalizeCompany(job.company);
  const normalizedLocation = normalizeLocation(job.location, job.locationType);
  const relatedDocuments = item.group.variants.map((variant) => toJobDocument(variant.job, now));
  const intelligence = buildJobIntelligenceUpdate(document, match?.sourceLineage ?? undefined, relatedDocuments, now);

  return {
    title: job.title.slice(0, 300),
    slug: match?.slug ?? slugify(job.title, job.company),
    description: job.description,
    location: normalizedLocation.display || job.location,
    type: job.jobType,
    jobField: resolveJobField({
      title: job.title,
      taxonomyField: classification.field,
      existing: job.jobField,
      description: job.description,
      tags: job.skills,
    }),
    taxonomyField: classification.field,
    taxonomyVersion: classification.version,
    taxonomyConfidence: classification.confidence,
    dedupKeyV2: k1.slice(0, 255),
    contentHash: hash,
    applyStrategy: effective.effective,
    applyEmailDetected: effective.downgradedFromEmailDraft ? null : applyDecision.applyEmailDetected ?? null,
    applyFormDomain: applyDecision.applyFormDomain ?? null,
    workplaceType: job.workplaceType ?? null,
    seniority: job.seniority || "Mid-level",
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    currency: job.salary?.currency ?? null,
    salaryPeriod: job.salary ? resolveSalaryPeriod(job.salary) : null,
    tags: job.skills,
    status: qualityOverride?.status ?? ("PUBLISHED" as const),
    publishedAt: job.postedAt,
    visaSponsorship: job.visaSponsorship,
    relocationAssistance: job.relocationAssistance,
    eligibleCountries: job.eligibleCountries,
    hiresFromAfrica: eligibility.verdict === "eligible",
    jobSource: "AGGREGATED" as const,
    sourceUrl: job.sourceUrl,
    sourceId: job.externalId,
    sourceName: normalizedCompany || job.company,
    expiresAt: job.expiresAt ?? null,
    companyCareerSourceId: job.companyCareerSourceId ?? null,
    lastCheckedAt: now,
    isExpired: false,
    staleCheckFailures: 0,
    riskScore: qualityOverride?.riskScore ?? 0,
    riskLevel: qualityOverride?.riskLevel ?? ("LOW" as const),
    qualityCheckedAt: now,
    ...intelligence,
    sourceLastSeenAt: now,
  };
}

/**
 * Expire aggregated jobs from fully-read scopes that were not seen this run.
 * Only rows inside the posting window are considered — older rows are left to
 * the daily job-cleanup worker, since feeds filtered by date never return them.
 */
export async function expireMissing(
  prisma: PrismaClient,
  scopeKeys: string[],
  options: { runStartedAt: Date; postedAfter: Date },
): Promise<Map<string, number>> {
  const expired = new Map<string, number>();
  for (const scopeKey of scopeKeys) {
    const result = await prisma.job.updateMany({
      where: {
        jobSource: "AGGREGATED",
        employerId: null,
        isExpired: false,
        sourceId: { startsWith: scopeKey },
        sourceLastSeenAt: { lt: options.runStartedAt },
        publishedAt: { gte: options.postedAfter },
      },
      data: { isExpired: true, status: "REJECTED", freshnessScore: 0 },
    });
    if (result.count > 0) expired.set(scopeKey, result.count);
  }
  return expired;
}
