import { Prisma } from "@prisma/client";
export declare const JOB_SEMANTIC_NAMESPACE = "jobs";
export declare const JOB_SEMANTIC_SOURCE_TYPE = "JOB";
export declare const semanticJobSelect: {
    id: true;
    title: true;
    description: true;
    location: true;
    type: true;
    seniority: true;
    salaryMin: true;
    salaryMax: true;
    currency: true;
    tags: true;
    visaSponsorship: true;
    relocationAssistance: true;
    eligibleCountries: true;
    status: true;
    isExpired: true;
    employerId: true;
    sourceName: true;
    updatedAt: true;
    publishedAt: true;
};
export type SemanticJobRecord = Prisma.JobGetPayload<{
    select: typeof semanticJobSelect;
}>;
export declare function buildJobSemanticContent(job: SemanticJobRecord): string;
export declare function buildJobSemanticMetadata(job: SemanticJobRecord): Record<string, unknown>;
export declare function isSemanticJobIndexable(job: SemanticJobRecord): boolean;
//# sourceMappingURL=job-documents.d.ts.map