type CandidateWorkHistoryLike = {
    company?: string | null;
    title?: string | null;
    description?: string | null;
    period?: string | null;
};
type ImmigrationProcessLike = {
    targetCountry: string;
    visaType: string;
    status: string;
};
export interface CandidateMatchProfile {
    userId: string;
    headline?: string | null;
    bio?: string | null;
    skills: string[];
    targetRoles: string[];
    targetCountries: string[];
    yearsExperience?: number | null;
    visaStatus?: string | null;
    profileCompleteness: number;
    workHistory?: CandidateWorkHistoryLike[] | null;
}
export interface CandidateTrustSignals {
    authenticityScore: number;
    verifiedSkillCount: number;
    partnerSignalCount: number;
    assessmentBacked: boolean;
    premiumFilterEligible: boolean;
    fullyCompletedProfile: boolean;
    riskScore: number;
}
export interface TalentMatchInput {
    query?: string | null;
    desiredSkills?: string[];
    targetLocation?: string | null;
    minExperience?: number | null;
    candidate: CandidateMatchProfile;
    trust?: CandidateTrustSignals | null;
    immigrationProcesses?: ImmigrationProcessLike[];
}
export interface TalentMobilitySummary {
    score: number;
    label: "READY" | "PROMISING" | "EARLY";
    factors: string[];
    activeProcess: {
        visaType: string;
        targetCountry: string;
        status: string;
    } | null;
}
export interface TalentMatchSummary {
    score: number;
    semanticScore: number;
    skillScore: number;
    experienceScore: number;
    trustScore: number;
    mobilityScore: number;
    reasons: string[];
    mobility: TalentMobilitySummary;
}
export declare function buildTalentMatch(input: TalentMatchInput): TalentMatchSummary;
export {};
//# sourceMappingURL=match.d.ts.map