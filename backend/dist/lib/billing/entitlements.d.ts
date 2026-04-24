import { SubscriptionPlan } from "@prisma/client";
export interface Entitlements {
    plan: SubscriptionPlan;
    applicationsPerMonth: number | null;
    aiResumeReviews: number | null;
    aiJobMatches: number | null;
    aiApplyPacks: number | null;
    savedSearches: number | null;
    jobAlerts: boolean;
    prioritySupport: boolean;
    skillsAssessments: boolean;
    chatAccess: boolean;
    autopilot: boolean;
    jobPostsPerMonth: number | null;
    talentSearch: boolean;
    analytics: boolean;
    apiAccess: boolean;
    atsIntegrations: number | null;
    videoMockInterviews: number | null;
    pipelineExports: boolean;
    brandedCareerPage: boolean;
    advancedFunnelMetrics: boolean;
}
declare const DEFAULT_ENTITLEMENTS: Record<SubscriptionPlan, Entitlements>;
/**
 * Get entitlements for a plan. Checks DB first, falls back to hardcoded defaults.
 * Entitlements are plan-based, NOT region-based.
 */
export declare function getEntitlements(plan: SubscriptionPlan): Promise<Entitlements>;
/**
 * Get entitlements for a user (looks up their current subscription plan).
 */
export declare function getUserEntitlements(userId: string): Promise<Entitlements>;
export { DEFAULT_ENTITLEMENTS };
//# sourceMappingURL=entitlements.d.ts.map