import {
  ApplicationStatus,
  CandidateLifecycleTriggerType,
  CandidateVerificationLevel,
  NotificationType,
  Prisma,
  Role,
  TrustRiskLevel,
} from "@prisma/client";
import prisma from "./prisma.js";
import { buildJobSearchWhere, buildPreferenceContext, fetchRankedJobs, type JobSearchFilters, type RankedPublicJob } from "./jobs/search.js";
import { createUserNotification } from "./notifications.js";
import { candidateWeeklyDigestEmail } from "./email.js";
import { sendBotJobDigest } from "./bots/outbound.js";
import { recordOpsEvent } from "./ops/events.js";

const MAX_RECOMMENDATION_CANDIDATES = 250;
const DEFAULT_DIGEST_JOB_COUNT = 5;
const APPLICATION_REMINDER_LOOKBACK_DAYS = 10;
const PROFILE_NUDGE_COOLDOWN_DAYS = 4;
const VERIFICATION_NUDGE_COOLDOWN_DAYS = 5;
const SALARY_INSIGHT_COOLDOWN_DAYS = 10;
const INTERVIEW_PREP_COOLDOWN_DAYS = 7;
const VISA_ALERT_COOLDOWN_DAYS = 5;
const DIGEST_COOLDOWN_DAYS = 7;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

type JsonMap = Record<string, string | number | boolean | null | string[]>;

export interface CandidateRetentionJourney {
  key:
    | "saved_search"
    | "profile_completion"
    | "verification_completion"
    | "application_momentum"
    | "salary_insight"
    | "interview_prep";
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

type CandidateNotificationPreferences = Awaited<ReturnType<typeof ensureCandidateNotificationPreferences>>;
type CandidateLifecycleStateRecord = Awaited<ReturnType<typeof ensureCandidateLifecycleState>>;
type CandidateRetentionContext = Exclude<Awaited<ReturnType<typeof loadCandidateRetentionContext>>, null>;

function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  const day = normalized.getUTCDay();
  const diff = (day + 6) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - diff);
  return normalized;
}

function weekBucket(date: Date): string {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lower(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function hasCitizenLikeVisaStatus(visaStatus?: string | null): boolean {
  const normalized = lower(visaStatus);
  return (
    normalized.length === 0 ||
    normalized.includes("citizen") ||
    normalized.includes("permanent") ||
    normalized.includes("resident")
  );
}

function buildExperimentVariant(userId: string, key: string, variants: string[]): string {
  let total = 0;
  const seed = `${userId}:${key}`;
  for (let index = 0; index < seed.length; index += 1) {
    total = (total + seed.charCodeAt(index) * (index + 3)) % 2147483647;
  }
  return variants[total % variants.length];
}

function maybeCareerReason(job: RankedPublicJob): string {
  return job.rankingExplanation.reasons[0] || job.rankingExplanation.summary;
}

function buildDigestHeadline(jobs: RankedPublicJob[]): string {
  const trustedCount = jobs.filter((job) => job.discovery.trustedJob).length;
  if (jobs.length === 0) {
    return "We are watching the market for the next high-signal role.";
  }
  if (trustedCount >= 3) {
    return `${trustedCount} trusted roles rose to the top this week.`;
  }
  return `${jobs.length} fresh matches fit your profile right now.`;
}

export function evaluateLifecycleDelivery(input: {
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
}): LifecycleDeliveryDecision {
  const now = input.now ?? new Date();
  const currentWeek = startOfWeek(now);
  const weekWindowStartedAt = input.state.weekWindowStartedAt;
  const notificationsThisWeek =
    weekWindowStartedAt && weekWindowStartedAt.getTime() === currentWeek.getTime()
      ? input.state.notificationsThisWeek
      : 0;

  if (notificationsThisWeek >= input.preferences.maxNotificationsPerWeek) {
    return { allowed: false, reasonCode: "week_budget_exhausted" };
  }

  if (input.state.lastNotificationAt) {
    const hoursSinceLastNotification =
      (now.getTime() - input.state.lastNotificationAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastNotification < input.preferences.minimumHoursBetweenNotifications) {
      return { allowed: false, reasonCode: "minimum_spacing" };
    }
  }

  return { allowed: true, reasonCode: "ok" };
}

export function buildCandidateRetentionExperiments(userId: string): CandidateRetentionExperiment[] {
  return [
    {
      key: "digest_hero_v1",
      variant: buildExperimentVariant(userId, "digest_hero_v1", ["control", "trust_first"]),
    },
    {
      key: "recommendation_mix_v1",
      variant: buildExperimentVariant(userId, "recommendation_mix_v1", ["fit_heavy", "freshness_heavy"]),
    },
  ];
}

export function buildCandidateRetentionJourneys(input: {
  profileCompleteness: number;
  verificationLevel: CandidateVerificationLevel;
  savedSearchCount: number;
  openApplications: number;
  hasSalaryInsight: boolean;
  hasInterviewPrepOpportunity: boolean;
}): CandidateRetentionJourney[] {
  const journeys: CandidateRetentionJourney[] = [
    {
      key: "saved_search",
      title: input.savedSearchCount > 0 ? "Saved search alerts are running" : "Create a saved search",
      description:
        input.savedSearchCount > 0
          ? "Your job alerts can keep discovering fresh matches while you are away."
          : "Turn your preferences into a trusted job feed instead of starting from scratch each visit.",
      status: input.savedSearchCount > 0 ? "DONE" : "READY",
      href: "/candidate/saved-searches",
      ctaLabel: input.savedSearchCount > 0 ? "Refine alerts" : "Create alert",
      priority: input.savedSearchCount > 0 ? 5 : 1,
    },
    {
      key: "profile_completion",
      title: input.profileCompleteness >= 85 ? "Profile is employer-ready" : "Complete your profile",
      description:
        input.profileCompleteness >= 85
          ? "Your profile already gives employers the context they need to trust a shortlist."
          : "A stronger profile increases recommendation quality and employer response rates.",
      status: input.profileCompleteness >= 85 ? "DONE" : "READY",
      href: "/candidate/profile",
      ctaLabel: input.profileCompleteness >= 85 ? "Review profile" : "Complete profile",
      priority: input.profileCompleteness >= 85 ? 6 : 2,
    },
    {
      key: "verification_completion",
      title:
        input.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        input.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? "Verification signals are strong"
          : "Finish profile verification",
      description:
        input.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        input.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? "Verified details help premium employers trust your application faster."
          : "Phone, identity, and skills signals unlock stronger employer trust filters.",
      status:
        input.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        input.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? "DONE"
          : "READY",
      href: "/candidate/trust",
      ctaLabel:
        input.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        input.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? "Review trust profile"
          : "Boost trust score",
      priority:
        input.verificationLevel === CandidateVerificationLevel.SKILLS_VERIFIED ||
        input.verificationLevel === CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED
          ? 7
          : 3,
    },
    {
      key: "application_momentum",
      title: input.openApplications > 0 ? "Keep momentum on live applications" : "Build application momentum",
      description:
        input.openApplications > 0
          ? "Stay responsive, keep documents current, and line up backup opportunities."
          : "Fresh, trusted roles are waiting. A steady application rhythm beats random bursts.",
      status: input.openApplications > 0 ? "WATCH" : "READY",
      href: "/candidate",
      ctaLabel: input.openApplications > 0 ? "Track applications" : "Browse matches",
      priority: input.openApplications > 0 ? 4 : 2,
    },
    {
      key: "salary_insight",
      title: input.hasSalaryInsight ? "Salary signal available" : "Salary insight will unlock soon",
      description: input.hasSalaryInsight
        ? "Use current market data to judge whether a role is worth your time."
        : "As we collect more salary data for your target roles, we will highlight pay trends here.",
      status: input.hasSalaryInsight ? "READY" : "WATCH",
      href: "/salaries",
      ctaLabel: input.hasSalaryInsight ? "See salary data" : "Explore salary hub",
      priority: input.hasSalaryInsight ? 5 : 8,
    },
    {
      key: "interview_prep",
      title: input.hasInterviewPrepOpportunity ? "Interview prep is recommended" : "Interview prep will appear when needed",
      description: input.hasInterviewPrepOpportunity
        ? "You have active employer interest. Practice now while the window is warm."
        : "Once you are shortlisted or under review, we will suggest targeted mock interview prep.",
      status: input.hasInterviewPrepOpportunity ? "READY" : "WATCH",
      href: "/candidate/ai-assistant",
      ctaLabel: input.hasInterviewPrepOpportunity ? "Start prep" : "Open assistant",
      priority: input.hasInterviewPrepOpportunity ? 4 : 9,
    },
  ];

  return journeys.sort((left, right) => left.priority - right.priority);
}

async function ensureCandidateNotificationPreferences(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function ensureCandidateLifecycleState(userId: string) {
  return prisma.candidateLifecycleState.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function normalizeLifecycleStateForNow(userId: string, state: CandidateLifecycleStateRecord, now = new Date()) {
  const currentWeek = startOfWeek(now);
  const weekWindowStartedAt = state.weekWindowStartedAt;

  if (!weekWindowStartedAt || weekWindowStartedAt.getTime() !== currentWeek.getTime()) {
    return prisma.candidateLifecycleState.update({
      where: { userId },
      data: {
        weekWindowStartedAt: currentWeek,
        notificationsThisWeek: 0,
      },
    });
  }

  return state;
}

async function loadCandidateRetentionContext(userId: string) {
  const [user, preferences, state, profile, trustProfile, savedSearches, applications, lastInterviewSession] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountRestrictionStatus: true,
        },
      }),
      ensureCandidateNotificationPreferences(userId),
      ensureCandidateLifecycleState(userId),
      prisma.candidateProfile.findUnique({
        where: { userId },
        select: {
          userId: true,
          skills: true,
          targetRoles: true,
          targetCountries: true,
          visaStatus: true,
          profileCompleteness: true,
          openToWork: true,
          updatedAt: true,
        },
      }),
      prisma.candidateTrustProfile.findUnique({
        where: { userId },
        select: {
          verificationLevel: true,
          authenticityScore: true,
          premiumFilterEligible: true,
        },
      }),
      prisma.savedSearch.findMany({
        where: { userId, alertEnabled: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.application.findMany({
        where: { candidateId: userId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          job: {
            select: {
              id: true,
              slug: true,
              title: true,
              location: true,
              employer: {
                select: {
                  companyName: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.mockInterviewSession.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          targetRole: true,
          status: true,
        },
      }),
    ]);

  if (!user || user.role !== Role.CANDIDATE || user.accountRestrictionStatus !== "ACTIVE") {
    return null;
  }

  const normalizedState = await normalizeLifecycleStateForNow(userId, state);

  return {
    user,
    preferences,
    state: normalizedState,
    profile,
    trustProfile,
    savedSearches,
    applications,
    lastInterviewSession,
  };
}

function buildRecommendationFilters(context: CandidateRetentionContext): {
  where: Prisma.JobWhereInput;
  filters: JobSearchFilters;
  querySeed: string;
  requiresVisaSponsorship: boolean;
} {
  const queryTokens = unique([
    ...(context.profile?.targetRoles ?? []).slice(0, 3),
    ...(context.savedSearches.flatMap((search) => search.keywords).slice(0, 4)),
    ...(context.profile?.skills ?? []).slice(0, 4),
  ]);
  const locationSeeds = unique([
    ...(context.savedSearches.flatMap((search) => search.locations).slice(0, 3)),
    ...(context.profile?.targetCountries ?? []).slice(0, 3),
  ]);
  const jobType = context.savedSearches.find((search) => search.jobTypes.length > 0)?.jobTypes[0];
  const seniority = context.savedSearches.find((search) => search.seniorities.length > 0)?.seniorities[0];
  const salaryMin =
    context.savedSearches
      .map((search) => search.salaryMin)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => right - left)[0] ?? null;
  const salaryMax =
    context.savedSearches
      .map((search) => search.salaryMax)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right)[0] ?? null;
  const remote = context.savedSearches.some((search) => search.remoteOnly);
  const requiresVisaSponsorship =
    context.savedSearches.some((search) => search.visaSponsorship) ||
    !hasCitizenLikeVisaStatus(context.profile?.visaStatus);

  const filters: JobSearchFilters = {
    search: queryTokens.join(" ").trim() || undefined,
    location: locationSeeds[0] || undefined,
    type: jobType,
    seniority,
    remote,
    visaSponsorship: requiresVisaSponsorship ? "YES" : undefined,
    salaryMin,
    salaryMax,
    country: context.profile?.targetCountries?.[0] || undefined,
  };

  const baseWhere = buildJobSearchWhere(filters);
  const orConditions: Prisma.JobWhereInput[] = [];

  for (const role of context.profile?.targetRoles ?? []) {
    orConditions.push({ title: { contains: role, mode: "insensitive" } });
  }
  for (const skill of context.profile?.skills ?? []) {
    orConditions.push({ tags: { has: skill.toLowerCase() } });
  }
  for (const keyword of context.savedSearches.flatMap((search) => search.keywords).slice(0, 6)) {
    orConditions.push({ title: { contains: keyword, mode: "insensitive" } });
    orConditions.push({ description: { contains: keyword, mode: "insensitive" } });
  }
  for (const country of context.profile?.targetCountries ?? []) {
    orConditions.push({ eligibleCountries: { has: country } });
    orConditions.push({ location: { contains: country, mode: "insensitive" } });
  }

  return {
    where: orConditions.length > 0 ? { AND: [baseWhere, { OR: orConditions }] } : baseWhere,
    filters,
    querySeed: queryTokens.join(", "),
    requiresVisaSponsorship,
  };
}

export async function getCandidateRecommendationFeed(userId: string, limit = 8): Promise<RankedPublicJob[]> {
  const context = await loadCandidateRetentionContext(userId);
  if (!context) {
    return [];
  }

  const { where, filters, requiresVisaSponsorship } = buildRecommendationFilters(context);
  const appliedJobIds = new Set(context.applications.map((application) => application.job.id));
  const preferenceContext = buildPreferenceContext(filters, {
    skills: context.profile?.skills ?? [],
    targetRoles: context.profile?.targetRoles ?? [],
    targetCountries: context.profile?.targetCountries ?? [],
    requiresVisaSponsorship,
    remoteOnly: context.savedSearches.some((search) => search.remoteOnly),
    salaryMin: filters.salaryMin ?? null,
    salaryMax: filters.salaryMax ?? null,
  });

  const { jobs } = await fetchRankedJobs({
    where,
    page: 1,
    limit,
    take: MAX_RECOMMENDATION_CANDIDATES,
    preferenceContext,
  });

  return jobs
    .filter((job) => !appliedJobIds.has(job.id))
    .filter((job) => job.rankingScore >= 35)
    .slice(0, limit);
}

async function buildWeeklyDigestPreviewFromRecommendations(
  recommendations: RankedPublicJob[],
): Promise<CandidateWeeklyDigestPreview> {
  const jobs = recommendations.slice(0, DEFAULT_DIGEST_JOB_COUNT);
  return {
    headline: buildDigestHeadline(jobs),
    trustedJobCount: jobs.filter((job) => job.discovery.trustedJob).length,
    verifiedEmployerCount: jobs.filter((job) => job.discovery.verifiedEmployer).length,
    salaryTransparentCount: jobs.filter((job) => job.discovery.salaryTransparent).length,
    visaFriendlyCount: jobs.filter((job) => job.discovery.visaClear || job.discovery.relocationClear).length,
    freshnessWindowLabel:
      jobs.length > 0 && jobs.every((job) => job.discovery.freshnessLabel === "FRESH" || job.discovery.freshnessLabel === "RECENT")
        ? "Fresh this week"
        : "Mixed freshness",
    jobs,
  };
}

async function loadSalaryInsight(userId: string, profile: CandidateRetentionContext["profile"]) {
  const targetRole = profile?.targetRoles?.[0];
  const targetCountry = profile?.targetCountries?.[0];
  if (!targetRole) {
    return null;
  }

  const marketRows = await prisma.salaryReport.findMany({
    where: {
      jobTitle: { contains: targetRole, mode: "insensitive" },
      ...(targetCountry ? { country: { contains: targetCountry, mode: "insensitive" } } : {}),
    },
    select: {
      salaryAmount: true,
      salaryCurrency: true,
      country: true,
      salaryPeriod: true,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  if (marketRows.length < 5) {
    return null;
  }

  const amounts = marketRows.map((row) => row.salaryAmount).sort((left, right) => left - right);
  const middle = Math.floor(amounts.length / 2);
  const median =
    amounts.length % 2 === 0
      ? Math.round((amounts[middle - 1] + amounts[middle]) / 2)
      : amounts[middle];

  const userSubmittedSalaryReports = await prisma.salaryReport.count({
    where: { userId },
  });

  return {
    role: targetRole,
    country: targetCountry || marketRows[0]?.country || "Global",
    median,
    currency: marketRows[0]?.salaryCurrency || "USD",
    period: marketRows[0]?.salaryPeriod || "yearly",
    hasSubmittedSalarySignal: userSubmittedSalaryReports > 0,
    sampleCount: marketRows.length,
  };
}

export async function getCandidateRetentionSummary(userId: string): Promise<CandidateRetentionSummary | null> {
  const context = await loadCandidateRetentionContext(userId);
  if (!context) {
    return null;
  }

  const recommendations = await getCandidateRecommendationFeed(userId, 8);
  const weeklyDigest = await buildWeeklyDigestPreviewFromRecommendations(recommendations);
  const salaryInsight = await loadSalaryInsight(userId, context.profile);
  const openApplications = context.applications.filter((application) =>
    application.status === ApplicationStatus.PENDING ||
    application.status === ApplicationStatus.REVIEWING ||
    application.status === ApplicationStatus.SHORTLISTED,
  ).length;
  const notificationBudgetRemaining = Math.max(
    0,
    context.preferences.maxNotificationsPerWeek - context.state.notificationsThisWeek,
  );
  const verificationLevel =
    context.trustProfile?.verificationLevel ?? CandidateVerificationLevel.UNVERIFIED;
  const journeys = buildCandidateRetentionJourneys({
    profileCompleteness: context.profile?.profileCompleteness ?? 0,
    verificationLevel,
    savedSearchCount: context.savedSearches.length,
    openApplications,
    hasSalaryInsight: Boolean(salaryInsight),
    hasInterviewPrepOpportunity: openApplications > 0,
  });

  return {
    snapshot: {
      profileCompleteness: context.profile?.profileCompleteness ?? 0,
      trustScore: context.trustProfile?.authenticityScore ?? 0,
      verificationLevel,
      savedSearchCount: context.savedSearches.length,
      openApplications,
      notificationBudgetRemaining,
      lastDigestAt: context.state.lastDigestAt?.toISOString() ?? null,
      notificationCadenceHours: context.preferences.minimumHoursBetweenNotifications,
      maxNotificationsPerWeek: context.preferences.maxNotificationsPerWeek,
    },
    recommendations,
    weeklyDigest,
    journeys,
    experiments: buildCandidateRetentionExperiments(userId),
    preferences: {
      weeklyDigests: context.preferences.weeklyDigests,
      savedSearchAlerts: context.preferences.savedSearchAlerts,
      applicationReminders: context.preferences.applicationReminders,
      profileCompletionNudges: context.preferences.profileCompletionNudges,
      verificationCompletionNudges: context.preferences.verificationCompletionNudges,
      visaRelocationAlerts: context.preferences.visaRelocationAlerts,
      salaryInsights: context.preferences.salaryInsights,
      interviewPrepRecommendations: context.preferences.interviewPrepRecommendations,
      maxNotificationsPerWeek: context.preferences.maxNotificationsPerWeek,
      minimumHoursBetweenNotifications: context.preferences.minimumHoursBetweenNotifications,
    },
  };
}

function buildLifecycleDedupeKey(triggerType: CandidateLifecycleTriggerType, userId: string, now: Date): string {
  return `${triggerType}:${userId}:${weekBucket(now)}`;
}

async function dispatchLifecycleEvent(input: {
  context: CandidateRetentionContext;
  now: Date;
  triggerType: CandidateLifecycleTriggerType;
  notificationType: NotificationType;
  channel:
    | "weeklyDigests"
    | "applicationReminders"
    | "profileCompletionNudges"
    | "verificationCompletionNudges"
    | "visaRelocationAlerts"
    | "salaryInsights"
    | "interviewPrepRecommendations";
  reasonCode: string;
  title: string;
  body: string;
  metadata?: JsonMap;
  email?: {
    topJobs: RankedPublicJob[];
  };
}): Promise<boolean> {
  const decision = evaluateLifecycleDelivery({
    state: {
      weekWindowStartedAt: input.context.state.weekWindowStartedAt,
      notificationsThisWeek: input.context.state.notificationsThisWeek,
      lastNotificationAt: input.context.state.lastNotificationAt,
    },
    preferences: {
      maxNotificationsPerWeek: input.context.preferences.maxNotificationsPerWeek,
      minimumHoursBetweenNotifications: input.context.preferences.minimumHoursBetweenNotifications,
    },
    now: input.now,
  });

  if (!decision.allowed) {
    recordOpsEvent({
      metricName: "candidate_retention_delivery_skipped",
      category: "candidate_retention",
      outcome: "held",
      severity: "warning",
      details: {
        trigger: input.triggerType,
        reason: decision.reasonCode,
      },
    });
    return false;
  }

  const dedupeKey = buildLifecycleDedupeKey(input.triggerType, input.context.user.id, input.now);
  const existingEvent = await prisma.candidateLifecycleEvent.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });

  if (existingEvent) {
    return false;
  }

  const notification = await createUserNotification({
    userId: input.context.user.id,
    type: input.notificationType,
    title: input.title,
    body: input.body,
    channel: input.channel,
    metadata: input.metadata as Prisma.InputJsonValue | undefined,
  });

  await prisma.candidateLifecycleEvent.create({
    data: {
      userId: input.context.user.id,
      lifecycleStateId: input.context.state.id,
      triggerType: input.triggerType,
      channel: input.channel,
      reasonCode: input.reasonCode,
      dedupeKey,
      title: input.title,
      body: input.body,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      notificationId: notification.id,
      sentAt: input.now,
    },
  });

  const nextStateData: Prisma.CandidateLifecycleStateUpdateInput = {
    weekWindowStartedAt: startOfWeek(input.now),
    notificationsThisWeek: {
      increment: 1,
    },
    lastNotificationAt: input.now,
  };

  switch (input.triggerType) {
    case CandidateLifecycleTriggerType.WEEKLY_DIGEST:
      nextStateData.lastDigestAt = input.now;
      nextStateData.lastDigestJobCount = input.email?.topJobs.length ?? 0;
      break;
    case CandidateLifecycleTriggerType.APPLICATION_REMINDER:
      nextStateData.lastApplicationReminderAt = input.now;
      break;
    case CandidateLifecycleTriggerType.PROFILE_COMPLETION:
      nextStateData.lastProfileNudgeAt = input.now;
      break;
    case CandidateLifecycleTriggerType.VERIFICATION_COMPLETION:
      nextStateData.lastVerificationNudgeAt = input.now;
      break;
    case CandidateLifecycleTriggerType.VISA_RELOCATION_MATCH:
      nextStateData.lastVisaAlertAt = input.now;
      break;
    case CandidateLifecycleTriggerType.SALARY_INSIGHT:
      nextStateData.lastSalaryInsightAt = input.now;
      break;
    case CandidateLifecycleTriggerType.INTERVIEW_PREP:
      nextStateData.lastInterviewPrepAt = input.now;
      break;
  }

  const updatedState = await prisma.candidateLifecycleState.update({
    where: { userId: input.context.user.id },
    data: nextStateData,
  });
  input.context.state = updatedState;

  if (input.email && input.context.preferences.weeklyDigests) {
    await candidateWeeklyDigestEmail({
      to: input.context.user.email,
      candidateName: input.context.user.name,
      jobs: input.email.topJobs.map((job) => ({
        title: job.title,
        companyName: job.employer?.companyName ?? job.sourceName ?? "Unknown Company",
        location: job.location,
        summary: maybeCareerReason(job),
        url: `${DEFAULT_FRONTEND_URL}/jobs/${job.slug}`,
      })),
      digestUrl: `${DEFAULT_FRONTEND_URL}/candidate/preferences`,
    }).catch(() => undefined);

    // WhatsApp/Telegram fan-out — inert unless the bot bridge is configured
    // (PHASE4_BOTS_ENABLED + BOT_BRIDGE_OUTBOUND_URL). Same weeklyDigests
    // preference gate as email; per-subscription opt-in enforced downstream.
    const digestLines = input.email.topJobs
      .slice(0, 5)
      .map(
        (job, i) =>
          `${i + 1}. ${job.title} — ${job.employer?.companyName ?? job.sourceName ?? "Company"} (${job.location})\n${DEFAULT_FRONTEND_URL}/jobs/${job.slug}`,
      );
    const digestText =
      `🌍 Your AfriTalent weekly digest\n\n${digestLines.join("\n\n")}\n\n` +
      `Manage alerts: ${DEFAULT_FRONTEND_URL}/candidate/preferences`;
    await sendBotJobDigest(input.context.user.id, digestText).catch(() => undefined);
  }

  recordOpsEvent({
    metricName: "candidate_retention_delivery_success",
    category: "candidate_retention",
    details: {
      trigger: input.triggerType,
      channel: input.channel,
    },
  });

  return true;
}

export async function runCandidateRetentionForUser(userId: string, now = new Date()): Promise<number> {
  const context = await loadCandidateRetentionContext(userId);
  if (!context || !context.profile?.openToWork) {
    return 0;
  }

  let sent = 0;
  const recommendations = await getCandidateRecommendationFeed(userId, 8);
  const weeklyDigest = await buildWeeklyDigestPreviewFromRecommendations(recommendations);
  const salaryInsight = await loadSalaryInsight(userId, context.profile);
  const activeApplications = context.applications.filter((application) =>
    application.status === ApplicationStatus.REVIEWING ||
    application.status === ApplicationStatus.SHORTLISTED,
  );
  const mostRecentApplication = context.applications[0];
  const noRecentApplications =
    !mostRecentApplication ||
    mostRecentApplication.createdAt < daysAgo(APPLICATION_REMINDER_LOOKBACK_DAYS, now);

  if (
    context.preferences.weeklyDigests &&
    recommendations.length >= 3 &&
    (!context.state.lastDigestAt || context.state.lastDigestAt < daysAgo(DIGEST_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.WEEKLY_DIGEST,
      notificationType: NotificationType.WEEKLY_DIGEST,
      channel: "weeklyDigests",
      reasonCode: "weekly_digest_ready",
      title: "Your weekly trusted-job digest is ready",
      body: weeklyDigest.headline,
      metadata: {
        trustedJobCount: weeklyDigest.trustedJobCount,
        verifiedEmployerCount: weeklyDigest.verifiedEmployerCount,
        jobIds: weeklyDigest.jobs.map((job) => job.id),
      },
      email: {
        topJobs: weeklyDigest.jobs,
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.interviewPrepRecommendations &&
    activeApplications.length > 0 &&
    (!context.state.lastInterviewPrepAt || context.state.lastInterviewPrepAt < daysAgo(INTERVIEW_PREP_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.INTERVIEW_PREP,
      notificationType: NotificationType.INTERVIEW_PREP,
      channel: "interviewPrepRecommendations",
      reasonCode: "active_application_interview_prep",
      title: "Interview prep is worth doing now",
      body: `You have ${activeApplications.length} live application${activeApplications.length === 1 ? "" : "s"} in motion. Practice before the next recruiter reply.`,
      metadata: {
        applicationIds: activeApplications.map((application) => application.id),
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.visaRelocationAlerts &&
    recommendations.some((job) => job.discovery.visaClear || job.discovery.relocationClear) &&
    (!context.state.lastVisaAlertAt || context.state.lastVisaAlertAt < daysAgo(VISA_ALERT_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.VISA_RELOCATION_MATCH,
      notificationType: NotificationType.JOB_MATCH,
      channel: "visaRelocationAlerts",
      reasonCode: "visa_relocation_match",
      title: "Fresh visa or relocation-friendly roles match your goals",
      body: `${recommendations.filter((job) => job.discovery.visaClear || job.discovery.relocationClear).length} roles explicitly mention visa support or relocation clarity.`,
      metadata: {
        jobIds: recommendations
          .filter((job) => job.discovery.visaClear || job.discovery.relocationClear)
          .slice(0, 5)
          .map((job) => job.id),
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.applicationReminders &&
    noRecentApplications &&
    recommendations.length >= 3 &&
    (!context.state.lastApplicationReminderAt ||
      context.state.lastApplicationReminderAt < daysAgo(APPLICATION_REMINDER_LOOKBACK_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.APPLICATION_REMINDER,
      notificationType: NotificationType.RETENTION_NUDGE,
      channel: "applicationReminders",
      reasonCode: "application_momentum_low",
      title: "Keep your job-search momentum going",
      body: `You have ${recommendations.length} fresh high-signal matches waiting, including ${recommendations[0]?.title || "roles aligned to your profile"}.`,
      metadata: {
        topJobId: recommendations[0]?.id ?? null,
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.profileCompletionNudges &&
    (context.profile?.profileCompleteness ?? 0) < 85 &&
    (!context.state.lastProfileNudgeAt || context.state.lastProfileNudgeAt < daysAgo(PROFILE_NUDGE_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.PROFILE_COMPLETION,
      notificationType: NotificationType.RETENTION_NUDGE,
      channel: "profileCompletionNudges",
      reasonCode: "profile_incomplete",
      title: "A stronger profile will improve shortlist quality",
      body: `Your profile is ${context.profile?.profileCompleteness ?? 0}% complete. Add the missing proof points employers trust most.`,
      metadata: {
        profileCompleteness: context.profile?.profileCompleteness ?? 0,
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.verificationCompletionNudges &&
    (context.trustProfile?.verificationLevel ?? CandidateVerificationLevel.UNVERIFIED) !== CandidateVerificationLevel.SKILLS_VERIFIED &&
    (context.trustProfile?.verificationLevel ?? CandidateVerificationLevel.UNVERIFIED) !== CandidateVerificationLevel.EMPLOYMENT_HISTORY_PARTIALLY_VERIFIED &&
    (!context.state.lastVerificationNudgeAt ||
      context.state.lastVerificationNudgeAt < daysAgo(VERIFICATION_NUDGE_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.VERIFICATION_COMPLETION,
      notificationType: NotificationType.VERIFICATION,
      channel: "verificationCompletionNudges",
      reasonCode: "verification_gap",
      title: "Complete verification to stand out with premium employers",
      body: "Phone, identity, and skills evidence make your profile more trustworthy and easier to filter into shortlists.",
      metadata: {
        verificationLevel: context.trustProfile?.verificationLevel ?? CandidateVerificationLevel.UNVERIFIED,
      },
    });
    sent += delivered ? 1 : 0;
  }

  if (
    context.preferences.salaryInsights &&
    salaryInsight &&
    !salaryInsight.hasSubmittedSalarySignal &&
    (!context.state.lastSalaryInsightAt || context.state.lastSalaryInsightAt < daysAgo(SALARY_INSIGHT_COOLDOWN_DAYS, now))
  ) {
    const delivered = await dispatchLifecycleEvent({
      context,
      now,
      triggerType: CandidateLifecycleTriggerType.SALARY_INSIGHT,
      notificationType: NotificationType.SALARY_INSIGHT,
      channel: "salaryInsights",
      reasonCode: "salary_market_signal",
      title: `Salary insight: ${salaryInsight.role} roles are clustering around ${salaryInsight.median.toLocaleString()} ${salaryInsight.currency}`,
      body: `${salaryInsight.sampleCount} verified salary reports can help you decide which applications are worth your time.`,
      metadata: {
        role: salaryInsight.role,
        country: salaryInsight.country,
        median: salaryInsight.median,
        currency: salaryInsight.currency,
      },
    });
    sent += delivered ? 1 : 0;
  }

  return sent;
}

export async function runCandidateRetentionCycle(now = new Date()): Promise<number> {
  const candidates = await prisma.user.findMany({
    where: {
      role: Role.CANDIDATE,
      accountRestrictionStatus: "ACTIVE",
      candidateProfile: {
        is: {
          openToWork: true,
        },
      },
    },
    select: { id: true },
    take: 250,
  });

  let totalSent = 0;
  for (const candidate of candidates) {
    totalSent += await runCandidateRetentionForUser(candidate.id, now);
  }

  return totalSent;
}
