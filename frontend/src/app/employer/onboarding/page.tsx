"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  EmployerCandidateFilters,
  EmployerOnboarding,
  EmployerOnboardingStep,
  employerAnalytics,
} from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { EmployerActivationChecklist } from "@/components/employer/activation-checklist";
import { EmployerMilestones } from "@/components/employer/activation-milestones";
import { TrustBadge } from "@/components/trust/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const onboardingSteps: Array<{
  key: EmployerOnboardingStep;
  title: string;
  subtitle: string;
}> = [
  {
    key: "company_setup",
    title: "Company setup",
    subtitle: "Tell candidates who you are so the first application starts from trust, not doubt.",
  },
  {
    key: "verification",
    title: "Verification",
    subtitle: "Confirm the employer is real before you scale reach or spend.",
  },
  {
    key: "team_setup",
    title: "Team member setup",
    subtitle: "Avoid a single-threaded hiring process by adding at least one collaborator.",
  },
  {
    key: "first_job_post",
    title: "First job post",
    subtitle: "Launch a credible role with enough signal to pass moderation and attract fit candidates.",
  },
  {
    key: "candidate_filters",
    title: "Candidate filters",
    subtitle: "Define the shortlist you want before inbound volume starts growing.",
  },
  {
    key: "subscription_choice",
    title: "Subscription choice",
    subtitle: "Pick the plan that fits your search depth, analytics needs, and hiring speed.",
  },
  {
    key: "trust_completion",
    title: "Trust completion",
    subtitle: "Finish the last credibility steps that improve apply quality and moderation speed.",
  },
];

function parseEmailList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function stringifyEmailList(items: string[]) {
  return items.join("\n");
}

function filtersToSkillsInput(filters: EmployerCandidateFilters) {
  return filters.skills.join(", ");
}

function coerceEmployerPlan(plan: EmployerOnboarding["selectedPlan"]) {
  if (plan === "EMPLOYER_BASIC" || plan === "EMPLOYER_PREMIUM") {
    return plan;
  }

  return "EMPLOYER_FREE";
}

export default function EmployerOnboardingPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [onboarding, setOnboarding] = useState<EmployerOnboarding | null>(null);
  const [activeStep, setActiveStep] = useState<EmployerOnboardingStep>("company_setup");
  const [companyForm, setCompanyForm] = useState({
    companyName: "",
    website: "",
    location: "",
    bio: "",
  });
  const [teamMemberEmails, setTeamMemberEmails] = useState("");
  const [filterSkills, setFilterSkills] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterMinExperience, setFilterMinExperience] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [visaPreference, setVisaPreference] = useState<EmployerCandidateFilters["visaPreference"]>("ANY");
  const [selectedPlan, setSelectedPlan] = useState<"EMPLOYER_FREE" | "EMPLOYER_BASIC" | "EMPLOYER_PREMIUM">("EMPLOYER_FREE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeIndex = onboardingSteps.findIndex((step) => step.key === activeStep);

  const hydrateState = (data: EmployerOnboarding) => {
    setOnboarding(data);
    setActiveStep(data.currentStep);
    setCompanyForm({
      companyName: data.company.companyName || "",
      website: data.company.website || "",
      location: data.company.location || "",
      bio: data.company.bio || "",
    });
    setTeamMemberEmails(stringifyEmailList(data.teamMemberEmails));
    setFilterSkills(filtersToSkillsInput(data.candidateFilters));
    setFilterLocation(data.candidateFilters.location || "");
    setFilterMinExperience(data.candidateFilters.minExperience?.toString() || "");
    setVerifiedOnly(data.candidateFilters.verifiedOnly);
    setVisaPreference(data.candidateFilters.visaPreference);
    setSelectedPlan(coerceEmployerPlan(data.selectedPlan));
  };

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, locale, router, user]);

  useEffect(() => {
    if (user?.role !== "EMPLOYER") {
      return;
    }

    employerAnalytics
      .onboarding()
      .then((data) => {
        hydrateState(data);
        employerOnboardingEvents.onboardingViewed({
          step: data.currentStep,
          completion_pct: data.completionPct,
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load onboarding");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const candidateFilters = useMemo<EmployerCandidateFilters>(
    () => ({
      skills: filterSkills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12),
      location: filterLocation.trim() || null,
      minExperience: filterMinExperience ? parseInt(filterMinExperience, 10) : null,
      verifiedOnly,
      visaPreference,
    }),
    [filterLocation, filterMinExperience, filterSkills, verifiedOnly, visaPreference],
  );

  const saveProgress = async (nextStep?: EmployerOnboardingStep) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await employerAnalytics.updateOnboarding({
        currentStep: nextStep || activeStep,
        companyName: companyForm.companyName,
        website: companyForm.website,
        location: companyForm.location,
        bio: companyForm.bio,
        teamMemberEmails: parseEmailList(teamMemberEmails),
        candidateFilters,
        selectedPlan,
      });

      const refreshed = await employerAnalytics.onboarding();
      hydrateState({
        ...refreshed,
        currentStep: nextStep || activeStep,
      });
      setActiveStep(nextStep || activeStep);
      setSuccess("Progress saved.");

      employerOnboardingEvents.stepCompleted({
        step: activeStep,
        next_step: nextStep || activeStep,
        completion_pct: refreshed.completionPct,
      });

      if (activeStep === "candidate_filters") {
        employerOnboardingEvents.candidateFiltersSaved({
          skills_count: candidateFilters.skills.length,
          verified_only: candidateFilters.verifiedOnly,
          visa_preference: candidateFilters.visaPreference,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save onboarding");
    } finally {
      setSaving(false);
    }
  };

  const goToStep = (step: EmployerOnboardingStep) => {
    setActiveStep(step);
    setSuccess(null);
    employerOnboardingEvents.onboardingViewed({ step });
  };

  const goNext = async () => {
    const next = onboardingSteps[activeIndex + 1];
    if (!next) return;
    await saveProgress(next.key);
  };

  const currentStepMeta = onboardingSteps[activeIndex] || onboardingSteps[0];

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
          Guided employer onboarding
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Move from signup to first qualified shortlist
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
          This flow is designed around the first employer success moment: a credible job, a real candidate view, and a shortlist worth acting on.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : onboarding ? (
        <div className="space-y-8">
          <EmployerMilestones
            milestones={onboarding.milestones}
            activationState={onboarding.activationState}
          />

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <Card className="overflow-hidden border-slate-200">
                <CardHeader className="border-b border-gray-100 bg-gray-50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                        Current step
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                        {currentStepMeta.title}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm text-gray-600">
                        {currentStepMeta.subtitle}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <p className="font-semibold">{onboarding.completionPct}% complete</p>
                      <p className="mt-1 text-emerald-800">
                        {onboarding.stats.publishedJobs} published job{onboarding.stats.publishedJobs === 1 ? "" : "s"} • {onboarding.stats.qualifiedApplicants} qualified applicant{onboarding.stats.qualifiedApplicants === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-6 grid gap-2 md:grid-cols-3 xl:grid-cols-7">
                    {onboardingSteps.map((step, index) => (
                      <button
                        key={step.key}
                        type="button"
                        onClick={() => goToStep(step.key)}
                        className={`rounded-2xl border px-3 py-3 text-left transition ${
                          activeStep === step.key
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                        }`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Step {index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{step.title}</p>
                      </button>
                    ))}
                  </div>

                  {error && (
                    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {success}
                    </div>
                  )}

                  {activeStep === "company_setup" && (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          id="companyName"
                          label="Company name"
                          value={companyForm.companyName}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, companyName: event.target.value }))}
                          placeholder="AfriTalent Labs"
                        />
                        <Input
                          id="website"
                          label="Company website"
                          value={companyForm.website}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, website: event.target.value }))}
                          placeholder="https://company.com"
                        />
                      </div>
                      <Input
                        id="location"
                        label="Hiring location"
                        value={companyForm.location}
                        onChange={(event) => setCompanyForm((prev) => ({ ...prev, location: event.target.value }))}
                        placeholder="Lagos, Nigeria"
                      />
                      <div>
                        <label htmlFor="bio" className="mb-1 block text-sm font-medium text-gray-700">
                          Company story
                        </label>
                        <textarea
                          id="bio"
                          className="min-h-[180px] w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                          placeholder="What does your company do, who do you hire, and why should strong candidates trust this opportunity?"
                          value={companyForm.bio}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, bio: event.target.value }))}
                        />
                      </div>
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-950">
                        Strong company setup improves moderation speed and candidate confidence. The best early listings explain team mission, market, and what success looks like in the role.
                      </div>
                    </div>
                  )}

                  {activeStep === "verification" && (
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <TrustBadge
                          label={onboarding.trust.badge}
                          riskLevel={onboarding.trust.riskLevel}
                          variant="success"
                        />
                        {onboarding.trust.verifiedDomain && (
                          <TrustBadge label={`Verified domain: ${onboarding.trust.verifiedDomain}`} variant="info" />
                        )}
                        {onboarding.trust.requiresEnhancedVerification && (
                          <TrustBadge label="Enhanced verification required" riskLevel="MEDIUM" variant="warning" />
                        )}
                      </div>
                      <Card className="border-gray-200 bg-gray-50">
                        <CardContent className="p-5">
                          <p className="text-sm text-gray-700">
                            Verification determines whether jobs publish publicly, how fast moderation clears new listings, and how credible your brand looks to cross-border candidates.
                          </p>
                          <ul className="mt-4 space-y-2 text-sm text-gray-700">
                            {onboarding.trust.checklist.map((item) => (
                              <li key={item.key}>• {item.label}: {item.done ? "Complete" : "Pending"}</li>
                            ))}
                          </ul>
                          {onboarding.trust.warnings.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                              <p className="text-sm font-semibold text-amber-900">Attention before scale</p>
                              <ul className="mt-2 space-y-2 text-sm text-amber-800">
                                {onboarding.trust.warnings.map((warning) => (
                                  <li key={warning}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      <div className="flex flex-wrap gap-3">
                        <Link href={localizePath("/employer/trust", locale)}>
                          <Button>Open trust center</Button>
                        </Link>
                        <Link href={localizePath("/trust", locale)}>
                          <Button variant="outline">See what badges mean</Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  {activeStep === "team_setup" && (
                    <div className="space-y-5">
                      <div>
                        <label htmlFor="teamMemberEmails" className="mb-1 block text-sm font-medium text-gray-700">
                          Hiring teammate emails
                        </label>
                        <textarea
                          id="teamMemberEmails"
                          className="min-h-[180px] w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                          placeholder={"recruiter@company.com\nhiring-manager@company.com"}
                          value={teamMemberEmails}
                          onChange={(event) => setTeamMemberEmails(event.target.value)}
                        />
                        <p className="mt-2 text-sm text-gray-500">
                          Separate each email with a comma or a new line. This captures the hiring team setup even before invite workflows are fully automated.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">
                        Teams that add a reviewer early tend to move faster from first candidate view to first qualified shortlist because follow-up does not bottleneck on one person.
                      </div>
                    </div>
                  )}

                  {activeStep === "first_job_post" && (
                    <div className="space-y-5">
                      <div className="rounded-3xl bg-slate-950 px-5 py-5 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                          First success milestone
                        </p>
                        <h3 className="mt-2 text-xl font-semibold">Aim for the first approved job, not just the first draft</h3>
                        <p className="mt-3 text-sm text-slate-300">
                          Approved jobs create the fastest path to candidate trust, talent search visibility, and the first meaningful shortlist.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link href={localizePath("/employer/jobs/new", locale)}>
                            <Button>Create job with quality preview</Button>
                          </Link>
                          <Link href={localizePath("/employer/analytics", locale)}>
                            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white">
                              View shortlist metrics
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                          <p className="font-semibold text-emerald-900">What strong jobs include</p>
                          <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                            <li>• Clear role scope and outcomes</li>
                            <li>• Salary transparency where possible</li>
                            <li>• Specific location, remote, or visa guidance</li>
                            <li>• Real application path with low scam risk</li>
                          </ul>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                          <p className="font-semibold text-amber-900">What slows first shortlist</p>
                          <ul className="mt-3 space-y-2 text-sm text-amber-900">
                            <li>• Thin job descriptions</li>
                            <li>• No compensation guidance</li>
                            <li>• Vague location or hiring region</li>
                            <li>• Incomplete employer verification</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeStep === "candidate_filters" && (
                    <div className="space-y-5">
                      <Input
                        id="filterSkills"
                        label="Skills to prioritize"
                        value={filterSkills}
                        onChange={(event) => setFilterSkills(event.target.value)}
                        placeholder="React, TypeScript, Backend APIs"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          id="filterLocation"
                          label="Preferred location or timezone"
                          value={filterLocation}
                          onChange={(event) => setFilterLocation(event.target.value)}
                          placeholder="Remote within GMT+1 to GMT+3"
                        />
                        <Input
                          id="filterMinExperience"
                          label="Minimum years of experience"
                          type="number"
                          value={filterMinExperience}
                          onChange={(event) => setFilterMinExperience(event.target.value)}
                          placeholder="3"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900">
                          <input
                            type="checkbox"
                            className="mr-2"
                            checked={verifiedOnly}
                            onChange={(event) => setVerifiedOnly(event.target.checked)}
                          />
                          Only show verified candidates when premium filters are available
                        </label>
                        <div>
                          <label htmlFor="visaPreference" className="mb-1 block text-sm font-medium text-gray-700">
                            Visa or relocation preference
                          </label>
                          <select
                            id="visaPreference"
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                            value={visaPreference}
                            onChange={(event) => setVisaPreference(event.target.value as EmployerCandidateFilters["visaPreference"])}
                          >
                            <option value="ANY">Any candidate</option>
                            <option value="SPONSORED_ONLY">Only candidates needing sponsorship support</option>
                          </select>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">
                        Filters improve shortlist quality most when they are specific enough to reduce noise but not so narrow that they kill early discovery.
                      </div>
                    </div>
                  )}

                  {activeStep === "subscription_choice" && (
                    <div className="space-y-5">
                      <div className="grid gap-4 lg:grid-cols-3">
                        {[
                          {
                            plan: "EMPLOYER_FREE" as const,
                            title: "Free",
                            blurb: "Best for getting the first job live and learning where trust or quality friction exists.",
                            points: ["First credible posting", "Baseline trust workflow", "Start with employer verification"],
                          },
                          {
                            plan: "EMPLOYER_BASIC" as const,
                            title: "Basic",
                            blurb: "Adds better visibility once candidate flow starts and you want stronger signal on what converts.",
                            points: ["Talent search access", "Hiring analytics", "Faster shortlist insight"],
                          },
                          {
                            plan: "EMPLOYER_PREMIUM" as const,
                            title: "Premium",
                            blurb: "Best when you need verified-candidate filters and tighter ROI control across multiple roles.",
                            points: ["Verified-candidate filters", "Advanced funnel analytics", "Higher-confidence shortlist workflows"],
                          },
                        ].map((plan) => {
                          const selected = selectedPlan === plan.plan;
                          return (
                            <button
                              key={plan.plan}
                              type="button"
                              onClick={() => setSelectedPlan(plan.plan)}
                              className={`rounded-3xl border px-5 py-5 text-left transition ${
                                selected ? "border-emerald-300 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white hover:border-emerald-200"
                              }`}
                            >
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">{plan.title}</p>
                              <p className="mt-3 text-sm text-gray-700">{plan.blurb}</p>
                              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                                {plan.points.map((point) => (
                                  <li key={point}>• {point}</li>
                                ))}
                              </ul>
                            </button>
                          );
                        })}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-950 px-5 py-5 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Plan framing</p>
                        <h3 className="mt-2 text-lg font-semibold">{onboarding.upgradeJourney.headline}</h3>
                        <p className="mt-2 text-sm text-slate-300">{onboarding.upgradeJourney.body}</p>
                        <div className="mt-4">
                          <Link href={localizePath("/billing", locale)}>
                            <Button
                              size="sm"
                              onClick={() =>
                                employerOnboardingEvents.upgradeCtaClicked({
                                  current_plan: selectedPlan,
                                  target_plan: onboarding.upgradeJourney.targetPlan || "none",
                                  source: "employer_onboarding",
                                })
                              }
                            >
                              {onboarding.upgradeJourney.ctaLabel}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeStep === "trust_completion" && (
                    <div className="space-y-5">
                      <Card className="border-emerald-200 bg-emerald-50/70">
                        <CardContent className="p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <TrustBadge
                              label={onboarding.trust.badge}
                              riskLevel={onboarding.trust.riskLevel}
                              variant="success"
                            />
                            <TrustBadge
                              label={onboarding.trust.postingEligibility ? "Posting unlocked" : "Posting limited"}
                              variant={onboarding.trust.postingEligibility ? "success" : "warning"}
                            />
                          </div>
                          <p className="mt-3 text-sm text-gray-700">
                            Finish the remaining trust tasks so candidates see a credible employer, jobs publish with less friction, and moderation holds stay rare.
                          </p>
                          <ul className="mt-4 space-y-2 text-sm text-gray-700">
                            {onboarding.trust.checklist.map((item) => (
                              <li key={item.key}>• {item.label}: {item.done ? "Complete" : "Still pending"}</li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                      <div className="flex flex-wrap gap-3">
                        <Link href={localizePath("/employer/trust", locale)}>
                          <Button>Finish trust profile</Button>
                        </Link>
                        <Link href={localizePath("/employer/jobs/new", locale)}>
                          <Button variant="outline">Create first job</Button>
                        </Link>
                        <Link href={localizePath("/employer/talent", locale)}>
                          <Button variant="outline">Search talent</Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-gray-100 pt-6">
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeIndex === 0 || saving}
                        onClick={() => setActiveStep(onboardingSteps[Math.max(activeIndex - 1, 0)].key)}
                      >
                        Previous step
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => saveProgress()}
                      >
                        {saving ? "Saving..." : "Save progress"}
                      </Button>
                    </div>
                    <div className="flex gap-3">
                      {activeStep === "first_job_post" && (
                        <Link href={localizePath("/employer/jobs/new", locale)}>
                          <Button variant="outline">Open job composer</Button>
                        </Link>
                      )}
                      <Button type="button" disabled={saving || activeIndex === onboardingSteps.length - 1} onClick={goNext}>
                        {activeIndex === onboardingSteps.length - 1 ? "All set" : "Save and continue"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <EmployerActivationChecklist
                checklist={onboarding.checklist}
                completionPct={onboarding.completionPct}
                currentStep={activeStep}
                nextAction={onboarding.nextAction}
                subtitle="Every completed step should make publishing easier, applicant quality higher, or shortlist speed faster."
              />

              <Card className="border-blue-200 bg-blue-50/70">
                <CardHeader>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                    Milestone target
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-blue-950">
                    Reach the first qualified shortlist as fast as possible
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-blue-900">
                    Focus sequence: get verified, publish a strong job, review candidates in-platform, then shortlist quickly while apply quality is highest.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
