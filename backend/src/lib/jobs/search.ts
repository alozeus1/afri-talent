import { JobStatus, Prisma, Role } from "@prisma/client";
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
  );
  const sorted = sortRankedResults(
    boostSemanticRanking(collapsed, input.preferenceContext?.query),
    input.sortBy ?? "relevance",
  );
  const ranked = sorted.map((result) => ({
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
