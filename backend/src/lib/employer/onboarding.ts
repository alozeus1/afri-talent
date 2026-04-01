import { EmployerVerificationLevel, JobStatus, SubscriptionPlan } from "@prisma/client";

export const EMPLOYER_ONBOARDING_STEPS = [
  "company_setup",
  "verification",
  "team_setup",
  "first_job_post",
  "candidate_filters",
  "subscription_choice",
  "trust_completion",
] as const;

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

export function normalizeEmployerCandidateFilters(
  value: unknown,
): EmployerCandidateFilters {
  const candidateFilters = (value && typeof value === "object") ? (value as Record<string, unknown>) : {};
  return {
    skills: Array.isArray(candidateFilters.skills)
      ? candidateFilters.skills.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    location: typeof candidateFilters.location === "string" && candidateFilters.location.trim().length > 0
      ? candidateFilters.location.trim()
      : null,
    minExperience: typeof candidateFilters.minExperience === "number" ? candidateFilters.minExperience : null,
    verifiedOnly: Boolean(candidateFilters.verifiedOnly),
    visaPreference: candidateFilters.visaPreference === "SPONSORED_ONLY" ? "SPONSORED_ONLY" : "ANY",
  };
}

export function hasCandidateFilters(filters: EmployerCandidateFilters): boolean {
  return Boolean(
    filters.skills.length > 0 ||
    filters.location ||
    filters.minExperience !== null ||
    filters.verifiedOnly ||
    filters.visaPreference === "SPONSORED_ONLY",
  );
}

export function buildEmployerOnboardingChecklist(
  input: EmployerOnboardingChecklistInput,
): EmployerOnboardingChecklistItem[] {
  return [
    {
      key: "company_setup",
      label: "Complete company setup",
      description: "Add your company story, website, and hiring location so candidates trust the brand behind the role.",
      done: input.companySetupDone,
      href: "/employer/onboarding",
    },
    {
      key: "verification",
      label: "Verify your employer identity",
      description: "Finish domain and company verification so your jobs publish faster and carry stronger trust signals.",
      done: input.verificationDone,
      href: "/employer/trust",
    },
    {
      key: "team_setup",
      label: "Add a hiring teammate",
      description: "Capture at least one collaborator email so the hiring motion does not depend on a single inbox.",
      done: input.teamSetupDone,
      href: "/employer/onboarding",
    },
    {
      key: "first_job_post",
      label: "Publish your first approved job",
      description: "Launch a complete, credible role with compensation and location clarity.",
      done: input.firstJobPostDone,
      href: "/employer/jobs/new",
    },
    {
      key: "candidate_filters",
      label: "Save candidate filters",
      description: "Define skill, location, and verification filters so the first shortlist is faster and more relevant.",
      done: input.candidateFiltersDone,
      href: "/employer/onboarding",
    },
    {
      key: "subscription_choice",
      label: "Choose your hiring plan",
      description: "Pick the right plan for search depth, analytics, and premium candidate filters.",
      done: input.subscriptionChoiceDone,
      href: "/billing",
    },
    {
      key: "trust_completion",
      label: "Complete trust checklist",
      description: "Resolve the remaining trust steps that lift apply quality and reduce moderation friction.",
      done: input.trustCompletionDone,
      href: "/employer/trust",
    },
  ];
}

export function completionPercentage(checklist: EmployerOnboardingChecklistItem[]): number {
  if (checklist.length === 0) return 0;
  return Math.round((checklist.filter((item) => item.done).length / checklist.length) * 100);
}

export function nextEmployerAction(
  checklist: EmployerOnboardingChecklistItem[],
): { key: EmployerOnboardingStep; title: string; body: string; href: string; ctaLabel: string } {
  const nextIncomplete = checklist.find((item) => !item.done);
  if (!nextIncomplete) {
    return {
      key: "trust_completion",
      title: "Start reviewing candidates",
      body: "Your onboarding essentials are in place. Focus on candidate quality, shortlisting speed, and plan ROI next.",
      href: "/employer/analytics",
      ctaLabel: "Open analytics",
    };
  }

  return {
    key: nextIncomplete.key,
    title: nextIncomplete.label,
    body: nextIncomplete.description,
    href: nextIncomplete.href,
    ctaLabel: nextIncomplete.key === "first_job_post" ? "Create job" : "Continue",
  };
}

export function verificationIsStrong(level: EmployerVerificationLevel): boolean {
  switch (level) {
    case EmployerVerificationLevel.BUSINESS_DOC_VERIFIED:
    case EmployerVerificationLevel.MANUAL_REVIEW_APPROVED:
    case EmployerVerificationLevel.PREMIUM_TRUSTED:
      return true;
    default:
      return false;
  }
}

export function verificationImpactSummary(input: {
  verificationLevel: EmployerVerificationLevel;
  qualifiedApplicants: number;
  totalApplications: number;
}) {
  const qualifiedRate = input.totalApplications > 0
    ? Number(((input.qualifiedApplicants / input.totalApplications) * 100).toFixed(2))
    : 0;
  const verified = verificationIsStrong(input.verificationLevel);

  return {
    verified,
    qualifiedApplicantRate: qualifiedRate,
    insight: verified
      ? `Verified employer trust is active. ${qualifiedRate}% of applications are currently reaching shortlist-level quality.`
      : `You are still below the strongest trust tier. Complete verification to improve credibility before you scale spend or posting volume.`,
  };
}

export function employerUpgradeJourney(input: {
  plan: SubscriptionPlan;
  publishedJobs: number;
  qualifiedApplicants: number;
  candidateFiltersDone: boolean;
}) {
  if (input.plan === SubscriptionPlan.EMPLOYER_PREMIUM) {
    return {
      targetPlan: null,
      headline: "Premium hiring signals unlocked",
      body: "Use advanced analytics and verified-candidate filters to shorten time-to-shortlist.",
      ctaLabel: "Review plan value",
    };
  }

  if (input.plan === SubscriptionPlan.EMPLOYER_BASIC) {
    return {
      targetPlan: SubscriptionPlan.EMPLOYER_PREMIUM,
      headline: "Premium can tighten shortlist quality",
      body: input.qualifiedApplicants === 0
        ? "Upgrade when you need verified-candidate filters and deeper funnel visibility to improve shortlist quality."
        : "You already have inbound interest. Premium adds verified-candidate filters and deeper ROI analytics for faster shortlist decisions.",
      ctaLabel: "Compare premium",
    };
  }

  return {
    targetPlan: SubscriptionPlan.EMPLOYER_BASIC,
    headline: "Upgrade when you’re ready to scale beyond the first shortlist",
    body: input.publishedJobs === 0
      ? "Start free, publish your first job, then upgrade for talent search and analytics once candidate flow begins."
      : input.candidateFiltersDone
        ? "Basic unlocks talent search and analytics once your first job is live."
        : "Basic is most useful after you’ve defined candidate filters and want stronger hiring visibility.",
    ctaLabel: "View upgrade path",
  };
}

export function milestoneStatus(milestones: EmployerMilestones) {
  if (milestones.firstQualifiedShortlistAt) {
    return {
      label: "First qualified shortlist reached",
      state: "activated" as const,
    };
  }
  if (milestones.firstCandidateViewAt) {
    return {
      label: "Candidate review has started",
      state: "in_progress" as const,
    };
  }
  if (milestones.firstApprovedJobAt) {
    return {
      label: "First approved job is live",
      state: "in_progress" as const,
    };
  }
  return {
    label: "Working toward first approved job",
    state: "not_started" as const,
  };
}

export function qualifiedApplicantsCount(statuses: Array<{ status: string }>): number {
  return statuses.filter((item) => item.status === "SHORTLISTED" || item.status === "ACCEPTED").length;
}

export function timeToFirstQualifiedApplicantHours(input: {
  firstApprovedJobAt: Date | null;
  firstQualifiedShortlistAt: Date | null;
}): number | null {
  if (!input.firstApprovedJobAt || !input.firstQualifiedShortlistAt) {
    return null;
  }

  return Number(
    ((input.firstQualifiedShortlistAt.getTime() - input.firstApprovedJobAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
  );
}

export function isPlanSelectionDone(plan: SubscriptionPlan | null | undefined, selectedPlan: SubscriptionPlan | null | undefined): boolean {
  return Boolean(
    selectedPlan ||
    (plan && plan !== SubscriptionPlan.FREE && plan !== SubscriptionPlan.EMPLOYER_FREE),
  );
}

export function isJobApproved(status: JobStatus): boolean {
  return status === JobStatus.PUBLISHED;
}
