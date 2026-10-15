"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  EmployerAnalytics,
  EmployerOnboarding,
  EmployerTrustDashboard,
  Job,
  employerAnalytics,
  jobs,
  trust,
} from "@/lib/api";
import * as Tabs from "@radix-ui/react-tabs";
import { EmployerActivationChecklist } from "@/components/employer/activation-checklist";
import { EmployerMilestones } from "@/components/employer/activation-milestones";
import {
  EmployerHero,
  EmployerLoadError,
  EmptyPanel,
  Eyebrow,
  Notice,
  PageSpinner,
  Spinner,
  StatCard,
  StatusPill,
  heroLinkClass,
} from "@/components/employer/employer-ui";
import { TrustBadge } from "@/components/trust/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { FREE_MODE } from "@/lib/free-mode";

const statusTones: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
};

const TAB_ITEMS = ["overview", "jobs"] as const;
type DashboardTab = (typeof TAB_ITEMS)[number];

export default function EmployerDashboard() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { t, tn, tv, ts, fmt } = useEmployerI18n();

  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [onboarding, setOnboarding] = useState<EmployerOnboarding | null>(null);
  const [trustDashboard, setTrustDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [analytics, setAnalytics] = useState<EmployerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [jobActionError, setJobActionError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<DashboardTab>("overview");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadDashboard = useCallback(() => {
    Promise.all([
      jobs.myJobs(),
      employerAnalytics.onboarding().catch(() => null),
      employerAnalytics.stats().catch(() => null),
      trust.employerSummary().catch(() => null),
    ])
      .then(([jobsData, onboardingData, analyticsData, trustData]) => {
        setMyJobs(jobsData);
        setOnboarding(onboardingData);
        setAnalytics(analyticsData);
        setTrustDashboard(trustData);
      })
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, []);

  const retryLoadDashboard = () => {
    setLoading(true);
    setLoadError(null);
    loadDashboard();
  };

  const isEmployer = user?.role === "EMPLOYER";
  useEffect(() => {
    if (!isEmployer) {
      return;
    }
    loadDashboard();
  }, [isEmployer, loadDashboard]);

  // Close (unpublish) or reopen a job. Reopening re-runs trust checks, so the
  // returned status may be PENDING_REVIEW rather than PUBLISHED.
  const setJobOpen = async (jobId: string, open: boolean) => {
    setStatusUpdatingId(jobId);
    setJobActionError(null);
    try {
      const updated = await jobs.update(jobId, { status: open ? "PUBLISHED" : "DRAFT" });
      setMyJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, status: updated.status } : job)));
    } catch (err) {
      setJobActionError(err instanceof Error && err.message ? err.message : t("dash.jobStatusFailed"));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  const publishedJobs = analytics?.publishedJobs ?? myJobs.filter((job) => job.status === "PUBLISHED").length;
  const totalApplications = analytics?.totalApplications ?? myJobs.reduce((sum, job) => sum + (job._count?.applications || 0), 0);
  const companyName = user.employer?.companyName;
  const trustEligible = Boolean(trustDashboard?.trust.postingEligibility);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <EmployerHero
        eyebrow={t("dash.eyebrow")}
        title={companyName ? t("dash.titleNamed", { company: companyName }) : t("dash.title")}
        description={t("dash.subtitle")}
        aside={
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[340px]">
            <Link href={localizePath(onboarding?.nextAction.href || "/employer/onboarding", locale)} className="sm:col-span-2">
              <Button className="w-full" size="lg">
                {onboarding?.nextAction.ctaLabel ? ts(onboarding.nextAction.ctaLabel) : t("dash.continueOnboarding")}
              </Button>
            </Link>
            <Link href={localizePath("/employer/jobs/new", locale)} className={heroLinkClass}>
              {t("dash.postJob")}
            </Link>
            <Link href={localizePath("/employer/talent", locale)} className={heroLinkClass}>
              {t("common.searchTalent")}
            </Link>
            <Link href={localizePath("/employer/analytics", locale)} className={heroLinkClass}>
              {t("common.viewRoi")}
            </Link>
            <Link href={localizePath("/employer/integrations", locale)} className={heroLinkClass}>
              {t("dash.atsIntegrations")}
            </Link>
          </div>
        }
      >
        <div className="mt-5 flex flex-wrap gap-2">
          {trustDashboard && (
            <TrustBadge
              label={ts(trustDashboard.trust.badge)}
              riskLevel={trustDashboard.trust.riskLevel}
              variant="success"
            />
          )}
          {trustDashboard?.trust.verifiedDomain && (
            <TrustBadge label={t("dash.domainVerified", { domain: trustDashboard.trust.verifiedDomain })} variant="info" />
          )}
          {onboarding && (
            <TrustBadge
              label={ts(onboarding.activationState.label)}
              variant={onboarding.activationState.state === "activated" ? "success" : "info"}
            />
          )}
        </div>
      </EmployerHero>

      {loadError ? (
        <EmployerLoadError className="mt-8" subject={t("dash.loadSubject")} onRetry={retryLoadDashboard} />
      ) : null}

      <Tabs.Root
        className="mt-8"
        value={selectedTab}
        orientation="horizontal"
        onValueChange={(val) => setSelectedTab(val as DashboardTab)}
      >
        <div className="mb-8 border-b border-line">
          <Tabs.List className="-mb-px flex gap-8 overflow-x-auto hide-scrollbar" aria-label={t("dash.tabsLabel")}>
            {TAB_ITEMS.map((item) => (
              <Tabs.Trigger
                key={item}
                className="whitespace-nowrap border-b-2 border-transparent px-1 py-4 text-sm font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:border-primary-text data-[state=active]:text-primary-text"
                value={item}
              >
                {item === "overview" ? t("dash.tabOverview") : t("dash.tabJobs", { count: myJobs.length })}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="overview" className="focus-visible:outline-none">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("stats.publishedJobs")}
              value={fmt.number(publishedJobs)}
              helper={
                onboarding?.milestones.firstApprovedJobAt
                  ? t("dash.firstApproved", { date: fmt.date(onboarding.milestones.firstApprovedJobAt) })
                  : t("dash.noApprovedJobs")
              }
            />
            <StatCard
              label={t("stats.applications")}
              value={fmt.number(totalApplications)}
              helper={analytics ? t("stats.shortlistRate", { rate: analytics.shortlistRate }) : t("dash.monitorConversion")}
            />
            <StatCard
              label={t("stats.qualifiedApplicants")}
              value={fmt.number(analytics?.qualifiedApplicants ?? onboarding?.stats.qualifiedApplicants ?? 0)}
              helper={t("dash.qualifiedHelper")}
            />
            <StatCard
              accent
              label={t("stats.timeToShortlist")}
              value={
                analytics?.timeToFirstQualifiedApplicantHours == null
                  ? t("common.pending")
                  : t("common.hours", { hours: analytics.timeToFirstQualifiedApplicantHours })
              }
              helper={t("stats.timeToShortlistHelper")}
            />
          </div>

          {loading && !onboarding && (
            <div className="mt-10 flex justify-center">
              <Spinner />
            </div>
          )}

          {onboarding && (
            <div className="mt-10 space-y-8">
              <EmployerMilestones milestones={onboarding.milestones} activationState={onboarding.activationState} />

              <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
                <EmployerActivationChecklist
                  checklist={onboarding.checklist}
                  completionPct={onboarding.completionPct}
                  currentStep={onboarding.currentStep}
                  nextAction={onboarding.nextAction}
                />

                <div className="space-y-6">
                  <Card className={trustEligible ? "border-success-line" : "border-warning-line"}>
                    <CardHeader>
                      <Eyebrow>{t("dash.trustStatus")}</Eyebrow>
                      <h2 className="mt-2 text-lg font-semibold text-fg">
                        {trustEligible ? t("dash.postingUnlocked") : t("dash.postingBlocked")}
                      </h2>
                    </CardHeader>
                    <CardContent>
                      {trustDashboard ? (
                        <>
                          <p className="text-sm text-fg-secondary">
                            {t("dash.scores", {
                              authenticity: trustDashboard.trust.authenticityScore,
                              risk: trustDashboard.trust.riskScore,
                            })}
                          </p>
                          {trustDashboard.trust.warnings.length > 0 && (
                            <ul className="mt-3 space-y-2 text-sm text-fg-secondary">
                              {trustDashboard.trust.warnings.map((warning) => (
                                <li key={warning} className="flex gap-2">
                                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                                  <span>{ts(warning)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-4">
                            <Link href={localizePath("/employer/trust", locale)}>
                              <Button className="w-full" variant={trustEligible ? "outline" : "primary"}>
                                {trustEligible ? t("dash.strengthenTrust") : t("common.completeVerification")}
                              </Button>
                            </Link>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-fg-secondary">{t("dash.trustUnavailable")}</p>
                      )}
                    </CardContent>
                  </Card>

                  {!FREE_MODE && (
                    <Card>
                      <CardHeader>
                        <Eyebrow className="text-primary-text">{t("dash.upgradeJourney")}</Eyebrow>
                        <h2 className="mt-2 text-lg font-semibold text-fg">{ts(onboarding.upgradeJourney.headline)}</h2>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-fg-secondary">{ts(onboarding.upgradeJourney.body)}</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {onboarding.upgradeJourney.ctaLabel && (
                            <Link href={localizePath("/billing", locale)}>
                              <Button size="sm">{ts(onboarding.upgradeJourney.ctaLabel)}</Button>
                            </Link>
                          )}
                          <Link href={localizePath("/employer/talent", locale)}>
                            <Button size="sm" variant="outline">
                              {t("common.searchTalent")}
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {analytics && (
                    <Card className="border-info-line">
                      <CardHeader>
                        <Eyebrow className="text-info">{t("impact.eyebrow")}</Eyebrow>
                        <h2 className="mt-2 text-lg font-semibold text-fg">
                          {t("impact.title", { rate: analytics.verificationImpact.qualifiedApplicantRate })}
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
                  )}
                </div>
              </div>
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="jobs" className="focus-visible:outline-none">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Eyebrow>{t("dash.jobsEyebrow")}</Eyebrow>
                  <h2 className="mt-2 text-xl font-semibold text-fg">{t("dash.jobsTitle")}</h2>
                </div>
                <Link href={localizePath("/employer/jobs/new", locale)}>
                  <Button>{t("dash.postNewJob")}</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : loadError ? (
                <EmployerLoadError subject={t("dash.loadJobsSubject")} onRetry={retryLoadDashboard} />
              ) : myJobs.length === 0 ? (
                <EmptyPanel title={t("dash.emptyTitle")} description={t("dash.emptyBody")}>
                  <Link href={localizePath("/employer/onboarding", locale)}>
                    <Button variant="outline">{t("dash.openOnboarding")}</Button>
                  </Link>
                  <Link href={localizePath("/employer/jobs/new", locale)}>
                    <Button>{t("common.createFirstJob")}</Button>
                  </Link>
                </EmptyPanel>
              ) : (
                <div className="space-y-4">
                  {jobActionError && (
                    <Notice tone="danger" role="alert">
                      {jobActionError}
                    </Notice>
                  )}
                  <ul className="space-y-4">
                    {myJobs.map((job) => {
                      const applicationCount = job._count?.applications || 0;
                      return (
                        <li
                          key={job.id}
                          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-5 transition-shadow hover:shadow-card lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-fg">{job.title}</h3>
                              <StatusPill tone={statusTones[job.status] ?? "neutral"}>{tv("status.job", job.status)}</StatusPill>
                              {job.trust?.companyReviewed && <TrustBadge label={t("dash.companyReviewed")} variant="info" />}
                              {job.trust?.jobQualityChecked && <TrustBadge label={t("dash.qualityChecked")} variant="success" />}
                              {job.trust?.newEmployerCaution && (
                                <TrustBadge label={t("dash.newEmployerCaution")} riskLevel="MEDIUM" variant="warning" />
                              )}
                            </div>
                            <p className="mt-2 text-sm text-fg-secondary">
                              {[job.location, tv("opt.jobType", job.type), tv("opt.seniority", job.seniority)]
                                .filter(Boolean)
                                .join(" • ")}
                            </p>
                            <p className="mt-1 text-sm text-fg-muted">
                              {tn("dash.applicationCount", applicationCount)} •{" "}
                              {t("dash.createdOn", { date: fmt.date(job.createdAt) })}
                            </p>
                            {job.trust?.guidance && <p className="mt-3 text-sm text-fg-secondary">{ts(job.trust.guidance)}</p>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(job.status === "PUBLISHED" || applicationCount > 0) && (
                              <Link href={localizePath(`/employer/jobs/${job.id}/applications`, locale)}>
                                <Button size="sm">{t("dash.viewApplications")}</Button>
                              </Link>
                            )}
                            <Link href={localizePath(`/employer/jobs/${job.id}/edit`, locale)}>
                              <Button size="sm" variant="outline">
                                {t("common.edit")}
                              </Button>
                            </Link>
                            {job.status === "PUBLISHED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={statusUpdatingId === job.id}
                                onClick={() => void setJobOpen(job.id, false)}
                              >
                                {statusUpdatingId === job.id ? t("dash.closing") : t("dash.closeJob")}
                              </Button>
                            )}
                            {job.status === "DRAFT" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={statusUpdatingId === job.id}
                                onClick={() => void setJobOpen(job.id, true)}
                              >
                                {statusUpdatingId === job.id ? t("dash.reopening") : t("dash.reopenJob")}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
