import { EmployerVerificationLevel, Prisma, TrustRiskLevel } from "@prisma/client";
export interface EmployerTrustLike {
    verificationLevel?: EmployerVerificationLevel | string | null;
    authenticityScore?: number | null;
    riskScore?: number | null;
    riskLevel?: TrustRiskLevel | string | null;
}
export interface JobSourceLineageRecord {
    source: string | null;
    sourceId: string | null;
    sourceUrl: string | null;
    applicationUrl: string | null;
    company: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
}
export interface JobDocumentLike {
    id?: string;
    title: string;
    description: string;
    location: string;
    type?: string | null;
    seniority?: string | null;
    tags?: string[];
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string | null;
    visaSponsorship?: string | null;
    relocationAssistance?: boolean | null;
    eligibleCountries?: string[];
    sourceUrl?: string | null;
    sourceId?: string | null;
    sourceName?: string | null;
    jobSource?: string | null;
    applicationUrl?: string | null;
    publishedAt?: Date | string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
    expiresAt?: Date | string | null;
    lastCheckedAt?: Date | string | null;
    sourceFirstSeenAt?: Date | string | null;
    sourceLastSeenAt?: Date | string | null;
    riskScore?: number | null;
    riskLevel?: TrustRiskLevel | string | null;
    trustFlags?: unknown;
    sourceLineage?: unknown;
    employer?: {
        companyName?: string | null;
        createdAt?: Date | string | null;
        trustProfile?: EmployerTrustLike | null;
    } | null;
}
export interface CandidatePreferenceContext {
    query?: string;
    keywords?: string[];
    locations?: string[];
    jobTypes?: string[];
    seniorities?: string[];
    skills?: string[];
    targetRoles?: string[];
    targetCountries?: string[];
    remoteOnly?: boolean;
    requiresVisaSponsorship?: boolean;
    prefersRelocationSupport?: boolean;
    salaryMin?: number | null;
    salaryMax?: number | null;
}
export interface JobFreshnessEvaluation {
    score: number;
    label: "FRESH" | "RECENT" | "ACTIVE" | "AGING" | "STALE" | "EXPIRED";
    isStale: boolean;
    ageDays: number;
    staleAt: Date | null;
    referenceAt: Date | null;
}
export interface JobQualitySignals {
    verifiedEmployer: boolean;
    descriptionComplete: boolean;
    compensationTransparent: boolean;
    validApplicationPath: boolean;
    locationClear: boolean;
    mobilityClear: boolean;
    lowScamRisk: boolean;
    metadataRich: boolean;
}
export interface JobQualityEvaluation {
    score: number;
    label: "TRUSTED" | "SOLID" | "REVIEW" | "THIN";
    signals: JobQualitySignals;
}
export interface PreferenceMatchEvaluation {
    score: number;
    matchedPreferences: string[];
}
export interface JobDiscoverySummary {
    qualityScore: number;
    freshnessScore: number;
    applicationLikelihoodScore: number;
    trustedJob: boolean;
    stale: boolean;
    freshnessLabel: JobFreshnessEvaluation["label"];
    qualityLabel: JobQualityEvaluation["label"];
    salaryTransparent: boolean;
    verifiedEmployer: boolean;
    visaClear: boolean;
    relocationClear: boolean;
    validApplicationPath: boolean;
    sourceCount: number;
    sourceNames: string[];
    lastSeenAt: string | null;
}
export interface JobRankingExplanation {
    score: number;
    summary: string;
    reasons: string[];
    matchedPreferences: string[];
    components: {
        relevance: number;
        freshness: number;
        applicationLikelihood: number;
        employerTrust: number;
        salaryTransparency: number;
        mobilityRelevance: number;
        candidatePreferenceMatch: number;
        quality: number;
    };
}
export interface RankedJobResult<TJob> {
    job: TJob;
    score: number;
    explanation: JobRankingExplanation;
    discovery: JobDiscoverySummary;
    fingerprint: string;
    sourceLineage: JobSourceLineageRecord[];
}
export declare function normalizeSourceLineage(lineage: unknown): JobSourceLineageRecord[];
export declare function mergeSourceLineage(existingLineage: unknown, incomingJobs: JobDocumentLike[], now?: Date): JobSourceLineageRecord[];
export declare function buildSourceFingerprint(job: JobDocumentLike): string;
export declare function evaluateFreshness(job: JobDocumentLike, now?: Date): JobFreshnessEvaluation;
export declare function evaluateJobQuality(job: JobDocumentLike): JobQualityEvaluation;
export declare function evaluateCandidatePreferenceMatch(job: JobDocumentLike, context?: CandidatePreferenceContext): PreferenceMatchEvaluation;
export declare function buildJobDiscoverySummary(input: {
    quality: JobQualityEvaluation;
    freshness: JobFreshnessEvaluation;
    applicationLikelihoodScore: number;
    employerTrust: number;
    sourceLineage: JobSourceLineageRecord[];
}): JobDiscoverySummary;
export declare function buildJobIntelligenceUpdate(job: JobDocumentLike, existingLineage?: unknown, relatedJobs?: JobDocumentLike[], now?: Date): {
    applicationUrl: string | null;
    sourceFingerprint: string;
    sourceLineage: Prisma.InputJsonValue;
    sourceFirstSeenAt: Date | null;
    sourceLastSeenAt: Date | null;
    freshnessScore: number;
    qualityScore: number;
    applicationLikelihoodScore: number;
    freshnessSignals: Prisma.InputJsonValue;
    qualitySignals: Prisma.InputJsonValue;
    staleAt: Date | null;
};
export declare function scoreJobForSearch<TJob extends JobDocumentLike>(job: TJob, context?: CandidatePreferenceContext): RankedJobResult<TJob>;
export declare function collapseDuplicateRankedJobs<TJob extends JobDocumentLike>(rankedJobs: RankedJobResult<TJob>[]): RankedJobResult<TJob>[];
//# sourceMappingURL=discovery.d.ts.map