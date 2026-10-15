"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  CreateJobData,
  EmployerJobPreview,
  EmployerTrustDashboard,
  employerAnalytics,
  jobs,
  trust,
} from "@/lib/api";
import { employerOnboardingEvents } from "@/lib/analytics";
import { EmployerJobPostingPreview } from "@/components/employer/job-posting-preview";
import {
  BackLink,
  Eyebrow,
  Notice,
  Spinner,
  controlClass,
  labelClass,
} from "@/components/employer/employer-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { EXAMPLE } from "@/components/employer/locale-neutral";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import {
  EMPTY_JOB_MOBILITY,
  JobMobilityFields,
  type JobMobilityValues,
} from "@/components/employer/job-mobility-fields";
import { CURRENCIES, JOB_TYPES, SENIORITY_LEVELS } from "@/components/employer/job-form-options";
import { parseCountryList } from "@/lib/job-options";

type Step = 1 | 2 | 3;

export default function NewJobPage() {
  const locale = useLocale();
  const { user } = useAuth();
  const { t, tv, ts } = useEmployerI18n();
  const [trustDashboard, setTrustDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [loadingTrust, setLoadingTrust] = useState(true);
  const [step, setStep] = useState<Step>(1);
  const [preview, setPreview] = useState<EmployerJobPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    type: "Full-time",
    seniority: "Mid-level",
    salaryMin: "",
    salaryMax: "",
    currency: "USD",
    tags: "",
    applicationUrl: "",
  });
  const [mobility, setMobility] = useState<JobMobilityValues>(EMPTY_JOB_MOBILITY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string; pending: boolean; pendingReason: string | null } | null>(null);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      trust
        .employerSummary()
        .then(setTrustDashboard)
        .catch(() => {})
        .finally(() => setLoadingTrust(false));
    } else {
      setLoadingTrust(false);
    }
  }, [user]);

  const previewPayload = useMemo(() => {
    if (!formData.title || !formData.description || !formData.location || !formData.type || !formData.seniority) {
      return null;
    }

    return {
      title: formData.title,
      description: formData.description,
      location: formData.location,
      type: formData.type,
      seniority: formData.seniority,
      salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : null,
      salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : null,
      currency: formData.currency || null,
      tags: formData.tags
        ? formData.tags.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    };
  }, [formData]);

  useEffect(() => {
    if (!user || user.role !== "EMPLOYER" || !previewPayload) {
      setPreview(null);
      return;
    }

    const timeout = setTimeout(() => {
      setPreviewLoading(true);
      employerAnalytics
        .jobPreview(previewPayload)
        .then((response) => {
          setPreview(response);
          employerOnboardingEvents.jobQualityPreviewViewed({
            quality_score: response.qualityScore,
            moderation_risk: response.moderationRiskLevel,
            moderation_required: response.moderationRequired,
          });
        })
        .catch(() => {
          setPreview(null);
        })
        .finally(() => setPreviewLoading(false));
    }, 500);

    return () => clearTimeout(timeout);
  }, [previewPayload, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (trustDashboard && !trustDashboard.trust.postingEligibility) {
      setError(t("jobs.errTrustBeforePosting"));
      return;
    }

    setLoading(true);

    try {
      const result = await jobs.create({
        title: formData.title,
        description: formData.description,
        location: formData.location,
        type: formData.type,
        seniority: formData.seniority,
        salaryMin: formData.salaryMin ? parseInt(formData.salaryMin, 10) : undefined,
        salaryMax: formData.salaryMax ? parseInt(formData.salaryMax, 10) : undefined,
        currency: formData.currency || undefined,
        tags: formData.tags ? formData.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
        applicationUrl: formData.applicationUrl || undefined,
        workplaceType: mobility.workplaceType || undefined,
        jobField: mobility.jobField || undefined,
        visaSponsorship: mobility.visaSponsorship as CreateJobData["visaSponsorship"],
        relocationAssistance: mobility.relocationAssistance,
        eligibleCountries: parseCountryList(mobility.eligibleCountries),
      });
      setSubmitted({
        jobId: result.id,
        pending: !!result.pendingReason,
        pendingReason: result.pendingReason,
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("jobs.errCreate"));
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateMobility = <K extends keyof JobMobilityValues>(field: K, value: JobMobilityValues[K]) => {
    setMobility((prev) => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (step === 1 && (!formData.title || !formData.description || !formData.location)) {
      setError(t("jobs.errBasics"));
      return;
    }
    if (trustDashboard && !trustDashboard.trust.postingEligibility) {
      setError(t("jobs.errVerifyFirst"));
      return;
    }
    if (step === 2 && (!formData.type || !formData.seniority)) {
      setError(t("jobs.errDetails"));
      return;
    }
    setError(null);
    setStep((prev) => (prev < 3 ? ((prev + 1) as Step) : prev));
  };

  const prevStep = () => {
    setError(null);
    setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev));
  };

  if (!user || user.role !== "EMPLOYER") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-fg-secondary">{t("jobs.mustBeEmployer")}</p>
        <Link href={localizePath("/login", locale)}>
          <Button>{t("common.login")}</Button>
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" role="status">
        <div
          className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border ${
            submitted.pending ? "border-warning-line bg-warning-soft text-warning" : "border-success-line bg-success-soft text-success"
          }`}
        >
          <svg aria-hidden="true" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {submitted.pending ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            )}
          </svg>
        </div>
        <h1 className="mb-3 text-2xl font-bold text-fg">
          {submitted.pending ? t("jobs.submittedTitle") : t("jobs.publishedTitle")}
        </h1>
        <p className="mb-8 text-fg-secondary">
          {submitted.pending ? ts(submitted.pendingReason) || t("jobs.submittedBody") : t("jobs.publishedBody")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={localizePath("/employer", locale)}>
            <Button>{t("common.goToDashboard")}</Button>
          </Link>
          {submitted.pending && (
            <Link href={localizePath("/employer/trust", locale)}>
              <Button variant="outline">{t("common.completeVerification")}</Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: t("jobs.stepBasics") },
    { n: 2, label: t("jobs.stepDetails") },
    { n: 3, label: t("jobs.stepPublish") },
  ];
  const workplaceLabel = mobility.workplaceType ? tv("opt.workplace", mobility.workplaceType) : t("common.notSpecified");
  const reviewRows: Array<[string, string]> = [
    [t("jobs.fieldTitle"), formData.title],
    [t("jobs.fieldLocation"), formData.location],
    [t("jobs.fieldType"), tv("opt.jobType", formData.type)],
    [t("jobs.fieldSeniority"), tv("opt.seniority", formData.seniority)],
    [
      t("jobs.reviewSalary"),
      formData.salaryMin || formData.salaryMax
        ? `${formData.salaryMin || "–"} – ${formData.salaryMax || "–"} ${formData.currency}`
        : t("common.notSpecified"),
    ],
    [t("jobs.reviewWorkplace"), [workplaceLabel, mobility.jobField ? tv("opt.field", mobility.jobField) : ""].filter(Boolean).join(" · ")],
    [
      t("mobility.visa"),
      [tv("opt.visa", mobility.visaSponsorship), mobility.relocationAssistance ? t("jobs.reviewRelocation") : ""]
        .filter(Boolean)
        .join(" · "),
    ],
    ...(mobility.eligibleCountries.trim()
      ? [[t("jobs.reviewCountries"), parseCountryList(mobility.eligibleCountries).join(", ")] as [string, string]]
      : []),
    [t("jobs.reviewTags"), formData.tags || t("jobs.reviewNoTags")],
    [t("jobs.reviewApplyPath"), formData.applicationUrl ? t("jobs.reviewApplyBoth") : t("jobs.reviewApplyDirect")],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <BackLink href={localizePath("/employer", locale)}>{t("common.backToDashboard")}</BackLink>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <Eyebrow>{t("jobs.newEyebrow")}</Eyebrow>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{t("jobs.newTitle")}</h1>
            <p className="mt-2 text-sm text-fg-secondary">{t("jobs.newSubtitle")}</p>
            <ol className="mt-5 grid grid-cols-3 gap-2" aria-label={t("jobs.progressLabel")}>
              {steps.map((item) => {
                const state = step === item.n ? "current" : step > item.n ? "done" : "todo";
                return (
                  <li
                    key={item.n}
                    aria-current={state === "current" ? "step" : undefined}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition-colors sm:text-sm ${
                      state === "current"
                        ? "border-transparent bg-primary text-primary-fg shadow-xs"
                        : state === "done"
                          ? "border-success-line bg-primary-soft text-primary-text"
                          : "border-line bg-surface-sunken text-fg-muted"
                    }`}
                  >
                    <span aria-hidden="true">{state === "done" ? "✓" : item.n}</span>
                    {item.label}
                  </li>
                );
              })}
            </ol>
          </CardHeader>
          <CardContent>
            {loadingTrust ? (
              <div className="mb-6 flex justify-center py-3">
                <Spinner />
              </div>
            ) : trustDashboard ? (
              <div
                className={`mb-6 rounded-2xl border px-4 py-4 ${
                  trustDashboard.trust.postingEligibility ? "border-success-line bg-success-soft" : "border-warning-line bg-warning-soft"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <TrustBadge
                        label={ts(trustDashboard.trust.badge)}
                        riskLevel={trustDashboard.trust.riskLevel}
                        variant="success"
                      />
                      {trustDashboard.trust.verifiedDomain && (
                        <TrustBadge label={t("jobs.domainMatched", { domain: trustDashboard.trust.verifiedDomain })} variant="info" />
                      )}
                    </div>
                    <p className="mt-3 text-sm text-fg-secondary">
                      {trustDashboard.trust.postingEligibility ? t("jobs.eligible") : t("jobs.notEligible")}
                    </p>
                    {trustDashboard.trust.warnings.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-fg-secondary">
                        {trustDashboard.trust.warnings.map((warning) => (
                          <li key={warning}>{ts(warning)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link href={localizePath("/employer/trust", locale)} className="shrink-0">
                    <Button variant={trustDashboard.trust.postingEligibility ? "outline" : "primary"}>
                      {trustDashboard.trust.postingEligibility ? t("jobs.reviewTrust") : t("common.completeVerification")}
                    </Button>
                  </Link>
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {error && (
                <Notice tone="danger" role="alert">
                  {error}
                </Notice>
              )}

              {step === 1 && (
                <>
                  <Input
                    id="title"
                    label={t("jobs.fieldTitle")}
                    placeholder={t("jobs.titlePlaceholder")}
                    value={formData.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    required
                  />

                  <div>
                    <label htmlFor="description" className={labelClass}>
                      {t("jobs.fieldDescription")}
                    </label>
                    <textarea
                      id="description"
                      className={`${controlClass} min-h-[220px]`}
                      placeholder={t("jobs.descriptionPlaceholder")}
                      value={formData.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      required
                    />
                  </div>

                  <Input
                    id="location"
                    label={t("jobs.fieldLocation")}
                    placeholder={t("jobs.locationPlaceholder")}
                    value={formData.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    required
                  />
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="type" className={labelClass}>
                        {t("jobs.fieldType")}
                      </label>
                      <select
                        id="type"
                        className={controlClass}
                        value={formData.type}
                        onChange={(e) => updateField("type", e.target.value)}
                      >
                        {JOB_TYPES.map((value) => (
                          <option key={value} value={value}>{tv("opt.jobType", value)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="seniority" className={labelClass}>
                        {t("jobs.fieldSeniority")}
                      </label>
                      <select
                        id="seniority"
                        className={controlClass}
                        value={formData.seniority}
                        onChange={(e) => updateField("seniority", e.target.value)}
                      >
                        {SENIORITY_LEVELS.map((value) => (
                          <option key={value} value={value}>{tv("opt.seniority", value)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Input
                      id="salaryMin"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      label={t("jobs.fieldSalaryMin")}
                      placeholder="60000"
                      value={formData.salaryMin}
                      onChange={(e) => updateField("salaryMin", e.target.value)}
                    />
                    <Input
                      id="salaryMax"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      label={t("jobs.fieldSalaryMax")}
                      placeholder="90000"
                      value={formData.salaryMax}
                      onChange={(e) => updateField("salaryMax", e.target.value)}
                    />
                    <div>
                      <label htmlFor="currency" className={labelClass}>
                        {t("jobs.fieldCurrency")}
                      </label>
                      <select
                        id="currency"
                        className={controlClass}
                        value={formData.currency}
                        onChange={(e) => updateField("currency", e.target.value)}
                      >
                        {CURRENCIES.map((code) => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <JobMobilityFields values={mobility} onChange={updateMobility} />

                  <Input
                    id="tags"
                    label={t("jobs.fieldTags")}
                    placeholder={t("jobs.tagsPlaceholder")}
                    value={formData.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                  />
                  <div>
                    <Input
                      id="applicationUrl"
                      type="url"
                      label={t("jobs.fieldApplicationUrl")}
                      placeholder={EXAMPLE.careersUrl}
                      aria-describedby="applicationUrl-hint"
                      value={formData.applicationUrl}
                      onChange={(e) => updateField("applicationUrl", e.target.value)}
                    />
                    <p id="applicationUrl-hint" className="mt-2 text-sm text-fg-muted">
                      {t("jobs.applicationUrlHint")}
                    </p>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line bg-surface-sunken p-5">
                    <p className="mb-3 font-semibold text-fg">{t("jobs.reviewTitle")}</p>
                    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      {reviewRows.map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-fg-muted">{label}</dt>
                          <dd className="mt-0.5 break-words font-medium text-fg">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <Notice tone="info">{t("jobs.reviewAdvice")}</Notice>
                  {preview?.moderationRequired && <Notice tone="warning">{t("jobs.reviewModeration")}</Notice>}
                </div>
              )}

              <div className="flex flex-wrap gap-3 border-t border-line pt-6">
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={prevStep}>
                    {t("common.back")}
                  </Button>
                )}
                {/* Distinct keys: without them React reuses the same <button>
                    and flips type="button" -> "submit" during the click, so the
                    browser submits the form and skips the step-3 review. */}
                {step < 3 ? (
                  <Button key="continue" type="button" className="flex-1" onClick={nextStep}>
                    {t("common.continue")}
                  </Button>
                ) : (
                  <Button key="submit" type="submit" className="flex-1" isLoading={loading} disabled={loading}>
                    {loading ? t("jobs.creating") : t("jobs.postJob")}
                  </Button>
                )}
                <Link href={localizePath("/employer", locale)}>
                  <Button type="button" variant="ghost">
                    {t("common.cancel")}
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-6">
          <div className="xl:sticky xl:top-24 xl:space-y-6">
            <EmployerJobPostingPreview preview={preview} loading={previewLoading} />

            <Card className="mt-6 border-line bg-surface-sunken xl:mt-0">
              <CardHeader>
                <Eyebrow>{t("jobs.rulesEyebrow")}</Eyebrow>
                <h2 className="mt-2 text-lg font-semibold text-fg">{t("jobs.rulesTitle")}</h2>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 ps-5 text-sm text-fg-secondary">
                  <li>{t("jobs.rule1")}</li>
                  <li>{t("jobs.rule2")}</li>
                  <li>{t("jobs.rule3")}</li>
                  <li>{t("jobs.rule4")}</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
