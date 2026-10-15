"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  candidateAnalytics,
  CandidateRetentionSummaryResponse,
  ProfileViewsData,
  ApplicationFunnel,
} from "@/lib/api";
import { candidateRetentionEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { JobCard } from "@/components/jobs/job-card";
import { TrustBadge } from "@/components/trust/trust-badge";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidatePageHeader,
  CandidateSpinner,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-4">
      <p className="text-xs uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

export default function CandidateAnalyticsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [profileViews, setProfileViews] = useState<ProfileViewsData | null>(null);
  const [funnel, setFunnel] = useState<ApplicationFunnel | null>(null);
  const [retentionSummary, setRetentionSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const href = (path: string) => localizePath(path, locale);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const load = useCallback(() => {
    Promise.all([
      candidateAnalytics.profileViews(),
      candidateAnalytics.applicationFunnel(),
      candidateAnalytics.retentionSummary(),
    ])
      .then(([views, funnelData, retention]) => {
        setProfileViews(views);
        setFunnel(funnelData);
        setRetentionSummary(retention);
        candidateRetentionEvents.summaryViewed({
          surface: "candidate_analytics",
          recommendation_count: retention.recommendations.length,
          saved_search_count: retention.snapshot.savedSearchCount,
        });
        retention.experiments.forEach((experiment) => {
          candidateRetentionEvents.experimentExposed({
            surface: "candidate_analytics",
            experiment_key: experiment.key,
            variant: experiment.variant,
          });
        });
        candidateRetentionEvents.weeklyDigestViewed({
          surface: "candidate_analytics",
          digest_job_count: retention.weeklyDigest.jobs.length,
          verified_employer_count: retention.weeklyDigest.verifiedEmployerCount,
          freshness_window: retention.weeklyDigest.freshnessWindowLabel,
        });
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") load();
  }, [user, load]);

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const maxWeeklyViews = profileViews ? Math.max(...profileViews.viewsByWeek.map((w) => w.count), 1) : 1;
  const totalRoleViews = profileViews
    ? Object.values(profileViews.viewerRoleBreakdown).reduce((a, b) => a + b, 0)
    : 0;
  const employerViews = profileViews?.viewerRoleBreakdown?.EMPLOYER ?? 0;
  const otherViews = totalRoleViews - employerViews;

  const funnelTotal = funnel ? funnel.totalApplied + funnel.reviewing + funnel.shortlisted + funnel.accepted : 0;
  const funnelSegments = funnel
    ? [
        { label: t("apps.pipeline.applied"), count: funnel.totalApplied, color: "bg-line-strong" },
        { label: t("apps.pipeline.reviewing"), count: funnel.reviewing, color: "bg-info" },
        { label: t("apps.pipeline.shortlisted"), count: funnel.shortlisted, color: "bg-warning" },
        { label: t("apps.pipeline.accepted"), count: funnel.accepted, color: "bg-success" },
      ]
    : [];
  const recommendations = retentionSummary?.recommendations ?? [];
  const digest = retentionSummary?.weeklyDigest;
  const journeys = retentionSummary?.journeys ?? [];
  const notificationBudgetRemaining = retentionSummary?.snapshot.notificationBudgetRemaining ?? 0;
  const weeks = (profileViews?.viewsByWeek ?? []).slice(-4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("an.title")} description={t("an.subtitle")} />

      {error ? (
        <CandidateLoadError
          className="mb-6"
          error={error}
          subject={t("ui.subject.analytics")}
          onRetry={() => {
            setLoading(true);
            setError(null);
            load();
          }}
        />
      ) : null}

      {loading ? (
        <CandidateSpinner className="py-24" />
      ) : error ? null : (
        <>
          {retentionSummary && (
            <div className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-fg">{t("an.momentum.title")}</h2>
                      <p className="mt-1 text-sm text-fg-secondary">{t("an.momentum.body")}</p>
                    </div>
                    <Link href={href("/candidate/preferences")} className="shrink-0">
                      <Button variant="outline" size="sm">
                        {t("an.managePrefs")}
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetricTile label={t("an.snap.savedSearches")} value={fmt.number(retentionSummary.snapshot.savedSearchCount)} />
                    <MetricTile label={t("an.snap.trustScore")} value={fmt.number(retentionSummary.snapshot.trustScore)} />
                    <MetricTile label={t("an.snap.liveApps")} value={fmt.number(retentionSummary.snapshot.openApplications)} />
                    <MetricTile label={t("an.snap.nudgesLeft")} value={fmt.number(notificationBudgetRemaining)} />
                  </div>
                  <div className="space-y-3">
                    {journeys.slice(0, 3).map((journey) => (
                      <div key={journey.key} className="rounded-xl border border-line bg-surface-sunken p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-fg">{journey.title}</p>
                            <p className="mt-1 text-xs text-fg-secondary">{journey.description}</p>
                          </div>
                          <TrustBadge
                            label={enumLabel(t, "dash.journey", journey.status)}
                            variant={journey.status === "DONE" ? "success" : journey.status === "READY" ? "warning" : "info"}
                          />
                        </div>
                        <div className="mt-3">
                          <Link
                            href={href(journey.href)}
                            onClick={() =>
                              candidateRetentionEvents.journeyCtaClicked({
                                surface: "candidate_analytics",
                                journey_key: journey.key,
                                status: journey.status,
                              })
                            }
                          >
                            <Button size="sm" variant={journey.status === "DONE" ? "ghost" : "outline"}>
                              {journey.ctaLabel}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold text-fg">{t("an.digest.title")}</h2>
                  <p className="mt-1 text-sm text-fg-secondary">{digest?.headline}</p>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <MetricTile label={t("an.digest.trustedRoles")} value={fmt.number(digest?.trustedJobCount ?? 0)} />
                    <MetricTile label={t("an.digest.verifiedEmployers")} value={fmt.number(digest?.verifiedEmployerCount ?? 0)} />
                    <MetricTile label={t("an.digest.salaryDisclosed")} value={fmt.number(digest?.salaryTransparentCount ?? 0)} />
                    <MetricTile label={t("an.digest.visaFriendly")} value={fmt.number(digest?.visaFriendlyCount ?? 0)} />
                  </div>
                  {digest?.freshnessWindowLabel ? (
                    <div className="rounded-xl border border-info-line bg-info-soft p-4">
                      <p className="text-xs uppercase tracking-wide text-info">{t("an.digest.freshness")}</p>
                      <p className="mt-1 text-sm font-medium text-fg">{digest.freshnessWindowLabel}</p>
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {digest?.jobs.slice(0, 3).map((job) => (
                      <div key={job.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-fg">{job.title}</p>
                            <p className="mt-1 text-xs text-fg-secondary">
                              {[job.employer.companyName, job.location].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          {job.discovery?.trustedJob ? (
                            <TrustBadge label={t("an.digest.trustedJob")} variant="success" />
                          ) : (
                            <TrustBadge label={t("an.digest.freshMatch")} variant="info" />
                          )}
                        </div>
                      </div>
                    ))}
                    {digest && digest.jobs.length === 0 && <p className="text-sm text-fg-muted">{t("an.digest.empty")}</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="mb-8 grid gap-6 lg:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("an.views.total")}</h3>
                <div className="mb-1 text-4xl font-semibold tabular-nums text-primary-text">
                  {fmt.number(profileViews?.totalViews ?? 0)}
                </div>
                <p className="text-sm text-fg-muted">{t("an.views.totalLabel")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("an.views.weekly")}</h3>
                {weeks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-fg-muted">{t("an.views.noData")}</p>
                ) : (
                  <ul className="flex h-28 items-end gap-3">
                    {weeks.map((week, i) => (
                      <li
                        key={i}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                        aria-label={t("an.views.weekBar", { n: i + 1, count: week.count })}
                      >
                        <span className="text-xs tabular-nums text-fg-secondary">{fmt.number(week.count)}</span>
                        <div
                          aria-hidden="true"
                          className="w-full rounded-t-md bg-primary transition-all"
                          style={{ height: `${Math.max((week.count / maxWeeklyViews) * 70, 4)}%` }}
                        />
                        <span className="text-xs text-fg-muted">{t("an.views.weekShort", { n: i + 1 })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("an.views.who")}</h3>
                {totalRoleViews > 0 ? (
                  <>
                    <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      {employerViews > 0 && (
                        <div className="bg-primary transition-all" style={{ width: `${(employerViews / totalRoleViews) * 100}%` }} />
                      )}
                      {otherViews > 0 && (
                        <div className="bg-info transition-all" style={{ width: `${(otherViews / totalRoleViews) * 100}%` }} />
                      )}
                    </div>
                    <ul className="space-y-1">
                      <li className="flex items-center gap-2 text-sm text-fg-secondary">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary" />
                        {t("an.views.employers", { count: fmt.number(employerViews) })}
                      </li>
                      <li className="flex items-center gap-2 text-sm text-fg-secondary">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-info" />
                        {t("an.views.others", { count: fmt.number(otherViews) })}
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-fg-muted">{t("an.views.none")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {funnel && (
            <Card className="mb-8">
              <CardHeader>
                <h2 className="text-lg font-semibold text-fg">{t("an.funnel.title")}</h2>
              </CardHeader>
              <CardContent>
                {funnelTotal > 0 ? (
                  <>
                    <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      {funnelSegments.map((seg) =>
                        seg.count > 0 ? (
                          <div
                            key={seg.label}
                            className={`${seg.color} transition-all`}
                            style={{ width: `${(seg.count / funnelTotal) * 100}%` }}
                          />
                        ) : null,
                      )}
                    </div>
                    <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                      {funnelSegments.map((seg) => (
                        <li key={seg.label} className="flex items-center gap-2 text-sm text-fg-secondary">
                          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
                          {t("apps.pipeline.segment", { label: seg.label, count: fmt.number(seg.count) })}
                        </li>
                      ))}
                      <li className="flex items-center gap-2 text-sm text-fg-secondary">
                        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-danger" />
                        {t("apps.pipeline.segment", { label: t("an.funnel.rejected"), count: fmt.number(funnel.rejected) })}
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-fg-muted">{t("an.funnel.empty")}</p>
                )}
              </CardContent>
            </Card>
          )}

          <section className="mb-8" aria-labelledby="analytics-reco-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="analytics-reco-heading" className="text-lg font-semibold text-fg">
                  {t("an.reco.title")}
                </h2>
                <p className="mt-1 text-sm text-fg-secondary">{t("an.reco.subtitle")}</p>
              </div>
              <Link href={href("/candidate/preferences")}>
                <Button variant="outline" size="sm">
                  {t("an.reco.tune")}
                </Button>
              </Link>
            </div>
            {recommendations.length === 0 ? (
              <EmptyState
                icon={<Target className="h-6 w-6" />}
                title={t("an.reco.emptyTitle")}
                description={t("an.reco.empty")}
                primaryAction={{ label: t("dash.action.profile.cta"), href: href("/candidate/profile") }}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map((job) => (
                  <div
                    key={job.id}
                    onClickCapture={() =>
                      candidateRetentionEvents.recommendationClicked({
                        surface: "candidate_analytics",
                        job_id: job.id,
                        trusted_job: job.discovery?.trustedJob ?? false,
                      })
                    }
                  >
                    <JobCard job={job} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-fg">{t("an.interest.title")}</h2>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="text-center">
                  <div className="text-3xl font-semibold tabular-nums text-primary-text">{fmt.number(employerViews)}</div>
                  <p className="mt-1 text-sm text-fg-muted">{t("an.interest.employerViews")}</p>
                </div>
                <div aria-hidden="true" className="hidden h-12 w-px bg-line sm:block" />
                <p className="text-sm text-fg-secondary">
                  {employerViews > 0
                    ? t("an.interest.some", { count: fmt.number(employerViews) })
                    : t("an.interest.none")}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
