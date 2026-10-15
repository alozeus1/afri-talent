"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  EmployerAdvancedAnalytics,
  EmployerAnalytics,
  EmployerBranding,
  employerAnalytics,
} from "@/lib/api";
import { EmployerMilestones } from "@/components/employer/activation-milestones";
import {
  EmployerHero,
  EmptyPanel,
  Eyebrow,
  Notice,
  PageSpinner,
  Spinner,
  StatCard,
  controlClass,
  heroLinkClass,
  labelClass,
} from "@/components/employer/employer-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { EXAMPLE } from "@/components/employer/locale-neutral";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "info",
  INTERVIEW: "info",
  OFFERED: "success",
  ACCEPTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "default",
};

export default function EmployerAnalyticsPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tv, ts, fmt } = useEmployerI18n();

  const [analytics, setAnalytics] = useState<EmployerAnalytics | null>(null);
  const [advancedAnalytics, setAdvancedAnalytics] = useState<EmployerAdvancedAnalytics | null>(null);
  const [branding, setBranding] = useState<EmployerBranding | null>(null);
  const [loading, setLoading] = useState(true);
  // "" = failed without a server message (rendered with a translated fallback).
  const [error, setError] = useState<string | null>(null);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const [brandingForm, setBrandingForm] = useState({
    companyName: "",
    website: "",
    location: "",
    bio: "",
    logoUrl: "",
    brandColor: "#0f766e",
    accentColor: "#10b981",
  });
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (user?.role !== "EMPLOYER") {
      return;
    }

    Promise.all([
      employerAnalytics.stats(),
      employerAnalytics.advanced(),
      employerAnalytics.getBranding(),
    ])
      .then(([statsData, advancedData, brandingData]) => {
        setAnalytics(statsData);
        setAdvancedAnalytics(advancedData);
        setBranding(brandingData);
        setBrandingForm({
          companyName: brandingData.companyName || "",
          website: brandingData.website || "",
          location: brandingData.location || "",
          bio: brandingData.bio || "",
          logoUrl: brandingData.logoUrl || "",
          brandColor: brandingData.brandColor || "#0f766e",
          accentColor: brandingData.accentColor || "#10b981",
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    setBrandingSaved(false);
    setBrandingError(null);
    try {
      const updated = await employerAnalytics.updateBranding(brandingForm);
      setBranding(updated);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 3000);
    } catch (err) {
      setBrandingError(err instanceof Error && err.message ? err.message : t("analytics.errSaveBranding"));
    } finally {
      setSavingBranding(false);
    }
  };

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  const roi = advancedAnalytics?.roi;
  const brandingEnabled = Boolean(branding?.premiumBrandingEnabled);
  const hours = (value: number | null | undefined, empty: string) =>
    value == null ? empty : t("common.hours", { hours: value });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <EmployerHero
        eyebrow={t("analytics.eyebrow")}
        title={t("analytics.title")}
        description={FREE_MODE ? t("analytics.subtitleFree") : t("analytics.subtitle")}
        aside={
          <div className="flex flex-wrap gap-3">
            <Link href={localizePath("/employer/onboarding", locale)} className={heroLinkClass}>
              {t("analytics.guidedOnboarding")}
            </Link>
            {!FREE_MODE && (
              <Link href={localizePath("/billing", locale)}>
                <Button>{t("analytics.comparePlans")}</Button>
              </Link>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : error !== null ? (
        <Notice tone="danger" role="alert" className="mt-8" title={t("analytics.errorTitle")}>
          {error || t("analytics.errLoad")}
        </Notice>
      ) : analytics && advancedAnalytics ? (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("analytics.impressions")}
              value={fmt.number(roi?.impressions ?? 0)}
              helper={t("analytics.impressionsHelper")}
            />
            <StatCard
              label={t("analytics.clicks")}
              value={fmt.number(roi?.clicks ?? 0)}
              helper={t("analytics.clickToApply", { rate: roi?.clickToApplyRate ?? 0 })}
            />
            <StatCard
              label={t("stats.qualifiedApplicants")}
              value={fmt.number(roi?.qualifiedApplicants ?? analytics.qualifiedApplicants)}
              helper={t("stats.shortlistRate", { rate: roi?.shortlistRate ?? analytics.shortlistRate })}
            />
            <StatCard
              accent
              label={t("stats.timeToShortlist")}
              value={hours(roi?.timeToFirstQualifiedApplicantHours, t("common.pending"))}
              helper={t("stats.timeToShortlistHelper")}
            />
          </div>

          <EmployerMilestones milestones={analytics.activationMilestones} activationState={analytics.activationState} />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader>
                <Eyebrow>{t("analytics.funnelEyebrow")}</Eyebrow>
                <h2 className="mt-2 text-xl font-semibold text-fg">{t("analytics.funnelTitle")}</h2>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {advancedAnalytics.funnel.map((step, index) => (
                    <li key={step.step} className="rounded-2xl border border-line bg-surface-sunken p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        <span className="me-1.5 tabular-nums text-fg-secondary">{index + 1}.</span>
                        {tv("funnel", step.step)}
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{fmt.number(step.count)}</p>
                      <p className="mt-2 text-xs text-fg-muted">
                        {step.conversionFromPrevious == null
                          ? t("analytics.baseline")
                          : t("analytics.fromPrevious", { rate: step.conversionFromPrevious })}
                      </p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-info-line">
                <CardHeader>
                  <Eyebrow className="text-info">{t("impact.eyebrow")}</Eyebrow>
                  <h2 className="mt-2 text-lg font-semibold text-fg">
                    {t("impact.titleApplicants", { rate: analytics.verificationImpact.qualifiedApplicantRate })}
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-fg-secondary">
                    {analytics.verificationImpact.verified
                      ? t("impact.verified", { rate: analytics.verificationImpact.qualifiedApplicantRate })
                      : t("impact.unverified")}
                  </p>
                </CardContent>
              </Card>

              {roi && !FREE_MODE && (
                <Card>
                  <CardHeader>
                    <Eyebrow className="text-primary-text">{t("analytics.upgradeEyebrow")}</Eyebrow>
                    <h2 className="mt-2 text-lg font-semibold text-fg">{ts(roi.upgradeJourney.headline)}</h2>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-fg-secondary">{ts(roi.upgradeJourney.body)}</p>
                    <p className="mt-4 text-sm text-fg-secondary">
                      {t("analytics.avgQuality", { score: roi.averageJobQuality })}
                    </p>
                    {roi.upgradeJourney.ctaLabel && (
                      <div className="mt-4">
                        <Link href={localizePath("/billing", locale)}>
                          <Button size="sm">{ts(roi.upgradeJourney.ctaLabel)}</Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <Eyebrow>{t("analytics.performanceEyebrow")}</Eyebrow>
              <h2 className="mt-2 text-xl font-semibold text-fg">{t("analytics.performanceTitle")}</h2>
            </CardHeader>
            <CardContent>
              {advancedAnalytics.postingPerformance.length === 0 ? (
                <EmptyPanel title={t("analytics.performanceEmptyTitle")} description={t("analytics.performanceEmptyBody")}>
                  <Link href={localizePath("/employer/jobs/new", locale)}>
                    <Button size="sm">{t("common.createFirstJob")}</Button>
                  </Link>
                </EmptyPanel>
              ) : (
                <div className="-mx-6 overflow-x-auto px-6">
                  <table className="w-full min-w-[860px] text-start">
                    <caption className="sr-only">{t("analytics.performanceTitle")}</caption>
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-fg-muted">
                        {[
                          t("analytics.colJob"),
                          t("analytics.impressions"),
                          t("analytics.clicks"),
                          t("analytics.colApplies"),
                          t("analytics.colQualified"),
                          t("analytics.colCtr"),
                          t("analytics.colShortlist"),
                          t("analytics.colQuality"),
                          t("analytics.colTimeToFirst"),
                        ].map((heading, index) => (
                          <th key={heading} scope="col" className={`pb-3 font-medium ${index === 0 ? "text-start" : "text-end"}`}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {advancedAnalytics.postingPerformance.map((row) => (
                        <tr key={row.jobId} className="transition-colors hover:bg-surface-sunken">
                          <th scope="row" className="py-3 pe-4 text-start text-sm font-medium text-fg">{row.title}</th>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{fmt.number(row.impressions)}</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{fmt.number(row.clicks)}</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{fmt.number(row.applicationCount)}</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{fmt.number(row.qualifiedApplicants)}</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{row.ctr}%</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{row.shortlistRate}%</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">{row.qualityScore}</td>
                          <td className="py-3 text-end text-sm tabular-nums text-fg-secondary">
                            {hours(row.timeToFirstApplicationHours, t("common.na"))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card>
              <CardHeader>
                <Eyebrow>{t("analytics.pipelineEyebrow")}</Eyebrow>
                <h2 className="mt-2 text-xl font-semibold text-fg">{t("analytics.pipelineTitle")}</h2>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(
                    [
                      ["PENDING", advancedAnalytics.candidatePipeline.pending],
                      ["REVIEWING", advancedAnalytics.candidatePipeline.reviewing],
                      ["SHORTLISTED", advancedAnalytics.candidatePipeline.shortlisted],
                      ["ACCEPTED", advancedAnalytics.candidatePipeline.accepted],
                      ["REJECTED", advancedAnalytics.candidatePipeline.rejected],
                    ] as const
                  ).map(([status, value]) => (
                    <div key={status} className="rounded-2xl border border-line bg-surface p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{tv("status.app", status)}</p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{fmt.number(value)}</p>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-success-line bg-primary-soft p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary-text">{t("analytics.avgReview")}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">
                      {hours(advancedAnalytics.candidatePipeline.avgReviewTimeHours, t("common.na"))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Eyebrow>{t("analytics.recentEyebrow")}</Eyebrow>
                <h2 className="mt-2 text-xl font-semibold text-fg">{t("analytics.recentTitle")}</h2>
              </CardHeader>
              <CardContent>
                {analytics.recentApplications.length === 0 ? (
                  <p className="text-sm text-fg-secondary">{t("analytics.recentEmpty")}</p>
                ) : (
                  <ul className="space-y-3">
                    {analytics.recentApplications.map((app) => (
                      <li key={app.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-fg">{app.candidate.name}</p>
                            <p className="truncate text-sm text-fg-secondary">{app.job.title}</p>
                          </div>
                          <Badge variant={statusVariants[app.status] || "default"}>{tv("status.app", app.status)}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-fg-muted">{t("apps.appliedOn", { date: fmt.date(app.createdAt) })}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <Eyebrow>{t("analytics.brandEyebrow")}</Eyebrow>
              <h2 className="mt-2 text-xl font-semibold text-fg">{t("analytics.brandTitle")}</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveBranding} className="max-w-3xl space-y-4">
                {brandingError && (
                  <Notice tone="danger" role="alert">
                    {brandingError}
                  </Notice>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    id="brandCompanyName"
                    label={t("analytics.companyName")}
                    value={brandingForm.companyName}
                    onChange={(e) => setBrandingForm({ ...brandingForm, companyName: e.target.value })}
                    placeholder={t("analytics.companyNamePlaceholder")}
                  />
                  <Input
                    id="brandWebsite"
                    type="url"
                    label={t("analytics.website")}
                    value={brandingForm.website}
                    onChange={(e) => setBrandingForm({ ...brandingForm, website: e.target.value })}
                    placeholder={EXAMPLE.siteUrl}
                  />
                </div>
                <Input
                  id="brandLocation"
                  label={t("jobs.fieldLocation")}
                  value={brandingForm.location}
                  onChange={(e) => setBrandingForm({ ...brandingForm, location: e.target.value })}
                  placeholder={t("analytics.locationPlaceholder")}
                />
                <div>
                  <label htmlFor="brandBio" className={labelClass}>
                    {t("analytics.bio")}
                  </label>
                  <textarea
                    id="brandBio"
                    className={`${controlClass} min-h-[150px]`}
                    value={brandingForm.bio}
                    onChange={(e) => setBrandingForm({ ...brandingForm, bio: e.target.value })}
                    placeholder={t("analytics.bioPlaceholder")}
                  />
                </div>
                <div className="rounded-2xl border border-line bg-surface-sunken p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-fg">
                        {FREE_MODE ? t("analytics.dashboardBranding") : t("analytics.premiumBranding")}
                      </p>
                      <p className="mt-1 text-sm text-fg-secondary">
                        {FREE_MODE ? t("analytics.brandingBodyFree") : t("analytics.brandingBody")}
                      </p>
                    </div>
                    {!FREE_MODE && (
                      <Badge variant={brandingEnabled ? "success" : "warning"}>
                        {brandingEnabled ? t("analytics.premiumActive") : t("analytics.premiumRequired")}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Input
                      id="brandLogo"
                      type="url"
                      label={t("analytics.logoUrl")}
                      value={brandingForm.logoUrl}
                      disabled={!brandingEnabled}
                      onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })}
                      placeholder={EXAMPLE.logoUrl}
                    />
                    <Input
                      id="brandPrimary"
                      label={t("analytics.primaryColor")}
                      type="color"
                      className="h-12 p-1"
                      value={brandingForm.brandColor}
                      disabled={!brandingEnabled}
                      onChange={(e) => setBrandingForm({ ...brandingForm, brandColor: e.target.value })}
                    />
                    <Input
                      id="brandAccent"
                      label={t("analytics.accentColor")}
                      type="color"
                      className="h-12 p-1"
                      value={brandingForm.accentColor}
                      disabled={!brandingEnabled}
                      onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                    />
                  </div>
                  {!brandingEnabled && !FREE_MODE && (
                    <Link
                      href={localizePath("/billing", locale)}
                      className="mt-3 inline-flex text-sm font-medium text-primary-text hover:underline"
                    >
                      {t("analytics.unlockBranding")}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" isLoading={savingBranding} disabled={savingBranding}>
                    {savingBranding ? t("common.saving") : t("analytics.saveBranding")}
                  </Button>
                  {brandingSaved && (
                    <span role="status" className="text-sm font-medium text-success">
                      {t("common.savedSuccessfully")}
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
