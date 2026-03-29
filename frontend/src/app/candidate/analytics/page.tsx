"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { JobCard } from "@/components/jobs/job-card";
import { TrustBadge } from "@/components/trust/trust-badge";

export default function CandidateAnalyticsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [profileViews, setProfileViews] = useState<ProfileViewsData | null>(null);
  const [funnel, setFunnel] = useState<ApplicationFunnel | null>(null);
  const [retentionSummary, setRetentionSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
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
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const maxWeeklyViews = profileViews
    ? Math.max(...profileViews.viewsByWeek.map((w) => w.count), 1)
    : 1;

  const totalRoleViews = profileViews
    ? Object.values(profileViews.viewerRoleBreakdown).reduce((a, b) => a + b, 0)
    : 0;

  const employerViews = profileViews?.viewerRoleBreakdown?.EMPLOYER ?? 0;
  const otherViews = totalRoleViews - employerViews;

  const funnelTotal = funnel
    ? funnel.totalApplied + funnel.reviewing + funnel.shortlisted + funnel.accepted
    : 0;

  const funnelSegments = funnel
    ? [
        { label: "Applied", count: funnel.totalApplied, color: "bg-gray-400" },
        { label: "Reviewing", count: funnel.reviewing, color: "bg-blue-500" },
        { label: "Shortlisted", count: funnel.shortlisted, color: "bg-yellow-500" },
        { label: "Accepted", count: funnel.accepted, color: "bg-emerald-500" },
      ]
    : [];
  const recommendations = retentionSummary?.recommendations ?? [];
  const digest = retentionSummary?.weeklyDigest;
  const journeys = retentionSummary?.journeys ?? [];
  const notificationBudgetRemaining = retentionSummary?.snapshot.notificationBudgetRemaining ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back Link */}
      <Link href="/candidate" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-6">
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile Analytics</h1>
        <p className="text-gray-600">Insights into your visibility, trusted matches, and retention momentum</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <>
          {retentionSummary && (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] mb-8">
              <Card className="border-amber-200 bg-amber-50/40">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Retention control tower</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Trusted jobs and verified employers are prioritized before AfriTalent nudges you.
                      </p>
                    </div>
                    <Link href="/candidate/preferences">
                      <Button variant="outline">Manage preferences</Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-4 gap-3 mb-5">
                    <div className="rounded-xl bg-white/90 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Saved searches</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{retentionSummary.snapshot.savedSearchCount}</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Trust score</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{retentionSummary.snapshot.trustScore}</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Live applications</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{retentionSummary.snapshot.openApplications}</p>
                    </div>
                    <div className="rounded-xl bg-white/90 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Nudges left</p>
                      <p className="mt-1 text-2xl font-semibold text-gray-900">{notificationBudgetRemaining}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {journeys.slice(0, 3).map((journey) => (
                      <div key={journey.key} className="rounded-xl border border-white/70 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{journey.title}</p>
                            <p className="mt-1 text-xs text-gray-600">{journey.description}</p>
                          </div>
                          <TrustBadge
                            label={journey.status}
                            variant={journey.status === "DONE" ? "success" : journey.status === "READY" ? "warning" : "info"}
                          />
                        </div>
                        <div className="mt-3">
                          <Link
                            href={journey.href}
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
                  <h2 className="text-lg font-semibold text-gray-900">Weekly digest preview</h2>
                  <p className="text-sm text-gray-600 mt-1">{digest?.headline}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Trusted roles</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{digest?.trustedJobCount ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Verified employers</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{digest?.verifiedEmployerCount ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Salary disclosed</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{digest?.salaryTransparentCount ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-3">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Visa-friendly</p>
                      <p className="mt-1 text-xl font-semibold text-gray-900">{digest?.visaFriendlyCount ?? 0}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-700">Freshness window</p>
                    <p className="mt-1 text-sm font-medium text-blue-900">{digest?.freshnessWindowLabel}</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {digest?.jobs.slice(0, 3).map((job) => (
                      <div key={job.id} className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{job.title}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              {job.employer.companyName} • {job.location}
                            </p>
                          </div>
                          {job.discovery?.trustedJob ? (
                            <TrustBadge label="Trusted job" variant="success" />
                          ) : (
                            <TrustBadge label="Fresh match" variant="info" />
                          )}
                        </div>
                      </div>
                    ))}
                    {digest && digest.jobs.length === 0 && (
                      <p className="text-sm text-gray-500">
                        Your next digest will fill in as you save searches and strengthen your profile trust signals.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Section 1: Profile Views */}
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            {/* Total Views */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Profile Views (Last 30 Days)
                </h3>
                <div className="text-4xl font-bold text-emerald-600 mb-1">
                  {profileViews?.totalViews ?? 0}
                </div>
                <p className="text-sm text-gray-500">total views</p>
              </CardContent>
            </Card>

            {/* Weekly Chart */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Weekly Views
                </h3>
                <div className="flex items-end gap-3 h-24">
                  {(profileViews?.viewsByWeek ?? []).slice(-4).map((week, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-emerald-500 rounded-t-md transition-all"
                        style={{
                          height: `${Math.max((week.count / maxWeeklyViews) * 100, 4)}%`,
                          minHeight: "4px",
                        }}
                      />
                      <span className="text-xs text-gray-500">{week.count}</span>
                      <span className="text-xs text-gray-400">W{i + 1}</span>
                    </div>
                  ))}
                  {(!profileViews?.viewsByWeek || profileViews.viewsByWeek.length === 0) && (
                    <div className="flex-1 text-center text-sm text-gray-400 self-center">
                      No data yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Viewer Role Breakdown */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Who&apos;s Viewing
                </h3>
                {totalRoleViews > 0 ? (
                  <>
                    <div className="flex h-6 rounded-full overflow-hidden bg-gray-100 mb-3">
                      {employerViews > 0 && (
                        <div
                          className="bg-emerald-500 transition-all"
                          style={{ width: `${(employerViews / totalRoleViews) * 100}%` }}
                        />
                      )}
                      {otherViews > 0 && (
                        <div
                          className="bg-blue-400 transition-all"
                          style={{ width: `${(otherViews / totalRoleViews) * 100}%` }}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                        <span className="text-gray-600">Employers: {employerViews}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="w-3 h-3 rounded-full bg-blue-400" />
                        <span className="text-gray-600">Others: {otherViews}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No views yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 2: Application Funnel */}
          {funnel && (
            <Card className="mb-8">
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-900">Application Funnel</h2>
              </CardHeader>
              <CardContent>
                {funnelTotal > 0 ? (
                  <>
                    <div className="flex h-10 rounded-full overflow-hidden bg-gray-100">
                      {funnelSegments.map((seg) =>
                        seg.count > 0 ? (
                          <div
                            key={seg.label}
                            className={`${seg.color} flex items-center justify-center text-white text-xs font-medium transition-all`}
                            style={{ width: `${(seg.count / funnelTotal) * 100}%` }}
                          >
                            {seg.count}
                          </div>
                        ) : null
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                      {funnelSegments.map((seg) => (
                        <div key={seg.label} className="flex items-center gap-2 text-sm text-gray-600">
                          <span className={`w-3 h-3 rounded-full ${seg.color}`} />
                          {seg.label}: {seg.count}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-3 h-3 rounded-full bg-red-500" />
                        Rejected: {funnel.rejected}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500 text-sm">No applications yet to show funnel data.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Section 3: Recommended Jobs */}
          <div className="mb-8">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Recommended Jobs</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Ranked by trust, fit, freshness, and employer credibility.
                </p>
              </div>
              <Link href="/candidate/preferences">
                <Button variant="outline">Tune alerts</Button>
              </Link>
            </div>
            {recommendations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-4xl mb-4">🎯</div>
                  <p className="text-gray-600 mb-4">Complete your profile to get personalized job recommendations.</p>
                  <Link href="/candidate/profile">
                    <Button>Complete Profile</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendations.map((job) => (
                  <div
                    key={job.id}
                    onClick={() =>
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
          </div>

          {/* Section 4: Resume Interest */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Resume Interest</h2>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">
                    {employerViews}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Employer Views</p>
                </div>
                <div className="h-12 w-px bg-gray-200" />
                <div>
                  <p className="text-sm text-gray-600">
                    {employerViews > 0
                      ? `${employerViews} employer${employerViews > 1 ? "s" : ""} viewed your profile. Keep your resume updated to attract more attention!`
                      : "No employer views yet. Optimize your profile and take skill assessments to increase visibility."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
