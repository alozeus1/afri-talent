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
import { EXAMPLE } from "@/components/employer/locale-neutral";
import { useEmployerI18n, type EmployerMessageKey } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";
import { EmployerActivationChecklist } from "@/components/employer/activation-checklist";
import { EmployerMilestones } from "@/components/employer/activation-milestones";
import {
  Eyebrow,
  Notice,
  PageSpinner,
  Spinner,
  checkboxClass,
  controlClass,
  labelClass,
} from "@/components/employer/employer-ui";
import { TrustBadge } from "@/components/trust/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ONBOARDING_STEPS: EmployerOnboardingStep[] = [
  "company_setup",
  "verification",
  "team_setup",
  "first_job_post",
  "candidate_filters",
  "subscription_choice",
  "trust_completion",
];

// Free launch: there is no plan to choose, so the subscription step is skipped.
const visibleSteps = FREE_MODE
  ? ONBOARDING_STEPS.filter((step) => step !== "subscription_choice")
  : ONBOARDING_STEPS;

function visibleStep(step: EmployerOnboardingStep): EmployerOnboardingStep {
  return FREE_MODE && step === "subscription_choice" ? "trust_completion" : step;
}

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

type PlanKey = "EMPLOYER_FREE" | "EMPLOYER_BASIC" | "EMPLOYER_PREMIUM";

const PLANS: Array<{ plan: PlanKey; title: EmployerMessageKey; blurb: EmployerMessageKey; points: EmployerMessageKey[] }> = [
  {
    plan: "EMPLOYER_FREE",
    title: "onb.planFree",
    blurb: "onb.planFreeBlurb",
    points: ["onb.planFree1", "onb.planFree2", "onb.planFree3"],
  },
  {
    plan: "EMPLOYER_BASIC",
    title: "onb.planBasic",
    blurb: "onb.planBasicBlurb",
    points: ["onb.planBasic1", "onb.planBasic2", "onb.planBasic3"],
  },
  {
    plan: "EMPLOYER_PREMIUM",
    title: "onb.planPremium",
    blurb: "onb.planPremiumBlurb",
    points: ["onb.planPremium1", "onb.planPremium2", "onb.planPremium3"],
  },
];

function BulletList({ items, dotClass = "bg-fg-muted" }: { items: string[]; dotClass?: string }) {
  return (
    <ul className="mt-3 space-y-2 text-sm text-fg-secondary">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function EmployerOnboardingPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tn, tv, ts } = useEmployerI18n();

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
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("EMPLOYER_FREE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "" = failed without a server message (rendered with a translated fallback).
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const activeIndex = visibleSteps.findIndex((step) => step === activeStep);

  const hydrateState = (data: EmployerOnboarding) => {
    setOnboarding(data);
    setActiveStep(visibleStep(data.currentStep));
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
        setError(err instanceof Error ? err.message : "");
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
    setSuccess(false);

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
      setActiveStep(visibleStep(nextStep || activeStep));
      setSuccess(true);

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
      setError(err instanceof Error && err.message ? err.message : t("onb.errSave"));
    } finally {
      setSaving(false);
    }
  };

  const goToStep = (step: EmployerOnboardingStep) => {
    setActiveStep(step);
    setSuccess(false);
    employerOnboardingEvents.onboardingViewed({ step });
  };

  const goNext = async () => {
    const next = visibleSteps[activeIndex + 1];
    if (!next) return;
    await saveProgress(next);
  };

  const currentStep = visibleSteps[activeIndex] || visibleSteps[0];

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-3">
        <Eyebrow className="text-primary-text">{t("onb.eyebrow")}</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t("onb.title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-fg-secondary sm:text-base">{t("onb.subtitle")}</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !onboarding ? (
        <Notice tone="danger" role="alert" title={t("onb.loadErrorTitle")}>
          {error || t("onb.errLoad")}
        </Notice>
      ) : (
        <div className="space-y-8">
          <EmployerMilestones milestones={onboarding.milestones} activationState={onboarding.activationState} />

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <Card className="overflow-hidden">
                <CardHeader className="bg-surface-sunken">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <Eyebrow>{t("onb.currentStep", { n: activeIndex + 1, total: visibleSteps.length })}</Eyebrow>
                      <h2 className="mt-2 text-2xl font-semibold text-fg">{tv("step", currentStep)}</h2>
                      <p className="mt-2 max-w-2xl text-sm text-fg-secondary">{t(`onb.sub.${currentStep}` as EmployerMessageKey)}</p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-success-line bg-primary-soft px-4 py-3 text-sm">
                      <p className="font-semibold text-primary-text">{t("checklist.complete", { pct: onboarding.completionPct })}</p>
                      <p className="mt-1 text-fg-secondary">
                        {tn("onb.publishedJobs", onboarding.stats.publishedJobs)} •{" "}
                        {tn("onb.qualifiedApplicants", onboarding.stats.qualifiedApplicants)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <nav aria-label={t("onb.stepsLabel")}>
                    <ol className="mb-6 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                      {visibleSteps.map((step, index) => {
                        const done = onboarding.checklist.find((item) => item.key === step)?.done;
                        const active = activeStep === step;
                        return (
                          <li key={step}>
                            <button
                              type="button"
                              aria-current={active ? "step" : undefined}
                              onClick={() => goToStep(step)}
                              className={`h-full w-full rounded-xl border px-3 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                active
                                  ? "border-success-line bg-primary-soft"
                                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
                              }`}
                            >
                              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                                {done && <span aria-hidden="true" className="text-success">✓</span>}
                                {t("onb.stepN", { n: index + 1 })}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-fg">{tv("step", step)}</p>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </nav>

                  {error !== null && (
                    <Notice tone="danger" role="alert" className="mb-4">
                      {error || t("onb.errSave")}
                    </Notice>
                  )}
                  {success && (
                    <Notice tone="success" role="status" className="mb-4">
                      {t("onb.saved")}
                    </Notice>
                  )}

                  {activeStep === "company_setup" && (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          id="companyName"
                          label={t("analytics.companyName")}
                          value={companyForm.companyName}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, companyName: event.target.value }))}
                          placeholder={t("analytics.companyNamePlaceholder")}
                        />
                        <Input
                          id="website"
                          type="url"
                          label={t("trust.companyWebsite")}
                          value={companyForm.website}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, website: event.target.value }))}
                          placeholder={EXAMPLE.website}
                        />
                      </div>
                      <Input
                        id="location"
                        label={t("onb.hiringLocation")}
                        value={companyForm.location}
                        onChange={(event) => setCompanyForm((prev) => ({ ...prev, location: event.target.value }))}
                        placeholder={t("onb.hiringLocationPlaceholder")}
                      />
                      <div>
                        <label htmlFor="bio" className={labelClass}>
                          {t("onb.companyStory")}
                        </label>
                        <textarea
                          id="bio"
                          className={`${controlClass} min-h-[180px]`}
                          placeholder={t("onb.companyStoryPlaceholder")}
                          value={companyForm.bio}
                          onChange={(event) => setCompanyForm((prev) => ({ ...prev, bio: event.target.value }))}
                        />
                      </div>
                      <Notice tone="info">{t("onb.companyTip")}</Notice>
                    </div>
                  )}

                  {activeStep === "verification" && (
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <TrustBadge label={ts(onboarding.trust.badge)} riskLevel={onboarding.trust.riskLevel} variant="success" />
                        {onboarding.trust.verifiedDomain && (
                          <TrustBadge label={t("trust.verifiedDomain", { domain: onboarding.trust.verifiedDomain })} variant="info" />
                        )}
                        {onboarding.trust.requiresEnhancedVerification && (
                          <TrustBadge label={t("onb.enhancedRequired")} riskLevel="MEDIUM" variant="warning" />
                        )}
                      </div>
                      <div className="rounded-2xl border border-line bg-surface-sunken p-5">
                        <p className="text-sm text-fg-secondary">{t("onb.verificationBody")}</p>
                        <ul className="mt-4 space-y-2 text-sm">
                          {onboarding.trust.checklist.map((item) => (
                            <li key={item.key} className="flex items-start justify-between gap-3">
                              <span className="text-fg-secondary">{ts(item.label)}</span>
                              <span className={`shrink-0 font-medium ${item.done ? "text-success" : "text-warning"}`}>
                                {item.done ? t("onb.complete") : t("common.pending")}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {onboarding.trust.warnings.length > 0 && (
                          <Notice tone="warning" className="mt-4" title={t("onb.attention")}>
                            <ul className="list-disc space-y-1 ps-5">
                              {onboarding.trust.warnings.map((warning) => (
                                <li key={warning}>{ts(warning)}</li>
                              ))}
                            </ul>
                          </Notice>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link href={localizePath("/employer/trust", locale)}>
                          <Button>{t("common.openTrustCenter")}</Button>
                        </Link>
                        <Link href={localizePath("/trust", locale)}>
                          <Button variant="outline">{t("onb.badgesMeaning")}</Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  {activeStep === "team_setup" && (
                    <div className="space-y-5">
                      <div>
                        <label htmlFor="teamMemberEmails" className={labelClass}>
                          {t("onb.teamEmails")}
                        </label>
                        <textarea
                          id="teamMemberEmails"
                          aria-describedby="teamMemberEmails-hint"
                          className={`${controlClass} min-h-[180px]`}
                          placeholder={EXAMPLE.teamEmails}
                          value={teamMemberEmails}
                          onChange={(event) => setTeamMemberEmails(event.target.value)}
                        />
                        <p id="teamMemberEmails-hint" className="mt-2 text-sm text-fg-muted">
                          {t("onb.teamHint")}
                        </p>
                      </div>
                      <Notice>{t("onb.teamTip")}</Notice>
                    </div>
                  )}

                  {activeStep === "first_job_post" && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-success-line bg-primary-soft px-5 py-5">
                        <Eyebrow className="text-primary-text">{t("onb.firstSuccess")}</Eyebrow>
                        <h3 className="mt-2 text-xl font-semibold text-fg">{t("onb.firstJobTitle")}</h3>
                        <p className="mt-3 text-sm text-fg-secondary">{t("onb.firstJobBody")}</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Link href={localizePath("/employer/jobs/new", locale)}>
                            <Button>{t("onb.createWithPreview")}</Button>
                          </Link>
                          <Link href={localizePath("/employer/analytics", locale)}>
                            <Button variant="outline">{t("onb.viewMetrics")}</Button>
                          </Link>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-success-line bg-success-soft px-4 py-4">
                          <p className="font-semibold text-success">{t("onb.strongJobs")}</p>
                          <BulletList
                            dotClass="bg-success"
                            items={[t("onb.strong1"), t("onb.strong2"), t("onb.strong3"), t("onb.strong4")]}
                          />
                        </div>
                        <div className="rounded-2xl border border-warning-line bg-warning-soft px-4 py-4">
                          <p className="font-semibold text-warning">{t("onb.slowJobs")}</p>
                          <BulletList
                            dotClass="bg-warning"
                            items={[t("onb.slow1"), t("onb.slow2"), t("onb.slow3"), t("onb.slow4")]}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeStep === "candidate_filters" && (
                    <div className="space-y-5">
                      <Input
                        id="filterSkills"
                        label={t("onb.filterSkills")}
                        value={filterSkills}
                        onChange={(event) => setFilterSkills(event.target.value)}
                        placeholder={t("onb.filterSkillsPlaceholder")}
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          id="filterLocation"
                          label={t("onb.filterLocation")}
                          value={filterLocation}
                          onChange={(event) => setFilterLocation(event.target.value)}
                          placeholder={t("onb.filterLocationPlaceholder")}
                        />
                        <Input
                          id="filterMinExperience"
                          label={t("onb.filterExperience")}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={filterMinExperience}
                          onChange={(event) => setFilterMinExperience(event.target.value)}
                          placeholder="3"
                        />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label
                          htmlFor="verifiedOnly"
                          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-sunken px-4 py-4 text-sm text-fg-secondary"
                        >
                          <input
                            id="verifiedOnly"
                            type="checkbox"
                            className={`mt-0.5 ${checkboxClass}`}
                            checked={verifiedOnly}
                            onChange={(event) => setVerifiedOnly(event.target.checked)}
                          />
                          {FREE_MODE ? t("onb.verifiedOnlyFree") : t("onb.verifiedOnly")}
                        </label>
                        <div>
                          <label htmlFor="visaPreference" className={labelClass}>
                            {t("onb.visaPreference")}
                          </label>
                          <select
                            id="visaPreference"
                            className={controlClass}
                            value={visaPreference}
                            onChange={(event) => setVisaPreference(event.target.value as EmployerCandidateFilters["visaPreference"])}
                          >
                            <option value="ANY">{t("onb.visaAny")}</option>
                            <option value="SPONSORED_ONLY">{t("onb.visaSponsored")}</option>
                          </select>
                        </div>
                      </div>
                      <Notice>{t("onb.filtersTip")}</Notice>
                    </div>
                  )}

                  {activeStep === "subscription_choice" && !FREE_MODE && (
                    <div className="space-y-5">
                      <div className="grid gap-4 lg:grid-cols-3" role="radiogroup" aria-label={t("onb.planLabel")}>
                        {PLANS.map((plan) => {
                          const selected = selectedPlan === plan.plan;
                          return (
                            <button
                              key={plan.plan}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => setSelectedPlan(plan.plan)}
                              className={`rounded-2xl border px-5 py-5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                selected ? "border-success-line bg-primary-soft shadow-xs" : "border-line bg-surface hover:border-line-strong"
                              }`}
                            >
                              <Eyebrow className={selected ? "text-primary-text" : undefined}>{t(plan.title)}</Eyebrow>
                              <p className="mt-3 text-sm text-fg-secondary">{t(plan.blurb)}</p>
                              <BulletList items={plan.points.map((point) => t(point))} />
                            </button>
                          );
                        })}
                      </div>
                      <div className="rounded-2xl border border-line bg-surface-sunken px-5 py-5">
                        <Eyebrow className="text-primary-text">{t("onb.planFraming")}</Eyebrow>
                        <h3 className="mt-2 text-lg font-semibold text-fg">{ts(onboarding.upgradeJourney.headline)}</h3>
                        <p className="mt-2 text-sm text-fg-secondary">{ts(onboarding.upgradeJourney.body)}</p>
                        {onboarding.upgradeJourney.ctaLabel && (
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
                                {ts(onboarding.upgradeJourney.ctaLabel)}
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeStep === "trust_completion" && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-success-line bg-success-soft p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <TrustBadge label={ts(onboarding.trust.badge)} riskLevel={onboarding.trust.riskLevel} variant="success" />
                          <TrustBadge
                            label={onboarding.trust.postingEligibility ? t("onb.postingUnlocked") : t("onb.postingLimited")}
                            variant={onboarding.trust.postingEligibility ? "success" : "warning"}
                          />
                        </div>
                        <p className="mt-3 text-sm text-fg-secondary">{t("onb.trustBody")}</p>
                        <ul className="mt-4 space-y-2 text-sm">
                          {onboarding.trust.checklist.map((item) => (
                            <li key={item.key} className="flex items-start justify-between gap-3">
                              <span className="text-fg-secondary">{ts(item.label)}</span>
                              <span className={`shrink-0 font-medium ${item.done ? "text-success" : "text-warning"}`}>
                                {item.done ? t("onb.complete") : t("onb.stillPending")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link href={localizePath("/employer/trust", locale)}>
                          <Button>{t("onb.finishTrust")}</Button>
                        </Link>
                        <Link href={localizePath("/employer/jobs/new", locale)}>
                          <Button variant="outline">{t("common.createFirstJob")}</Button>
                        </Link>
                        <Link href={localizePath("/employer/talent", locale)}>
                          <Button variant="outline">{t("common.searchTalent")}</Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeIndex === 0 || saving}
                        onClick={() => setActiveStep(visibleSteps[Math.max(activeIndex - 1, 0)])}
                      >
                        {t("onb.previous")}
                      </Button>
                      <Button type="button" variant="ghost" disabled={saving} onClick={() => saveProgress()}>
                        {saving ? t("common.saving") : t("onb.saveProgress")}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {activeStep === "first_job_post" && (
                        <Link href={localizePath("/employer/jobs/new", locale)}>
                          <Button variant="outline">{t("onb.openComposer")}</Button>
                        </Link>
                      )}
                      <Button
                        type="button"
                        isLoading={saving}
                        disabled={saving || activeIndex === visibleSteps.length - 1}
                        onClick={goNext}
                      >
                        {activeIndex === visibleSteps.length - 1 ? t("onb.allSet") : t("onb.saveContinue")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <aside className="space-y-6">
              <EmployerActivationChecklist
                checklist={onboarding.checklist}
                completionPct={onboarding.completionPct}
                currentStep={activeStep}
                nextAction={onboarding.nextAction}
                subtitle={t("onb.checklistSubtitle")}
              />

              <Card className="border-info-line">
                <CardHeader>
                  <Eyebrow className="text-info">{t("onb.targetEyebrow")}</Eyebrow>
                  <h2 className="mt-2 text-lg font-semibold text-fg">{t("onb.targetTitle")}</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-fg-secondary">{t("onb.targetBody")}</p>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
