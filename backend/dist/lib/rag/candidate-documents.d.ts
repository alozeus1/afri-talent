import { Prisma } from "@prisma/client";
export declare const CANDIDATE_SEMANTIC_NAMESPACE = "talent_marketplace";
export declare const CANDIDATE_SEMANTIC_SOURCE_TYPE = "candidate_profile";
export declare const semanticCandidateSelect: {
    id: true;
    userId: true;
    headline: true;
    bio: true;
    skills: true;
    targetRoles: true;
    targetCountries: true;
    yearsExperience: true;
    visaStatus: true;
    workHistory: true;
    educationHistory: true;
    certifications: true;
    openToWork: true;
    profileCompleteness: true;
    updatedAt: true;
    user: {
        select: {
            name: true;
            candidateTrustProfile: {
                select: {
                    verificationLevel: true;
                    authenticityScore: true;
                    riskLevel: true;
                    premiumFilterEligible: true;
                    verifiedSkillCount: true;
                    partnerSignalCount: true;
                    assessmentBacked: true;
                    fullyCompletedProfile: true;
                };
            };
        };
    };
    resumes: {
        where: {
            isActive: true;
        };
        select: {
            id: true;
            fileName: true;
            uploadedAt: true;
        };
    };
};
type SemanticCandidateRecord = Prisma.CandidateProfileGetPayload<{
    select: typeof semanticCandidateSelect;
}>;
export declare function isSemanticCandidateIndexable(candidate: SemanticCandidateRecord): boolean;
export declare function buildCandidateSemanticContent(candidate: SemanticCandidateRecord): string;
export declare function buildCandidateSemanticMetadata(candidate: SemanticCandidateRecord): Record<string, unknown>;
export {};
//# sourceMappingURL=candidate-documents.d.ts.map