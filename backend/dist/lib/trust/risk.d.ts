import { CandidateVerificationLevel, EmployerVerificationLevel, TrustRiskLevel } from "@prisma/client";
export interface RiskAssessment {
    score: number;
    level: TrustRiskLevel;
    flags: string[];
    autoHold: boolean;
}
export interface EmployerTrustAssessment {
    authenticityScore: number;
    riskScore: number;
    riskLevel: TrustRiskLevel;
    verificationLevel: EmployerVerificationLevel;
    postingEligibility: boolean;
    requiresEnhancedVerification: boolean;
    verifiedDomain: string | null;
    websiteMatchesEmail: boolean;
    throwawayDomainDetected: boolean;
    warnings: string[];
}
export interface CandidateTrustAssessment {
    authenticityScore: number;
    riskScore: number;
    riskLevel: TrustRiskLevel;
    verificationLevel: CandidateVerificationLevel;
    premiumFilterEligible: boolean;
    warnings: string[];
}
export declare function riskLevelForScore(score: number): TrustRiskLevel;
export declare function assessContentRisk(text: string): RiskAssessment;
export declare function assessEmployerTrust(input: {
    email: string;
    website?: string | null;
    linkedInCompanyUrl?: string | null;
    approvedBusinessDocs: number;
    approvedManualReviews: number;
    openReports: number;
    postingVelocity24h: number;
    isPremiumSubscription: boolean;
}): EmployerTrustAssessment;
export declare function assessCandidateTrust(input: {
    emailVerified: boolean;
    phoneVerified: boolean;
    identityVerified: boolean;
    skillsVerified?: boolean;
    verifiedSkillCount?: number;
    assessmentBackedSkillCount?: number;
    partnerSignalCount?: number;
    employmentVerified: boolean;
    hasLinkedIn: boolean;
    hasGitHub: boolean;
    hasPortfolio: boolean;
    hasResume?: boolean;
    profileCompleteness: number;
    workHistoryEntries?: number;
    workHistoryConsistent?: boolean;
    educationEvidenceCount?: number;
    certificationEvidenceCount?: number;
    openReports: number;
    applicationsLast24h: number;
}): CandidateTrustAssessment;
export declare function assessJobPostingRisk(input: {
    title: string;
    description: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    employerRiskScore: number;
}): RiskAssessment;
export declare function assessApplicationRisk(input: {
    coverLetter?: string | null;
    applicationsLast24h: number;
    candidateRiskScore: number;
}): RiskAssessment;
export declare function employerBadgeLabel(level: EmployerVerificationLevel): string;
export declare function candidateBadgeLabel(level: CandidateVerificationLevel): string;
//# sourceMappingURL=risk.d.ts.map