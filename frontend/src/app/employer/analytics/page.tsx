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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localizePath, useLocale } from "@/lib/i18n/client";

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

  const [analytics, setAnalytics] = useState<EmployerAnalytics | null>(null);
  const [advancedAnalytics, setAdvancedAnalytics] = useState<EmployerAdvancedAnalytics | null>(null);
  const [, setBranding] = useState<EmployerBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brandingForm, setBrandingForm] = useState({
    companyName: "",
    website: "",
    location: "",
    bio: "",
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
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranding(true);
    setBrandingSaved(false);
    try {
      const updated = await employerAnalytics.updateBranding(brandingForm);
      setBranding(updated);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save branding");
    } finally {
      setSavingBranding(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const roi = advancedAnalytics?.roi;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] bg-[linear-gradient(135deg,#111827_0%,#0f766e_55%,#ecfeff_140%)] px-6 py-8 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
              Employer ROI analytics
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              See what turns trust into qualified applicants
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
              Track the full path from visibility to shortlist so you can improve job quality, verification strength, and paid-plan ROI with real signals.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={localizePath("/employer/onboarding", locale)}>
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 hover:text-white">
                Guided onboarding
              </Button>
            </Link>
            <Link href={localizePath("/billing", locale)}>
              <Button>Compare plans</Button>
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-700">
          {error}
        </div>
      ) : analytics && advancedAnalytics ? (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Impressions",
                value: roi?.impressions ?? 0,
                helper: "Job visibility across candidate discovery",
              },
              {
                label: "Clicks",
                value: roi?.clicks ?? 0,
                helper: `${roi?.clickToApplyRate ?? 0}% click-to-apply rate`,
              },
              {
                label: "Qualified applicants",
                value: roi?.qualifiedApplicants ?? analytics.qualifiedApplicants,
                helper: `${roi?.shortlistRate ?? analytics.shortlistRate}% shortlist rate`,
              },
              {
                label: "Time to first qualified shortlist",
                value:
                  roi?.timeToFirstQualifiedApplicantHours == null
                    ? "Pending"
                    : `${roi.timeToFirstQualifiedApplicantHours}h`,
                helper: "Measured from the first approved job",
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
                  <p className="mt-2 text-sm text-gray-600">{stat.helper}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <EmployerMilestones
            milestones={analytics.activationMilestones}
            activationState={analytics.activationState}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Funnel conversion
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">From published job to accepted candidate</h2>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {advancedAnalytics.funnel.map((step) => (
                    <div key={step.step} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {step.step.replace(/_/g, " ")}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{step.count}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {step.conversionFromPrevious == null
                          ? "Baseline"
                          : `${step.conversionFromPrevious}% from previous step`}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-blue-200 bg-blue-50/70">
                <CardHeader>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                    Verification impact
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-blue-950">
                    {analytics.verificationImpact.qualifiedApplicantRate}% of applicants are reaching shortlist quality
                  </h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-blue-900">{analytics.verificationImpact.insight}</p>
                </CardContent>
              </Card>

              {roi && (
                <Card className="border-slate-200 bg-slate-950 text-white">
                  <CardHeader>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                      Upgrade framing
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{roi.upgradeJourney.headline}</h2>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-300">{roi.upgradeJourney.body}</p>
                    <p className="mt-4 text-sm text-slate-200">
                      Average job quality: {roi.averageJobQuality}
                    </p>
                    <div className="mt-4">
                      <Link href={localizePath("/billing", locale)}>
                        <Button size="sm">{roi.upgradeJourney.ctaLabel}</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Job performance
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">Which postings are producing qualified signal</h2>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-sm text-gray-500">
                      <th className="pb-3 font-medium">Job</th>
                      <th className="pb-3 font-medium">Impressions</th>
                      <th className="pb-3 font-medium">Clicks</th>
                      <th className="pb-3 font-medium">Applies</th>
                      <th className="pb-3 font-medium">Qualified</th>
                      <th className="pb-3 font-medium">CTR</th>
                      <th className="pb-3 font-medium">Shortlist rate</th>
                      <th className="pb-3 font-medium">Quality</th>
                      <th className="pb-3 font-medium">Time to first app</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {advancedAnalytics.postingPerformance.map((row) => (
                      <tr key={row.jobId}>
                        <td className="py-3 text-sm font-medium text-gray-900">{row.title}</td>
                        <td className="py-3 text-sm text-gray-600">{row.impressions}</td>
                        <td className="py-3 text-sm text-gray-600">{row.clicks}</td>
                        <td className="py-3 text-sm text-gray-600">{row.applicationCount}</td>
                        <td className="py-3 text-sm text-gray-600">{row.qualifiedApplicants}</td>
                        <td className="py-3 text-sm text-gray-600">{row.ctr}%</td>
                        <td className="py-3 text-sm text-gray-600">{row.shortlistRate}%</td>
                        <td className="py-3 text-sm text-gray-600">{row.qualityScore}</td>
                        <td className="py-3 text-sm text-gray-600">
                          {row.timeToFirstApplicationHours == null ? "N/A" : `${row.timeToFirstApplicationHours}h`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Candidate pipeline
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">How quickly applications are moving</h2>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Pending", advancedAnalytics.candidatePipeline.pending],
                    ["Reviewing", advancedAnalytics.candidatePipeline.reviewing],
                    ["Shortlisted", advancedAnalytics.candidatePipeline.shortlisted],
                    ["Accepted", advancedAnalytics.candidatePipeline.accepted],
                    ["Rejected", advancedAnalytics.candidatePipeline.rejected],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{value as number}</p>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-2 xl:col-span-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Avg review time
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-900">
                      {advancedAnalytics.candidatePipeline.avgReviewTimeHours == null
                        ? "N/A"
                        : `${advancedAnalytics.candidatePipeline.avgReviewTimeHours}h`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Recent applications
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">Fresh candidate activity</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.recentApplications.length === 0 ? (
                    <p className="text-sm text-gray-600">Applications will appear here once candidates start applying.</p>
                  ) : (
                    analytics.recentApplications.map((app) => (
                      <div key={app.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{app.candidate.name}</p>
                            <p className="text-sm text-gray-600">{app.job.title}</p>
                          </div>
                          <Badge variant={statusVariants[app.status] || "default"}>
                            {app.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">
                          Applied {new Date(app.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                Employer brand
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">Strengthen the company story candidates see</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveBranding} className="max-w-3xl space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Company name"
                    value={brandingForm.companyName}
                    onChange={(e) => setBrandingForm({ ...brandingForm, companyName: e.target.value })}
                    placeholder="Your company name"
                  />
                  <Input
                    label="Website"
                    value={brandingForm.website}
                    onChange={(e) => setBrandingForm({ ...brandingForm, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <Input
                  label="Location"
                  value={brandingForm.location}
                  onChange={(e) => setBrandingForm({ ...brandingForm, location: e.target.value })}
                  placeholder="City, Country"
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
                  <textarea
                    className="min-h-[150px] w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                    value={brandingForm.bio}
                    onChange={(e) => setBrandingForm({ ...brandingForm, bio: e.target.value })}
                    placeholder="Tell candidates about the company, product, team, and why the role matters."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={savingBranding}>
                    {savingBranding ? "Saving..." : "Save branding"}
                  </Button>
                  {brandingSaved && (
                    <span className="text-sm font-medium text-emerald-600">Saved successfully</span>
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
