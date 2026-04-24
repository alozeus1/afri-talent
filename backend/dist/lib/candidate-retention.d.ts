import { CandidateVerificationLevel } from "@prisma/client";
import { type RankedPublicJob } from "./jobs/search.js";
export interface CandidateRetentionJourney {
    key: "saved_search" | "profile_completion" | "verification_completion" | "application_momentum" | "salary_insight" | "interview_prep";
    title: string;
    description: string;
    status: "READY" | "DONE" | "WATCH";
    href: string;
    ctaLabel: string;
    priority: number;
}
export interface CandidateRetentionExperiment {
    key: "digest_hero_v1" | "recommendation_mix_v1";
    variant: string;
}
export interface CandidateWeeklyDigestPreview {
    headline: string;
    trustedJobCount: number;
    verifiedEmployerCount: number;
    salaryTransparentCount: number;
    visaFriendlyCount: number;
    freshnessWindowLabel: string;
    jobs: RankedPublicJob[];
}
export interface CandidateRetentionSummary {
    snapshot: {
        profileCompleteness: number;
        trustScore: number;
        verificationLevel: CandidateVerificationLevel;
        savedSearchCount: number;
        openApplications: number;
        notificationBudgetRemaining: number;
        lastDigestAt: string | null;
        notificationCadenceHours: number;
        maxNotificationsPerWeek: number;
    };
    recommendations: RankedPublicJob[];
    weeklyDigest: CandidateWeeklyDigestPreview;
    journeys: CandidateRetentionJourney[];
    experiments: CandidateRetentionExperiment[];
    preferences: {
        weeklyDigests: boolean;
        savedSearchAlerts: boolean;
        applicationReminders: boolean;
        profileCompletionNudges: boolean;
        verificationCompletionNudges: boolean;
        visaRelocationAlerts: boolean;
        salaryInsights: boolean;
        interviewPrepRecommendations: boolean;
        maxNotificationsPerWeek: number;
        minimumHoursBetweenNotifications: number;
    };
}
export interface LifecycleDeliveryDecision {
    allowed: boolean;
    reasonCode: "ok" | "week_budget_exhausted" | "minimum_spacing";
}
export declare function evaluateLifecycleDelivery(input: {
    state: {
        weekWindowStartedAt: Date | null;
        notificationsThisWeek: number;
        lastNotificationAt: Date | null;
    };
    preferences: {
        maxNotificationsPerWeek: number;
        minimumHoursBetweenNotifications: number;
    };
    now?: Date;
}): LifecycleDeliveryDecision;
export declare function buildCandidateRetentionExperiments(userId: string): CandidateRetentionExperiment[];
export declare function buildCandidateRetentionJourneys(input: {
    profileCompleteness: number;
    verificationLevel: CandidateVerificationLevel;
    savedSearchCount: number;
    openApplications: number;
    hasSalaryInsight: boolean;
    hasInterviewPrepOpportunity: boolean;
}): CandidateRetentionJourney[];
export declare function getCandidateRecommendationFeed(userId: string, limit?: number): Promise<RankedPublicJob[]>;
export declare function getCandidateRetentionSummary(userId: string): Promise<CandidateRetentionSummary | null>;
export declare function runCandidateRetentionForUser(userId: string, now?: Date): Promise<number>;
export declare function runCandidateRetentionCycle(now?: Date): Promise<number>;
//# sourceMappingURL=candidate-retention.d.ts.map