"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { employerAnalytics, EmployerAnalytics, EmployerBranding } from "@/lib/api";
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
      Promise.all([employerAnalytics.stats(), employerAnalytics.getBranding()])
        .then(([statsData, brandingData]) => {
          setAnalytics(statsData);
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
