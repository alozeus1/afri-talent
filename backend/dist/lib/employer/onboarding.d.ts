import { EmployerVerificationLevel, JobStatus, SubscriptionPlan } from "@prisma/client";
export declare const EMPLOYER_ONBOARDING_STEPS: readonly ["company_setup", "verification", "team_setup", "first_job_post", "candidate_filters", "subscription_choice", "trust_completion"];
export type EmployerOnboardingStep = (typeof EMPLOYER_ONBOARDING_STEPS)[number];
export interface EmployerCandidateFilters {
    skills: string[];
    location: string | null;
    minExperience: number | null;
    verifiedOnly: boolean;
    visaPreference: "ANY" | "SPONSORED_ONLY";
}
export interface EmployerMilestones {
    firstApprovedJobAt: string | null;
    firstCandidateViewAt: string | null;
    firstQualifiedShortlistAt: string | null;
}
export interface EmployerOnboardingChecklistItem {
    key: EmployerOnboardingStep;
    label: string;
    description: string;
    done: boolean;
    href: string;
}
export interface EmployerOnboardingChecklistInput {
    companySetupDone: boolean;
    verificationDone: boolean;
    teamSetupDone: boolean;
    firstJobPostDone: boolean;
    candidateFiltersDone: boolean;
    subscriptionChoiceDone: boolean;
    trustCompletionDone: boolean;
}
export declare function normalizeEmployerCandidateFilters(value: unknown): EmployerCandidateFilters;
export declare function hasCandidateFilters(filters: EmployerCandidateFilters): boolean;
export declare function buildEmployerOnboardingChecklist(input: EmployerOnboardingChecklistInput): EmployerOnboardingChecklistItem[];
export declare function completionPercentage(checklist: EmployerOnboardingChecklistItem[]): number;
export declare function nextEmployerAction(checklist: EmployerOnboardingChecklistItem[]): {
    key: EmployerOnboardingStep;
    title: string;
    body: string;
    href: string;
    ctaLabel: string;
};
export declare function verificationIsStrong(level: EmployerVerificationLevel): boolean;
export declare function verificationImpactSummary(input: {
    verificationLevel: EmployerVerificationLevel;
    qualifiedApplicants: number;
    totalApplications: number;
}): {
    verified: boolean;
    qualifiedApplicantRate: number;
    insight: string;
};
export declare function employerUpgradeJourney(input: {
    plan: SubscriptionPlan;
    publishedJobs: number;
    qualifiedApplicants: number;
    candidateFiltersDone: boolean;
}): {
    targetPlan: null;
    headline: string;
    body: string;
    ctaLabel: string;
} | {
    targetPlan: "EMPLOYER_PREMIUM";
    headline: string;
    body: string;
    ctaLabel: string;
} | {
    targetPlan: "EMPLOYER_BASIC";
    headline: string;
    body: string;
    ctaLabel: string;
};
export declare function milestoneStatus(milestones: EmployerMilestones): {
    label: string;
    state: "activated";
} | {
    label: string;
    state: "in_progress";
} | {
    label: string;
    state: "not_started";
};
export declare function qualifiedApplicantsCount(statuses: Array<{
    status: string;
}>): number;
export declare function timeToFirstQualifiedApplicantHours(input: {
    firstApprovedJobAt: Date | null;
    firstQualifiedShortlistAt: Date | null;
}): number | null;
export declare function isPlanSelectionDone(plan: SubscriptionPlan | null | undefined, selectedPlan: SubscriptionPlan | null | undefined): boolean;
export declare function isJobApproved(status: JobStatus): boolean;
//# sourceMappingURL=onboarding.d.ts.map