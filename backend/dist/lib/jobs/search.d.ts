import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { CandidatePreferenceContext, JobDiscoverySummary, JobRankingExplanation, JobSourceLineageRecord } from "./discovery.js";
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
export declare const publicJobInclude: {
    employer: {
        select: {
            companyName: true;
            location: true;
            website: true;
            bio: true;
            createdAt: true;
            trustProfile: {
                select: {
                    verificationLevel: true;
                    authenticityScore: true;
                    riskScore: true;
                    riskLevel: true;
                    postingEligibility: true;
                    requiresEnhancedVerification: true;
                    verifiedDomain: true;
                    suspiciousSignals: true;
                };
            };
        };
    };
    _count: {
        select: {
            applications: true;
        };
    };
};
export type PublicJobRecord = Prisma.JobGetPayload<{
    include: typeof publicJobInclude;
}>;
export type RankedPublicJob = Omit<PublicJobRecord, "sourceLineage"> & {
    discovery: JobDiscoverySummary;
    rankingExplanation: JobRankingExplanation;
    rankingScore: number;
    sourceLineage: JobSourceLineageRecord[];
};
export declare function buildJobSearchWhere(filters: JobSearchFilters): Prisma.JobWhereInput;
export declare function loadCandidatePreferenceContext(req: Request): Promise<CandidatePreferenceContext | undefined>;
export declare function buildPreferenceContext(filters: JobSearchFilters, base?: CandidatePreferenceContext): CandidatePreferenceContext;
export declare function fetchRankedJobs(input: {
    where: Prisma.JobWhereInput;
    page: number;
    limit: number;
    preferenceContext?: CandidatePreferenceContext;
    take?: number;
}): Promise<{
    jobs: RankedPublicJob[];
    total: number;
}>;
//# sourceMappingURL=search.d.ts.map