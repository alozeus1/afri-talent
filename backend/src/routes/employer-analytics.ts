import { Router, Request, Response } from "express";
import { Prisma, EmployerVerificationLevel, JobStatus, Role, SubscriptionPlan } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";
import {
  EMPLOYER_ONBOARDING_STEPS,
  buildEmployerOnboardingChecklist,
  completionPercentage,
  employerUpgradeJourney,
  hasCandidateFilters,
  isJobApproved,
  isPlanSelectionDone,
  milestoneStatus,
  nextEmployerAction,
  normalizeEmployerCandidateFilters,
  qualifiedApplicantsCount,
  timeToFirstQualifiedApplicantHours,
  verificationImpactSummary,
  verificationIsStrong,
} from "../lib/employer/onboarding.js";
import { evaluateJobQuality } from "../lib/jobs/discovery.js";
import { assessJobPostingRisk } from "../lib/trust/risk.js";
import {
  employerTrustSummary,
  refreshEmployerTrustProfile,
} from "../lib/trust/service.js";

const router = Router();

const updateBrandingSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  website: z.string().url().max(500).optional().or(z.literal("")),
  location: z.string().max(200).optional(),
  bio: z.string().max(5000).optional().or(z.literal("")),
});

const employerPlanSchema = z.enum([
  "EMPLOYER_FREE",
  "EMPLOYER_BASIC",
  "EMPLOYER_PREMIUM",
]);

const candidateFiltersSchema = z.object({
  skills: z.array(z.string().min(1).max(80)).max(12).default([]),
  location: z.string().max(120).optional().nullable(),
  minExperience: z.number().int().min(0).max(40).optional().nullable(),
  verifiedOnly: z.boolean().default(false),
  visaPreference: z.enum(["ANY", "SPONSORED_ONLY"]).default("ANY"),
});

const onboardingUpdateSchema = z.object({
  currentStep: z.enum(EMPLOYER_ONBOARDING_STEPS).optional(),
  selectedPlan: employerPlanSchema.optional().nullable(),
  teamMemberEmails: z.array(z.string().email().max(255)).max(10).optional(),
  candidateFilters: candidateFiltersSchema.optional(),
  companyName: z.string().min(1).max(200).optional(),
  website: z.string().url().max(500).optional().or(z.literal("")),
  location: z.string().max(200).optional(),
  bio: z.string().max(5000).optional().or(z.literal("")),
});

const jobPreviewSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  location: z.string().min(2),
  type: z.string().min(2),
  seniority: z.string().min(2),
  salaryMin: z.number().int().optional().nullable(),
  salaryMax: z.number().int().optional().nullable(),
  currency: z.string().max(3).optional().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(15).default([]),
});

async function getEmployerOr404(res: Response, userId: string) {
  const employer = await prisma.employer.findUnique({
    where: { userId },
    include: {
      onboardingState: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!employer) {
    res.status(404).json({ error: "Employer profile not found" });
    return null;
  }

  return employer;
}

function normalizeStatusCounts(groups: Array<{ status: string; _count: { id: number } }>): Record<string, number> {
  return groups.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count.id;
    return acc;
  }, {});
}

function analyticsPropertyString(value: Prisma.JsonValue | null | undefined, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = (value as Record<string, Prisma.JsonValue | undefined>)[key];
  return typeof raw === "string" ? raw : null;
}

async function buildEmployerActivationData(userId: string, employerId: string) {
  const [trustProfile, subscription, jobs, applications, candidateViewEvent, recentApplications, statusGroups] =
    await Promise.all([
      refreshEmployerTrustProfile(employerId),
      prisma.subscription.findUnique({
        where: { userId },
        select: { plan: true, status: true },
      }).catch(() => null),
      prisma.job.findMany({
        where: { employerId },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          qualityScore: true,
          salaryMin: true,
          salaryMax: true,
          currency: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.application.findMany({
        where: { job: { employerId } },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          jobId: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.analyticsEvent.findFirst({
        where: {
          userId,
          eventName: {
            in: [
              "employer_candidate_list_viewed",
              "employer_talent_results_loaded",
              "employer_candidate_filters_saved",
            ],
          },
        },
        orderBy: { occurredAt: "asc" },
      }),
      prisma.application.findMany({
        where: { job: { employerId } },
        include: {
          candidate: { select: { id: true, name: true, email: true } },
          job: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.application.groupBy({
        by: ["status"],
        where: { job: { employerId } },
        _count: { id: true },
      }),
    ]);

  const publishedJobs = jobs.filter((job) => isJobApproved(job.status));
  const firstApprovedJobAt = publishedJobs[0]?.publishedAt ?? null;
  const shortlistedApplications = applications.filter(
    (item) => item.status === "SHORTLISTED" || item.status === "ACCEPTED",
  );
  const firstQualifiedShortlistAt = shortlistedApplications[0]?.updatedAt ?? shortlistedApplications[0]?.createdAt ?? null;
  const qualifiedApplicants = qualifiedApplicantsCount(applications);
  const trust = employerTrustSummary(trustProfile);

  return {
    trustProfile,
    trust,
    subscription,
    jobs,
    publishedJobs,
    applications,
    qualifiedApplicants,
    recentApplications,
    applicationsByStatus: normalizeStatusCounts(statusGroups),
    milestones: {
      firstApprovedJobAt: firstApprovedJobAt?.toISOString() ?? null,
      firstCandidateViewAt: candidateViewEvent?.occurredAt.toISOString() ?? null,
      firstQualifiedShortlistAt: firstQualifiedShortlistAt?.toISOString() ?? null,
    },
    milestoneState: milestoneStatus({
      firstApprovedJobAt: firstApprovedJobAt?.toISOString() ?? null,
      firstCandidateViewAt: candidateViewEvent?.occurredAt.toISOString() ?? null,
      firstQualifiedShortlistAt: firstQualifiedShortlistAt?.toISOString() ?? null,
    }),
    firstApprovedJobAt,
    firstQualifiedShortlistAt,
    timeToFirstQualifiedApplicantHours: timeToFirstQualifiedApplicantHours({
      firstApprovedJobAt,
      firstQualifiedShortlistAt,
    }),
  };
}

// GET /api/employer/analytics - Dashboard analytics
router.get("/analytics", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await getEmployerOr404(res, req.user!.userId);
    if (!employer) return;

    const activation = await buildEmployerActivationData(req.user!.userId, employer.id);

    res.json({
      totalJobs: activation.jobs.length,
      publishedJobs: activation.publishedJobs.length,
      totalApplications: activation.applications.length,
      qualifiedApplicants: activation.qualifiedApplicants,
      shortlistRate:
        activation.applications.length > 0
          ? Number(((activation.qualifiedApplicants / activation.applications.length) * 100).toFixed(2))
          : 0,
      applicationsByStatus: activation.applicationsByStatus,
      recentApplications: activation.recentApplications,
      activationMilestones: activation.milestones,
      activationState: activation.milestoneState,
      timeToFirstQualifiedApplicantHours: activation.timeToFirstQualifiedApplicantHours,
      verificationImpact: verificationImpactSummary({
        verificationLevel: activation.trust.verificationLevel,
        qualifiedApplicants: activation.qualifiedApplicants,
        totalApplications: activation.applications.length,
      }),
      viewsByDay: [],
    });
  } catch (error) {
    logger.error({ error }, "Employer analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employer/branding - Get employer branding profile
router.get("/branding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    res.json(employer);
  } catch (error) {
    logger.error({ error }, "Get branding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/employer/branding - Update employer branding
router.put("/branding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const data = updateBrandingSchema.parse(req.body);

    const website = data.website || null;
    const bio = data.bio || null;

    const employer = await prisma.employer.update({
      where: { userId: req.user!.userId },
      data: {
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.location !== undefined && { location: data.location }),
        website,
        bio,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    res.json(employer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Update branding error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employer/onboarding - onboarding checklist and activation progress
router.get("/onboarding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await getEmployerOr404(res, req.user!.userId);
    if (!employer) return;

    const activation = await buildEmployerActivationData(req.user!.userId, employer.id);
    const candidateFilters = normalizeEmployerCandidateFilters(employer.onboardingState?.candidateFilters);
    const checklist = buildEmployerOnboardingChecklist({
      companySetupDone: Boolean(employer.companyName && employer.location && employer.website && employer.bio),
      verificationDone: activation.trust.postingEligibility,
      teamSetupDone: (employer.onboardingState?.teamMemberEmails?.length ?? 0) > 0,
      firstJobPostDone: activation.publishedJobs.length > 0,
      candidateFiltersDone: hasCandidateFilters(candidateFilters),
      subscriptionChoiceDone: isPlanSelectionDone(
        activation.subscription?.plan ?? SubscriptionPlan.EMPLOYER_FREE,
        employer.onboardingState?.selectedPlan ?? null,
      ),
      trustCompletionDone:
        activation.trust.checklist.every((item) => item.done) ||
        verificationIsStrong(activation.trust.verificationLevel),
    });
    const completionPct = completionPercentage(checklist);
    const nextAction = nextEmployerAction(checklist);

    res.json({
      currentStep: employer.onboardingState?.currentStep ?? EMPLOYER_ONBOARDING_STEPS[0],
      checklist,
      completionPct,
      stats: {
        jobCount: activation.jobs.length,
        publishedJobs: activation.publishedJobs.length,
        totalApplications: activation.applications.length,
        qualifiedApplicants: activation.qualifiedApplicants,
      },
      milestones: activation.milestones,
      activationState: activation.milestoneState,
      candidateFilters,
      teamMemberEmails: employer.onboardingState?.teamMemberEmails ?? [],
      selectedPlan: employer.onboardingState?.selectedPlan ?? activation.subscription?.plan ?? SubscriptionPlan.EMPLOYER_FREE,
      trust: activation.trust,
      company: {
        companyName: employer.companyName,
        website: employer.website,
        location: employer.location,
        bio: employer.bio,
        email: employer.user.email,
      },
      nextAction,
      recommendation:
        activation.milestones.firstQualifiedShortlistAt
          ? "Your first qualified shortlist is live. Focus next on shortlist speed, conversion quality, and ROI."
          : nextAction.body,
      upgradeJourney: employerUpgradeJourney({
        plan: activation.subscription?.plan ?? SubscriptionPlan.EMPLOYER_FREE,
        publishedJobs: activation.publishedJobs.length,
        qualifiedApplicants: activation.qualifiedApplicants,
        candidateFiltersDone: hasCandidateFilters(candidateFilters),
      }),
    });
  } catch (error) {
    logger.error({ error }, "Employer onboarding status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/employer/onboarding - persist onboarding wizard state
router.put("/onboarding", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await getEmployerOr404(res, req.user!.userId);
    if (!employer) return;

    const data = onboardingUpdateSchema.parse(req.body);

    const website = data.website === "" ? null : data.website;
    const bio = data.bio === "" ? null : data.bio;

    const onboardingState = await prisma.$transaction(async (tx) => {
      if (
        data.companyName !== undefined ||
        data.website !== undefined ||
        data.location !== undefined ||
        data.bio !== undefined
      ) {
        await tx.employer.update({
          where: { id: employer.id },
          data: {
            ...(data.companyName !== undefined && { companyName: data.companyName }),
            ...(data.location !== undefined && { location: data.location }),
            ...(data.website !== undefined && { website }),
            ...(data.bio !== undefined && { bio }),
          },
        });
      }

      return tx.employerOnboardingState.upsert({
        where: { employerId: employer.id },
        create: {
          employerId: employer.id,
          currentStep: data.currentStep ?? EMPLOYER_ONBOARDING_STEPS[0],
          teamMemberEmails: data.teamMemberEmails ?? [],
          candidateFilters: (data.candidateFilters ?? undefined) as Prisma.InputJsonValue | undefined,
          selectedPlan: (data.selectedPlan as SubscriptionPlan | null | undefined) ?? null,
        },
        update: {
          ...(data.currentStep !== undefined && { currentStep: data.currentStep }),
          ...(data.teamMemberEmails !== undefined && { teamMemberEmails: data.teamMemberEmails }),
          ...(data.candidateFilters !== undefined && {
            candidateFilters: data.candidateFilters as Prisma.InputJsonValue,
          }),
          ...(data.selectedPlan !== undefined && {
            selectedPlan: (data.selectedPlan as SubscriptionPlan | null | undefined) ?? null,
          }),
        },
      });
    });

    res.json({
      message: "Employer onboarding state updated.",
      onboardingState: {
        currentStep: onboardingState.currentStep,
        teamMemberEmails: onboardingState.teamMemberEmails,
        candidateFilters: normalizeEmployerCandidateFilters(onboardingState.candidateFilters),
        selectedPlan: onboardingState.selectedPlan,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Employer onboarding update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/employer/onboarding/job-preview - preview trust and quality before publish
router.post("/onboarding/job-preview", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await getEmployerOr404(res, req.user!.userId);
    if (!employer) return;

    const data = jobPreviewSchema.parse(req.body);
    const trustProfile = await refreshEmployerTrustProfile(employer.id);
    const risk = assessJobPostingRisk({
      title: data.title,
      description: data.description,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      employerRiskScore: trustProfile.riskScore,
    });

    const quality = evaluateJobQuality({
      title: data.title,
      description: data.description,
      location: data.location,
      type: data.type,
      seniority: data.seniority,
      tags: data.tags,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      currency: data.currency ?? null,
      publishedAt: new Date(),
      riskScore: risk.score,
      riskLevel: risk.level,
      employer: {
        companyName: employer.companyName,
        trustProfile,
      },
    });

    const strengths: string[] = [];
    const tips: string[] = [];

    if (quality.signals.descriptionComplete) strengths.push("Job scope is detailed enough to build candidate confidence.");
    else tips.push("Add responsibilities, outcomes, and requirements so candidates can self-qualify faster.");

    if (quality.signals.compensationTransparent) strengths.push("Compensation transparency improves credibility and apply quality.");
    else tips.push("Add a salary range to increase trust and reduce low-fit applications.");

    if (quality.signals.locationClear) strengths.push("Location is clear for cross-border candidates.");
    else tips.push("Clarify remote, hybrid, or onsite expectations and include country or timezone detail.");

    if (quality.signals.mobilityClear) strengths.push("Visa or relocation expectations are clear.");
    else tips.push("Clarify visa sponsorship, relocation support, or eligible hiring countries.");

    if (quality.signals.verifiedEmployer) strengths.push("Employer verification is helping job credibility.");
    else tips.push("Complete employer verification to reduce moderation friction and improve trust.");

    const moderationRequired =
      trustProfile.requiresEnhancedVerification ||
      risk.autoHold ||
      risk.level === "HIGH" ||
      risk.level === "CRITICAL";

    res.json({
      qualityScore: quality.score,
      qualityLabel: quality.label,
      moderationRiskLevel: risk.level,
      moderationRequired,
      guidance:
        moderationRequired
          ? "This draft is likely to trigger moderation review before publish."
          : "This draft is credible enough to publish quickly if your employer trust checks are complete.",
      flags: risk.flags,
      strengths,
      tips,
      checklist: [
        { key: "description", label: "Detailed job description", done: quality.signals.descriptionComplete },
        { key: "salary", label: "Compensation transparency", done: quality.signals.compensationTransparent },
        { key: "location", label: "Location clarity", done: quality.signals.locationClear },
        { key: "mobility", label: "Visa or relocation clarity", done: quality.signals.mobilityClear },
        { key: "trust", label: "Employer verification strength", done: quality.signals.verifiedEmployer },
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Employer job preview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employer/analytics/advanced - conversion funnel + posting performance + pipeline metrics
router.get("/analytics/advanced", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await getEmployerOr404(res, req.user!.userId);
    if (!employer) return;

    const activation = await buildEmployerActivationData(req.user!.userId, employer.id);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const jobIds = activation.jobs.map((job) => job.id);

    const analyticsEvents = await prisma.analyticsEvent.findMany({
      where: {
        eventName: {
          in: ["job_impression", "job_search_result_clicked"],
        },
        occurredAt: { gte: ninetyDaysAgo },
      },
      select: {
        eventName: true,
        properties: true,
      },
    });

    const impressionCounts = new Map<string, number>();
    const clickCounts = new Map<string, number>();

    for (const event of analyticsEvents) {
      const jobId = analyticsPropertyString(event.properties, "job_id");
      if (!jobId || !jobIds.includes(jobId)) {
        continue;
      }

      if (event.eventName === "job_impression") {
        impressionCounts.set(jobId, (impressionCounts.get(jobId) ?? 0) + 1);
      }

      if (event.eventName === "job_search_result_clicked") {
        clickCounts.set(jobId, (clickCounts.get(jobId) ?? 0) + 1);
      }
    }

    const applicationsByJob = new Map<string, typeof activation.applications>();
    for (const app of activation.applications) {
      const list = applicationsByJob.get(app.jobId) || [];
      list.push(app);
      applicationsByJob.set(app.jobId, list);
    }

    const postingPerformance = activation.jobs.map((job) => {
      const jobApplications = applicationsByJob.get(job.id) || [];
      const sortedByCreated = [...jobApplications].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const firstApplicationAt = sortedByCreated[0]?.createdAt || null;
      const timeToFirstApplicationHours =
        firstApplicationAt && job.publishedAt
          ? Number(
              ((firstApplicationAt.getTime() - job.publishedAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
            )
          : null;

      const qualifiedApplicants = qualifiedApplicantsCount(jobApplications);
      const impressionCount = impressionCounts.get(job.id) ?? 0;
      const clickCount = clickCounts.get(job.id) ?? 0;

      return {
        jobId: job.id,
        title: job.title,
        status: job.status,
        applicationCount: jobApplications.length,
        qualifiedApplicants,
        shortlistRate:
          jobApplications.length > 0
            ? Number(((qualifiedApplicants / jobApplications.length) * 100).toFixed(2))
            : 0,
        acceptanceRate:
          jobApplications.length > 0
            ? Number(
                (((jobApplications.filter((item) => item.status === "ACCEPTED").length) / jobApplications.length) * 100).toFixed(2),
              )
            : 0,
        impressions: impressionCount,
        clicks: clickCount,
        ctr:
          impressionCount > 0
            ? Number(((clickCount / impressionCount) * 100).toFixed(2))
            : 0,
        qualityScore: job.qualityScore,
        timeToFirstApplicationHours,
      };
    });

    const inReview = activation.applications.filter((item) => item.status === "REVIEWING").length;
    const shortlisted = activation.applications.filter((item) => item.status === "SHORTLISTED").length;
    const accepted = activation.applications.filter((item) => item.status === "ACCEPTED").length;
    const rejected = activation.applications.filter((item) => item.status === "REJECTED").length;

    const reviewedDurationsHours = activation.applications
      .filter((item) => item.status !== "PENDING")
      .map((item) => (item.updatedAt.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60))
      .filter((hours) => Number.isFinite(hours) && hours >= 0);

    const avgReviewTimeHours =
      reviewedDurationsHours.length > 0
        ? Number(
            (reviewedDurationsHours.reduce((sum, value) => sum + value, 0) / reviewedDurationsHours.length).toFixed(2),
          )
        : null;

    const totalImpressions = postingPerformance.reduce((sum, item) => sum + item.impressions, 0);
    const totalClicks = postingPerformance.reduce((sum, item) => sum + item.clicks, 0);
    const averageJobQuality =
      postingPerformance.length > 0
        ? Number((postingPerformance.reduce((sum, item) => sum + item.qualityScore, 0) / postingPerformance.length).toFixed(2))
        : 0;

    res.json({
      funnel: [
        { step: "jobs_posted", count: activation.jobs.length },
        { step: "jobs_published", count: activation.publishedJobs.length },
        { step: "job_clicks", count: totalClicks },
        { step: "applications_received", count: activation.applications.length },
        { step: "qualified_applicants", count: activation.qualifiedApplicants },
        { step: "candidates_hired", count: accepted },
      ].map((row, index, arr) => ({
        ...row,
        conversionFromPrevious:
          index === 0 || arr[index - 1].count === 0
            ? null
            : Number(((row.count / arr[index - 1].count) * 100).toFixed(2)),
      })),
      postingPerformance,
      candidatePipeline: {
        total: activation.applications.length,
        pending: activation.applications.filter((item) => item.status === "PENDING").length,
        reviewing: inReview,
        shortlisted,
        accepted,
        rejected,
        avgReviewTimeHours,
      },
      roi: {
        impressions: totalImpressions,
        clicks: totalClicks,
        applies: activation.applications.length,
        qualifiedApplicants: activation.qualifiedApplicants,
        shortlistRate:
          activation.applications.length > 0
            ? Number(((activation.qualifiedApplicants / activation.applications.length) * 100).toFixed(2))
            : 0,
        clickToApplyRate:
          totalClicks > 0
            ? Number(((activation.applications.length / totalClicks) * 100).toFixed(2))
            : 0,
        timeToFirstQualifiedApplicantHours: activation.timeToFirstQualifiedApplicantHours,
        averageJobQuality,
        verificationImpact: verificationImpactSummary({
          verificationLevel: activation.trust.verificationLevel,
          qualifiedApplicants: activation.qualifiedApplicants,
          totalApplications: activation.applications.length,
        }),
        upgradeJourney: employerUpgradeJourney({
          plan: activation.subscription?.plan ?? SubscriptionPlan.EMPLOYER_FREE,
          publishedJobs: activation.publishedJobs.length,
          qualifiedApplicants: activation.qualifiedApplicants,
          candidateFiltersDone: hasCandidateFilters(normalizeEmployerCandidateFilters(employer.onboardingState?.candidateFilters)),
        }),
      },
      activationMilestones: activation.milestones,
    });
  } catch (error) {
    logger.error({ error }, "Employer advanced analytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
