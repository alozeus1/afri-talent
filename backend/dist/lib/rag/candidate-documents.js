import { Prisma } from "@prisma/client";
export const CANDIDATE_SEMANTIC_NAMESPACE = "talent_marketplace";
export const CANDIDATE_SEMANTIC_SOURCE_TYPE = "candidate_profile";
export const semanticCandidateSelect = Prisma.validator()({
    id: true,
    userId: true,
    headline: true,
    bio: true,
    skills: true,
    targetRoles: true,
    targetCountries: true,
    yearsExperience: true,
    visaStatus: true,
    workHistory: true,
    educationHistory: true,
    certifications: true,
    openToWork: true,
    profileCompleteness: true,
    updatedAt: true,
    user: {
        select: {
            name: true,
            candidateTrustProfile: {
                select: {
                    verificationLevel: true,
                    authenticityScore: true,
                    riskLevel: true,
                    premiumFilterEligible: true,
                    verifiedSkillCount: true,
                    partnerSignalCount: true,
                    assessmentBacked: true,
                    fullyCompletedProfile: true,
                },
            },
        },
    },
    resumes: {
        where: { isActive: true },
        select: {
            id: true,
            fileName: true,
            uploadedAt: true,
        },
    },
});
function stringifyHistory(value, fields) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") {
            return [];
        }
        const record = item;
        return fields
            .map((field) => record[field])
            .filter((fieldValue) => typeof fieldValue === "string" && fieldValue.trim().length > 0);
    });
}
export function isSemanticCandidateIndexable(candidate) {
    return candidate.openToWork && Boolean(candidate.userId);
}
export function buildCandidateSemanticContent(candidate) {
    const sections = [
        candidate.user.name,
        candidate.headline,
        candidate.bio,
        candidate.skills.join(" "),
        candidate.targetRoles.join(" "),
        candidate.targetCountries.join(" "),
        candidate.yearsExperience != null ? `${candidate.yearsExperience} years experience` : null,
        candidate.visaStatus,
        stringifyHistory(candidate.workHistory, ["company", "title", "description", "period"]).join(" "),
        stringifyHistory(candidate.educationHistory, ["institution", "degree", "fieldOfStudy"]).join(" "),
        stringifyHistory(candidate.certifications, ["name", "issuer", "authority"]).join(" "),
        candidate.resumes.map((resume) => resume.fileName).join(" "),
    ];
    return sections
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n");
}
export function buildCandidateSemanticMetadata(candidate) {
    return {
        candidateUserId: candidate.userId,
        candidateProfileId: candidate.id,
        skills: candidate.skills,
        targetRoles: candidate.targetRoles,
        targetCountries: candidate.targetCountries,
        yearsExperience: candidate.yearsExperience,
        visaStatus: candidate.visaStatus,
        openToWork: candidate.openToWork,
        profileCompleteness: candidate.profileCompleteness,
        activeResumeCount: candidate.resumes.length,
        trust: candidate.user.candidateTrustProfile
            ? {
                verificationLevel: candidate.user.candidateTrustProfile.verificationLevel,
                authenticityScore: candidate.user.candidateTrustProfile.authenticityScore,
                riskLevel: candidate.user.candidateTrustProfile.riskLevel,
                premiumFilterEligible: candidate.user.candidateTrustProfile.premiumFilterEligible,
                verifiedSkillCount: candidate.user.candidateTrustProfile.verifiedSkillCount,
                partnerSignalCount: candidate.user.candidateTrustProfile.partnerSignalCount,
                assessmentBacked: candidate.user.candidateTrustProfile.assessmentBacked,
                fullyCompletedProfile: candidate.user.candidateTrustProfile.fullyCompletedProfile,
            }
            : null,
    };
}
//# sourceMappingURL=candidate-documents.js.map