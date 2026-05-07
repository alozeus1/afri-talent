import { SubscriptionPlan } from "@prisma/client";
import prisma from "../prisma.js";

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
  templateDownloadsPerMonth: number | null;
}

// Hardcoded defaults (used when DB has no PlanEntitlement rows)
const DEFAULT_ENTITLEMENTS: Record<SubscriptionPlan, Entitlements> = {
  FREE: {
    plan: SubscriptionPlan.FREE,
    applicationsPerMonth: 5,
    aiResumeReviews: null,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: 3,
    jobAlerts: true,
    prioritySupport: false,
    skillsAssessments: false,
    chatAccess: false,
    autopilot: false,
    jobPostsPerMonth: null,
    talentSearch: false,
    analytics: false,
    apiAccess: false,
    atsIntegrations: null,
    videoMockInterviews: 2,
    pipelineExports: false,
    brandedCareerPage: false,
    advancedFunnelMetrics: false,
    templateDownloadsPerMonth: 0,
  },
  BASIC: {
    plan: SubscriptionPlan.BASIC,
    applicationsPerMonth: null, // unlimited
    aiResumeReviews: 10,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: null,
    jobAlerts: true,
    prioritySupport: false,
    skillsAssessments: false,
    chatAccess: true,
    autopilot: false,
    jobPostsPerMonth: null,
    talentSearch: false,
    analytics: false,
    apiAccess: false,
    atsIntegrations: null,
    videoMockInterviews: 5,
    pipelineExports: false,
    brandedCareerPage: false,
    advancedFunnelMetrics: false,
    templateDownloadsPerMonth: 1,
  },
  PROFESSIONAL: {
    plan: SubscriptionPlan.PROFESSIONAL,
    applicationsPerMonth: null,
    aiResumeReviews: null, // unlimited
    aiJobMatches: 20,
    aiApplyPacks: 5,
    savedSearches: null,
    jobAlerts: true,
    prioritySupport: true,
    skillsAssessments: true,
    chatAccess: true,
    autopilot: true,
    jobPostsPerMonth: null,
    talentSearch: false,
    analytics: false,
    apiAccess: false,
    atsIntegrations: null,
    videoMockInterviews: 10,
    pipelineExports: false,
    brandedCareerPage: false,
    advancedFunnelMetrics: false,
    templateDownloadsPerMonth: null,
  },
  EMPLOYER_FREE: {
    plan: SubscriptionPlan.EMPLOYER_FREE,
    applicationsPerMonth: null,
    aiResumeReviews: null,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: null,
    jobAlerts: false,
    prioritySupport: false,
    skillsAssessments: false,
    chatAccess: false,
    autopilot: false,
    jobPostsPerMonth: 3,
    talentSearch: false,
    analytics: false,
    apiAccess: false,
    atsIntegrations: 0,
    videoMockInterviews: null,
    pipelineExports: false,
    brandedCareerPage: false,
    advancedFunnelMetrics: false,
    templateDownloadsPerMonth: 0,
  },
  EMPLOYER_BASIC: {
    plan: SubscriptionPlan.EMPLOYER_BASIC,
    applicationsPerMonth: null,
    aiResumeReviews: null,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: null,
    jobAlerts: false,
    prioritySupport: false,
    skillsAssessments: false,
    chatAccess: false,
    autopilot: false,
    jobPostsPerMonth: 20,
    talentSearch: true,
    analytics: true,
    apiAccess: false,
    atsIntegrations: 1,
    videoMockInterviews: null,
    pipelineExports: false,
    brandedCareerPage: true,
    advancedFunnelMetrics: false,
    templateDownloadsPerMonth: 0,
  },
  EMPLOYER_PREMIUM: {
    plan: SubscriptionPlan.EMPLOYER_PREMIUM,
    applicationsPerMonth: null,
    aiResumeReviews: null,
    aiJobMatches: null,
    aiApplyPacks: null,
    savedSearches: null,
    jobAlerts: false,
    prioritySupport: true,
    skillsAssessments: false,
    chatAccess: false,
    autopilot: false,
    jobPostsPerMonth: null, // unlimited
    talentSearch: true,
    analytics: true,
    apiAccess: true,
    atsIntegrations: 5,
    videoMockInterviews: null,
    pipelineExports: true,
    brandedCareerPage: true,
    advancedFunnelMetrics: true,
    templateDownloadsPerMonth: null,
  },
};

/**
 * Get entitlements for a plan. Checks DB first, falls back to hardcoded defaults.
 * Entitlements are plan-based, NOT region-based.
 */
export async function getEntitlements(plan: SubscriptionPlan): Promise<Entitlements> {
  const dbRow = await prisma.planEntitlement.findUnique({ where: { plan } });

  if (dbRow) {
    return {
      plan: dbRow.plan,
      applicationsPerMonth: dbRow.applicationsPerMonth,
      aiResumeReviews: dbRow.aiResumeReviews,
      aiJobMatches: dbRow.aiJobMatches,
      aiApplyPacks: dbRow.aiApplyPacks,
      savedSearches: dbRow.savedSearches,
      jobAlerts: dbRow.jobAlerts,
      prioritySupport: dbRow.prioritySupport,
      skillsAssessments: dbRow.skillsAssessments,
      chatAccess: dbRow.chatAccess,
      autopilot: dbRow.autopilot,
      jobPostsPerMonth: dbRow.jobPostsPerMonth,
      talentSearch: dbRow.talentSearch,
      analytics: dbRow.analytics,
      apiAccess: dbRow.apiAccess,
      atsIntegrations: dbRow.atsIntegrations,
      videoMockInterviews: dbRow.videoMockInterviews,
      pipelineExports: dbRow.pipelineExports,
      brandedCareerPage: dbRow.brandedCareerPage,
      advancedFunnelMetrics: dbRow.advancedFunnelMetrics,
      templateDownloadsPerMonth: dbRow.templateDownloadsPerMonth,
    };
  }

  return DEFAULT_ENTITLEMENTS[plan] ?? DEFAULT_ENTITLEMENTS.FREE;
}

/**
 * Get entitlements for a user (looks up their current subscription plan).
 */
export async function getUserEntitlements(userId: string): Promise<Entitlements> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true },
  });

  if (!sub || sub.status === "CANCELLED" || sub.status === "INACTIVE") {
    return getEntitlements(SubscriptionPlan.FREE);
  }

  return getEntitlements(sub.plan);
}

export { DEFAULT_ENTITLEMENTS };
