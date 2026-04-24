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

export interface JobSearchFilters {
  search?: string;
  location?: string;
  type?: string;
  seniority?: string;
  visaSponsorship?: string;
  relocationAssistance?: boolean;
  remote?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  country?: string;
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
    conditions.push({
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { sourceName: { contains: filters.search, mode: "insensitive" } },
        { tags: { has: filters.search.toLowerCase() } },
      ],
    });
  }

  if (filters.location) {
    conditions.push({
      location: { contains: filters.location, mode: "insensitive" },
    });
  }

  if (filters.type) {
    conditions.push({ type: filters.type });
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
    keywords: filters.search ? [filters.search] : base?.keywords,
    jobTypes: filters.type ? [filters.type] : base?.jobTypes,
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
}): Promise<{
  jobs: RankedPublicJob[];
  total: number;
}> {
  const maxCandidates = input.take ?? Math.max(150, input.page * input.limit * 8);
  const jobs = await prisma.job.findMany({
    where: input.where,
    include: publicJobInclude,
    orderBy: [
      { publishedAt: "desc" },
      { updatedAt: "desc" },
    ],
    take: Math.min(maxCandidates, 500),
  });

  const ranked = boostSemanticRanking(collapseDuplicateRankedJobs(
    jobs.map((job) => scoreJobForSearch(job, input.preferenceContext)),
  ), input.preferenceContext?.query).map((result) => ({
    ...result.job,
    discovery: result.discovery,
    rankingExplanation: result.explanation,
    rankingScore: result.score,
    sourceLineage: result.sourceLineage,
  }));

  const start = (input.page - 1) * input.limit;
  const end = start + input.limit;
  return {
    jobs: ranked.slice(start, end),
    total: ranked.length,
  };
}
