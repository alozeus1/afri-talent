import { EmployerVerificationLevel, JobStatus, Prisma, Role } from "@prisma/client";
import type { Request } from "express";
import prisma from "../prisma.js";
import {
  CandidatePreferenceContext,
  JobDiscoverySummary,
  JobRankingExplanation,
  JobSourceLineageRecord,
  collapseDuplicateRankedJobs,
  scoreJobForSearch,
} from "./discovery.js";
import { buildJobSemanticContent } from "../rag/job-documents.js";
import { semanticTextScore } from "../rag/embedding.js";
import { expandSearchKeywords } from "./smart-search/keywords.js";

export interface JobSearchFilters {
  search?: string;
  expandedKeywords?: string[];
  location?: string;
  type?: string;
  employmentType?: string;
  jobField?: string;
  workplaceType?: string;
  seniority?: string;
  visaSponsorship?: string;
  relocationAssistance?: boolean;
  remote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  country?: string;
  provider?: string;
  includeExpandedKeywords?: boolean;
  sortBy?: "relevance" | "newest" | "salary" | "companyQuality";
}

export const publicJobInclude = Prisma.validator<Prisma.JobInclude>()({
  employer: {
    select: {
      companyName: true,
      location: true,
      website: true,
      bio: true,
      createdAt: true,
      trustProfile: {
        select: {
          verificationLevel: true,
          authenticityScore: true,
          riskScore: true,
          riskLevel: true,
          postingEligibility: true,
          requiresEnhancedVerification: true,
          verifiedDomain: true,
          suspiciousSignals: true,
        },
      },
    },
  },
  _count: { select: { applications: true } },
});

export type PublicJobRecord = Prisma.JobGetPayload<{
  include: typeof publicJobInclude;
}>;

export type RankedPublicJob = Omit<PublicJobRecord, "sourceLineage"> & {
  discovery: JobDiscoverySummary;
  rankingExplanation: JobRankingExplanation;
  rankingScore: number;
  sourceLineage: JobSourceLineageRecord[];
};

function clampScore(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function boostSemanticRanking(
  results: ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[],
  query?: string,
): ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[] {
  if (!query?.trim()) {
    return results;
  }

  return results
    .map((result) => {
      const semanticMatch = Math.round(semanticTextScore(query, buildJobSemanticContent(result.job)) * 100);
      if (semanticMatch < 10) {
        return result;
      }

      const boost = Math.round(semanticMatch * 0.12);
      const nextScore = clampScore(result.score + boost);

      return {
        ...result,
        score: nextScore,
        explanation: {
          ...result.explanation,
          score: nextScore,
          summary: `${result.explanation.summary} Semantic query intent also reinforced this match.`,
          reasons: [...result.explanation.reasons, `semantic intent match ${semanticMatch}/100`],
          components: {
            ...result.explanation.components,
            relevance: clampScore(Math.round((result.explanation.components.relevance * 0.7) + (semanticMatch * 0.3))),
          },
        },
      };
    })
    .sort((left, right) => right.score - left.score);
}

const SEARCH_STOP_WORDS = new Set(["and", "for", "the", "with", "job", "jobs", "role", "roles", "remote"]);

function normalizeSearchText(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeSearchText(value: string | null | undefined): string[] {
  return Array.from(new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((token) => token.length > 2 && !SEARCH_STOP_WORDS.has(token)),
  ));
}

function hasSearchIntentMatch(job: PublicJobRecord, query?: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const queryTokens = tokenizeSearchText(normalizedQuery);
  if (queryTokens.length === 0) return true;

  const title = normalizeSearchText(job.title);
  const tagText = normalizeSearchText((job.tags || []).join(" "));
  const company = normalizeSearchText(job.sourceName || job.employer?.companyName || "");
  const description = normalizeSearchText(job.description);

  if (title.includes(normalizedQuery)) return true;
  if (queryTokens.some((token) => title.includes(token) || tagText.includes(token) || company.includes(token))) {
    return true;
  }

  const descriptionHits = queryTokens.filter((token) => description.includes(token)).length;
  return queryTokens.length === 1 ? descriptionHits > 0 : descriptionHits >= 2;
}

// §4.3 — verified-employer boost. Employers past UNVERIFIED have completed
// at least one identity gate (email-domain, business-doc, manual review, or
// premium-trusted); the boost rewards that with +12 on the final score and
// pushes verified rows up the ranking before the post-sort diversity cap
// trims employer over-representation.
export const VERIFIED_EMPLOYER_BOOST = 12;

// §4.3 — diversity cap. Top 30 results may contain ≤ 3 listings from the same
// employer unless the user's query explicitly names that employer.
export const DIVERSITY_CAP_TOP_N = 30;
export const DIVERSITY_CAP_MAX_PER_EMPLOYER = 3;

const VERIFIED_LEVELS: ReadonlySet<EmployerVerificationLevel> = new Set([
  EmployerVerificationLevel.EMAIL_DOMAIN_VERIFIED,
  EmployerVerificationLevel.BUSINESS_DOC_VERIFIED,
  EmployerVerificationLevel.MANUAL_REVIEW_APPROVED,
  EmployerVerificationLevel.PREMIUM_TRUSTED,
]);

function isVerifiedEmployer(job: PublicJobRecord): boolean {
  const level = job.employer?.trustProfile?.verificationLevel as EmployerVerificationLevel | undefined;
  return level ? VERIFIED_LEVELS.has(level) : false;
}

// Use the displayed company name when present; fall back to the aggregated
// `sourceName`. Returns null when neither is set (rare; treat as non-grouped).
function employerKeyFor(job: PublicJobRecord): string | null {
  const raw = job.employer?.companyName ?? job.sourceName ?? null;
  if (!raw) return null;
  return raw.toLowerCase().trim();
}

// Generic suffix tokens we strip when deciding whether a query references an
// employer — `bosch` matters, `group` and `inc` don't.
const EMPLOYER_NAME_STOPWORDS: ReadonlySet<string> = new Set([
  "group", "inc", "ltd", "llc", "co", "company", "corp", "corporation", "gmbh", "the", "and",
]);

function queryNamesEmployer(query: string | undefined, employerKey: string): boolean {
  if (!query) return false;
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) return false;

  const employerTokens = employerKey
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !EMPLOYER_NAME_STOPWORDS.has(t));
  if (employerTokens.length === 0) return false;

  const queryTokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

  // Token-level overlap: any significant employer token appearing in any
  // query token (or vice versa) counts as "the query names this employer".
  // This intentionally lets "bosch engineer" match employer "Bosch Group".
  return employerTokens.some((empTok) =>
    queryTokens.some((qTok) => qTok === empTok || qTok.includes(empTok) || empTok.includes(qTok)),
  );
}

export function applyVerifiedEmployerBoost(
  results: ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[],
): ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[] {
  return results.map((result) => {
    if (!isVerifiedEmployer(result.job)) return result;
    const nextScore = clampScore(result.score + VERIFIED_EMPLOYER_BOOST);
    return {
      ...result,
      score: nextScore,
      explanation: {
        ...result.explanation,
        score: nextScore,
        reasons: [...result.explanation.reasons, `verified employer (+${VERIFIED_EMPLOYER_BOOST})`],
        components: {
          ...result.explanation.components,
          relevance: clampScore(result.explanation.components.relevance + VERIFIED_EMPLOYER_BOOST),
        },
      },
    };
  });
}

// Walks the sorted results in score order. The first DIVERSITY_CAP_TOP_N items
// that fit the cap (≤ DIVERSITY_CAP_MAX_PER_EMPLOYER per employer, modulo
// query-named employers) become the new top of the list. Overflow falls
// through into position 31+ preserving its relative ranking order, so the
// items aren't lost — just demoted.
export function applyEmployerDiversityCap(
  sorted: ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[],
  query?: string,
): ReturnType<typeof scoreJobForSearch<PublicJobRecord>>[] {
  const counts = new Map<string, number>();
  const promoted: typeof sorted = [];
  const demoted: typeof sorted = [];

  for (const result of sorted) {
    if (promoted.length >= DIVERSITY_CAP_TOP_N) {
      demoted.push(result);
      continue;
    }
    const employerKey = employerKeyFor(result.job);
    if (!employerKey) {
      promoted.push(result);
      continue;
    }
    if (queryNamesEmployer(query, employerKey)) {
      promoted.push(result);
      counts.set(employerKey, (counts.get(employerKey) ?? 0) + 1);
      continue;
    }
    const current = counts.get(employerKey) ?? 0;
    if (current >= DIVERSITY_CAP_MAX_PER_EMPLOYER) {
      demoted.push(result);
    } else {
      promoted.push(result);
      counts.set(employerKey, current + 1);
    }
  }

  return [...promoted, ...demoted];
}

function boostTitleIntent<TJob extends PublicJobRecord>(
  result: ReturnType<typeof scoreJobForSearch<TJob>>,
  query?: string,
): ReturnType<typeof scoreJobForSearch<TJob>> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return result;

  const title = normalizeSearchText(result.job.title);
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const titleHitCount = queryTokens.filter((token) => title.includes(token)).length;
  const exactPhraseBoost = title.includes(normalizedQuery) ? 12 : 0;
  const tokenBoost = Math.min(18, titleHitCount * 6);
  const boost = exactPhraseBoost + tokenBoost;
  if (boost <= 0) return result;

  const nextScore = clampScore(result.score + boost);
  return {
    ...result,
    score: nextScore,
    explanation: {
      ...result.explanation,
      score: nextScore,
      reasons: [...result.explanation.reasons, "job title matches the search intent"],
      components: {
        ...result.explanation.components,
        relevance: clampScore(result.explanation.components.relevance + boost),
      },
    },
  };
}

export function buildJobSearchWhere(filters: JobSearchFilters): Prisma.JobWhereInput {
  const conditions: Prisma.JobWhereInput[] = [
    { status: JobStatus.PUBLISHED },
    { isExpired: false },
  ];

  if (filters.search) {
    const searchTerms = filters.expandedKeywords?.length
      ? [filters.search, ...filters.expandedKeywords]
      : expandSearchKeywords({
          query: filters.search,
          includeExpandedKeywords: filters.includeExpandedKeywords,
        }).all;
    conditions.push({
      OR: searchTerms.flatMap((term) => [
        { title: { contains: term, mode: "insensitive" as const } },
        { description: { contains: term, mode: "insensitive" as const } },
        { sourceName: { contains: term, mode: "insensitive" as const } },
        { tags: { has: term.toLowerCase() } },
      ]),
    });
  }

  if (filters.location) {
    conditions.push({
      location: { contains: filters.location, mode: "insensitive" },
    });
  }

  if (filters.type || filters.employmentType) {
    conditions.push({ type: filters.type ?? filters.employmentType });
  }

  if (filters.jobField) {
    conditions.push({ jobField: filters.jobField });
  }

  if (filters.workplaceType) {
    conditions.push({ workplaceType: filters.workplaceType });
  }

  if (filters.seniority) {
    conditions.push({ seniority: filters.seniority });
  }

  if (filters.visaSponsorship) {
    conditions.push({ visaSponsorship: filters.visaSponsorship as any });
  }

  if (filters.relocationAssistance) {
    conditions.push({ relocationAssistance: true });
  }

  if (filters.remote) {
    conditions.push({
      OR: [
        { location: { contains: "remote", mode: "insensitive" } },
        { eligibleCountries: { isEmpty: false } },
      ],
    });
  }

  if (typeof filters.salaryMin === "number") {
    conditions.push({ salaryMax: { gte: filters.salaryMin } });
  }

  if (typeof filters.salaryMax === "number") {
    conditions.push({ salaryMin: { lte: filters.salaryMax } });
  }

  if (filters.country) {
    conditions.push({
      OR: [
        { eligibleCountries: { has: filters.country } },
        { location: { contains: filters.country, mode: "insensitive" } },
      ],
    });
  }

  if (filters.provider) {
    conditions.push({
      OR: [
        { sourceName: { contains: filters.provider, mode: "insensitive" } },
        { sourceUrl: { contains: filters.provider, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

export async function loadCandidatePreferenceContext(req: Request): Promise<CandidatePreferenceContext | undefined> {
  if (!req.user || req.user.role !== Role.CANDIDATE) {
    return undefined;
  }

  const profile = await prisma.candidateProfile.findUnique({
    where: { userId: req.user.userId },
    select: {
      skills: true,
      targetRoles: true,
      targetCountries: true,
      visaStatus: true,
    },
  });

  if (!profile) {
    return undefined;
  }

  return {
    skills: profile.skills,
    targetRoles: profile.targetRoles,
    targetCountries: profile.targetCountries,
    requiresVisaSponsorship: Boolean(profile.visaStatus && profile.visaStatus.toLowerCase() !== "citizen"),
  };
}

export function buildPreferenceContext(
  filters: JobSearchFilters,
  base?: CandidatePreferenceContext,
): CandidatePreferenceContext {
  return {
    ...base,
    query: filters.search,
    locations: filters.location ? [filters.location] : base?.locations,
    keywords: filters.search ? [filters.search, ...(filters.expandedKeywords ?? [])] : base?.keywords,
    jobTypes: filters.type || filters.employmentType ? [filters.type ?? filters.employmentType!] : base?.jobTypes,
    seniorities: filters.seniority ? [filters.seniority] : base?.seniorities,
    remoteOnly: filters.remote ?? base?.remoteOnly,
    requiresVisaSponsorship:
      filters.visaSponsorship === "YES" ? true : (base?.requiresVisaSponsorship ?? false),
    prefersRelocationSupport:
      filters.relocationAssistance ?? base?.prefersRelocationSupport ?? false,
    salaryMin: filters.salaryMin ?? base?.salaryMin ?? null,
    salaryMax: filters.salaryMax ?? base?.salaryMax ?? null,
    targetCountries: filters.country
      ? Array.from(new Set([...(base?.targetCountries || []), filters.country]))
      : base?.targetCountries,
  };
}

export async function fetchRankedJobs(input: {
  where: Prisma.JobWhereInput;
  page: number;
  limit: number;
  preferenceContext?: CandidatePreferenceContext;
  take?: number;
  sortBy?: JobSearchFilters["sortBy"];
}): Promise<{
  jobs: RankedPublicJob[];
  total: number;
  diagnostics: {
    rawCandidateCount: number;
    deduplicatedCount: number;
    duplicatesRemoved: number;
    providerCounts: Record<string, number>;
  };
}> {
  // Size the ranking candidate pool so the requested page is reachable.
  // The pool grows with the page number; we cap it generously to keep ranking work bounded
  // while still allowing deep pagination across the live catalog.
  const RANKING_POOL_CEILING = 2000;
  const desiredPool = input.take ?? Math.max(150, input.page * input.limit * 8);
  const maxCandidates = Math.min(desiredPool, RANKING_POOL_CEILING);

  // Run the ranking-pool fetch and the total count in parallel. The count gives the UI an
  // accurate "X jobs found" number that reflects the entire catalog matching the filter,
  // independent of how many candidates we actually rank in memory.
  const countPromise = (async () => {
    try {
      return await prisma.job.count({ where: input.where });
    } catch {
      return null;
    }
  })();
  const [jobs, totalMatchingRaw] = await Promise.all([
    prisma.job.findMany({
      where: input.where,
      include: publicJobInclude,
      orderBy: [
        { publishedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: maxCandidates,
    }),
    countPromise,
  ]);
  const totalMatching =
    typeof totalMatchingRaw === "number" && Number.isFinite(totalMatchingRaw)
      ? totalMatchingRaw
      : jobs.length;

  const collapsed = collapseDuplicateRankedJobs(
    jobs.map((job) => scoreJobForSearch(job, input.preferenceContext)),
  )
    .filter((result) => hasSearchIntentMatch(result.job, input.preferenceContext?.query))
    .map((result) => boostTitleIntent(result, input.preferenceContext?.query));
  // §4.3 — verified employer boost runs BEFORE sort so it influences the
  // ranking; the diversity cap runs AFTER sort so it only re-orders the final
  // ranking without changing per-row scores.
  const boosted = applyVerifiedEmployerBoost(collapsed);
  const sorted = sortRankedResults(
    boostSemanticRanking(boosted, input.preferenceContext?.query),
    input.sortBy ?? "relevance",
  );
  const capped =
    (input.sortBy ?? "relevance") === "relevance"
      ? applyEmployerDiversityCap(sorted, input.preferenceContext?.query)
      : sorted;
  const ranked = capped.map((result) => ({
    ...result.job,
    discovery: result.discovery,
    rankingExplanation: result.explanation,
    rankingScore: result.score,
    sourceLineage: result.sourceLineage,
  }));

  const start = (input.page - 1) * input.limit;
  const end = start + input.limit;
  // Surface the larger of the DB-wide count and the deduped ranked count so the UI never
  // shows a smaller number than the items currently visible on screen.
  const total = Math.max(totalMatching, ranked.length);
  return {
    jobs: ranked.slice(start, end),
    total,
    diagnostics: {
      rawCandidateCount: jobs.length,
      deduplicatedCount: ranked.length,
      duplicatesRemoved: Math.max(0, jobs.length - ranked.length),
      providerCounts: buildProviderCounts(ranked),
    },
  };
}

function sortRankedResults<TJob extends PublicJobRecord>(
  results: ReturnType<typeof scoreJobForSearch<TJob>>[],
  sortBy: NonNullable<JobSearchFilters["sortBy"]>,
): ReturnType<typeof scoreJobForSearch<TJob>>[] {
  if (sortBy === "newest") {
    return [...results].sort((left, right) =>
      (right.job.publishedAt?.getTime() ?? 0) - (left.job.publishedAt?.getTime() ?? 0),
    );
  }
  if (sortBy === "salary") {
    return [...results].sort((left, right) =>
      (right.job.salaryMax ?? right.job.salaryMin ?? 0) - (left.job.salaryMax ?? left.job.salaryMin ?? 0),
    );
  }
  if (sortBy === "companyQuality") {
    return [...results].sort((left, right) => {
      const leftScore = left.job.employer?.trustProfile?.authenticityScore ?? left.job.qualityScore ?? 0;
      const rightScore = right.job.employer?.trustProfile?.authenticityScore ?? right.job.qualityScore ?? 0;
      return rightScore - leftScore;
    });
  }
  return results;
}

function buildProviderCounts(jobs: Array<Pick<PublicJobRecord, "sourceName" | "jobSource">>): Record<string, number> {
  return jobs.reduce<Record<string, number>>((counts, job) => {
    const provider = job.sourceName ?? job.jobSource ?? "unknown";
    counts[provider] = (counts[provider] ?? 0) + 1;
    return counts;
  }, {});
}
