"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  employerAnalytics,
  EmployerAnalytics,
  EmployerBranding,
  EmployerAdvancedAnalytics,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [analytics, setAnalytics] = useState<EmployerAnalytics | null>(null);
  const [advancedAnalytics, setAdvancedAnalytics] = useState<EmployerAdvancedAnalytics | null>(null);
  const [, setBranding] = useState<EmployerBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Branding form
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
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
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
    }
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
      console.error("Failed to save branding:", err);
    } finally {
      setSavingBranding(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">Track your hiring performance and manage your brand</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8">{error}</div>
      ) : analytics ? (
        <>
          {/* Stat Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-emerald-600 mb-1">
                  {analytics.totalJobs}
                </div>
                <div className="text-gray-600">Total Jobs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {analytics.publishedJobs}
                </div>
                <div className="text-gray-600">Published Jobs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {analytics.totalApplications}
                </div>
                <div className="text-gray-600">Total Applications</div>
              </CardContent>
            </Card>
          </div>

          {/* Application Status Breakdown */}
          {analytics.applicationsByStatus && Object.keys(analytics.applicationsByStatus).length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">
                  Applications by Status
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(analytics.applicationsByStatus).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <Badge variant={statusVariants[status] || "default"}>
                        {status.replace("_", " ")}
                      </Badge>
                      <span className="text-sm font-medium text-gray-700">
                        {count as number}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {advancedAnalytics && (
            <>
              <Card className="mb-8">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-gray-900">Hiring Funnel</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {advancedAnalytics.funnel.map((step) => (
                      <div
                        key={step.step}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {step.step.replace(/_/g, " ")}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-gray-900">{step.count}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {step.conversionFromPrevious === null
                            ? "Baseline"
                            : `${step.conversionFromPrevious}% from previous step`}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="mb-8">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-gray-900">Posting Performance</h2>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="pb-3 text-sm font-medium text-gray-500">Job</th>
                          <th className="pb-3 text-sm font-medium text-gray-500">Applications</th>
                          <th className="pb-3 text-sm font-medium text-gray-500">Shortlist Rate</th>
                          <th className="pb-3 text-sm font-medium text-gray-500">Acceptance Rate</th>
                          <th className="pb-3 text-sm font-medium text-gray-500">Time to First App</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {advancedAnalytics.postingPerformance.slice(0, 10).map((row) => (
                          <tr key={row.jobId}>
                            <td className="py-3 text-sm text-gray-900">{row.title}</td>
                            <td className="py-3 text-sm text-gray-600">{row.applicationCount}</td>
                            <td className="py-3 text-sm text-gray-600">{row.shortlistRate}%</td>
                            <td className="py-3 text-sm text-gray-600">{row.acceptanceRate}%</td>
                            <td className="py-3 text-sm text-gray-600">
                              {row.timeToFirstApplicationHours === null
                                ? "N/A"
                                : `${row.timeToFirstApplicationHours}h`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className="mb-8">
                <CardHeader>
                  <h2 className="text-xl font-semibold text-gray-900">Candidate Pipeline Metrics</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Total", advancedAnalytics.candidatePipeline.total],
                      ["Pending", advancedAnalytics.candidatePipeline.pending],
                      ["Reviewing", advancedAnalytics.candidatePipeline.reviewing],
                      ["Shortlisted", advancedAnalytics.candidatePipeline.shortlisted],
                      ["Accepted", advancedAnalytics.candidatePipeline.accepted],
                      ["Rejected", advancedAnalytics.candidatePipeline.rejected],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">{value as number}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 lg:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        Average Review Time
                      </p>
                      <p className="mt-1 text-xl font-bold text-emerald-900">
                        {advancedAnalytics.candidatePipeline.avgReviewTimeHours === null
                          ? "N/A"
                          : `${advancedAnalytics.candidatePipeline.avgReviewTimeHours}h`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Recent Applications */}
          {analytics.recentApplications && analytics.recentApplications.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Recent Applications</h2>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="pb-3 text-sm font-medium text-gray-500">Candidate</th>
                        <th className="pb-3 text-sm font-medium text-gray-500">Job</th>
                        <th className="pb-3 text-sm font-medium text-gray-500">Status</th>
                        <th className="pb-3 text-sm font-medium text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analytics.recentApplications.map((app) => (
                        <tr key={app.id}>
                          <td className="py-3 text-sm text-gray-900">
                            {app.candidate.name}
                          </td>
                          <td className="py-3 text-sm text-gray-600">
                            {app.job.title}
                          </td>
                          <td className="py-3">
                            <Badge variant={statusVariants[app.status] || "default"}>
                              {app.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="py-3 text-sm text-gray-500">
                            {new Date(app.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manage Branding */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Manage Branding</h2>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveBranding} className="space-y-4 max-w-2xl">
                <Input
                  label="Company Name"
                  value={brandingForm.companyName}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, companyName: e.target.value })
                  }
                  placeholder="Your company name"
                />
                <Input
                  label="Website"
                  value={brandingForm.website}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, website: e.target.value })
                  }
                  placeholder="https://example.com"
                />
                <Input
                  label="Location"
                  value={brandingForm.location}
                  onChange={(e) =>
                    setBrandingForm({ ...brandingForm, location: e.target.value })
                  }
                  placeholder="City, Country"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors resize-none"
                    rows={4}
                    value={brandingForm.bio}
                    onChange={(e) =>
                      setBrandingForm({ ...brandingForm, bio: e.target.value })
                    }
                    placeholder="Tell candidates about your company..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={savingBranding}>
                    {savingBranding ? "Saving..." : "Save Branding"}
                  </Button>
                  {brandingSaved && (
                    <span className="text-sm text-emerald-600 font-medium">
                      ✓ Saved successfully
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
