"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  candidateAnalytics,
  ProfileViewsData,
  ApplicationFunnel,
  Job,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CandidateAnalyticsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [profileViews, setProfileViews] = useState<ProfileViewsData | null>(null);
  const [funnel, setFunnel] = useState<ApplicationFunnel | null>(null);
  const [recommendations, setRecommendations] = useState<Job[]>([]);
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
        candidateAnalytics.recommendations(),
      ])
        .then(([views, funnelData, recs]) => {
          setProfileViews(views);
          setFunnel(funnelData);
          setRecommendations(recs);
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
        <p className="text-gray-600">Insights into your profile visibility and job matches</p>
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
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommended Jobs</h2>
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
                  <Card key={job.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <Link
                        href={`/jobs/${job.slug}`}
                        className="text-lg font-semibold text-gray-900 hover:text-emerald-600 line-clamp-1"
                      >
                        {job.title}
                      </Link>
                      <p className="text-sm text-gray-600 mt-1">
                        {job.employer?.companyName}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {job.location}
                        {job.type && ` • ${job.type}`}
                      </p>
                      {job.tags && job.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {job.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <Link href={`/jobs/${job.slug}`}>
                          <Button size="sm" variant="outline">View Job</Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
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
