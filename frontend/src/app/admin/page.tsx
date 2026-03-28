"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { admin, AdminStats, AdminTrustDashboard, Job, adminTrust } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrustBadge } from "@/components/trust/trust-badge";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trustOverview, setTrustOverview] = useState<AdminTrustDashboard | null>(null);
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      Promise.all([admin.stats(), admin.pendingJobs(), adminTrust.dashboard().catch(() => null)])
        .then(([statsData, jobsData, trustData]) => {
          setStats(statsData);
          setPendingJobs(jobsData);
          setTrustOverview(trustData);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user]);

  const reviewJob = async (jobId: string, status: "APPROVED" | "REJECTED") => {
    if (!user) return;
    setReviewing(jobId);
    try {
      await admin.reviewJob(jobId, { status });
      setPendingJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (stats) {
        setStats({ ...stats, pendingJobs: stats.pendingJobs - 1 });
      }
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setReviewing(null);
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Manage and moderate the platform</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href="/admin/billing">
            <Button variant="outline">Billing Operations</Button>
          </Link>
          <Link href="/admin/trust">
            <Button variant="outline">Trust Operations</Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="outline">Users</Button>
          </Link>
          <Link href="/admin/reviews">
            <Button variant="outline">Reviews</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-5 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-gray-900 mb-1">{stats?.totalUsers || 0}</div>
                <div className="text-gray-600">Total Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-emerald-600 mb-1">{stats?.totalJobs || 0}</div>
                <div className="text-gray-600">Total Jobs</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-yellow-600 mb-1">{stats?.pendingJobs || 0}</div>
                <div className="text-gray-600">Pending Review</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-blue-600 mb-1">{stats?.totalApplications || 0}</div>
                <div className="text-gray-600">Applications</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-purple-600 mb-1">{stats?.totalResources || 0}</div>
                <div className="text-gray-600">Resources</div>
              </CardContent>
            </Card>
          </div>

          {trustOverview && (
            <Card className="mb-8 border-slate-200 bg-slate-50">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <TrustBadge label={`${trustOverview.pendingVerificationArtifacts} pending artifacts`} variant="warning" />
                      <TrustBadge label={`${trustOverview.openRiskCases} open risk cases`} riskLevel={trustOverview.openRiskCases > 0 ? "HIGH" : "LOW"} />
                      <TrustBadge label={`${trustOverview.openReports} open reports`} variant="info" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-gray-900">Trust moderation needs active coverage</h2>
                    <p className="mt-2 text-sm text-gray-600">
                      {trustOverview.limitedAccounts} limited account(s), {trustOverview.suspendedAccounts} suspended account(s), and {trustOverview.heldJobs} held job(s) are currently in the trust workflow.
                    </p>
                  </div>
                  <Link href="/admin/trust">
                    <Button>Open trust queue</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Jobs Pending Review</h2>
            </CardHeader>
            <CardContent>
              {pendingJobs.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-gray-600">All jobs have been reviewed!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {pendingJobs.map((job) => (
                    <div key={job.id} className="py-6">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 text-lg">{job.title}</h3>
                          <p className="text-emerald-600 font-medium">{job.employer.companyName}</p>
                          <p className="text-sm text-gray-600 mt-1">
                            {job.location} • {job.type} • {job.seniority}
                          </p>
                        </div>
                        <Badge variant="warning">Pending Review</Badge>
                      </div>

                      <p className="text-gray-600 text-sm mb-4 line-clamp-3">{job.description}</p>

                      {job.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {job.tags.map((tag) => (
                            <Badge key={tag} variant="default">{tag}</Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-3">
                        <Button
                          onClick={() => reviewJob(job.id, "APPROVED")}
                          disabled={reviewing === job.id}
                        >
                          {reviewing === job.id ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => reviewJob(job.id, "REJECTED")}
                          disabled={reviewing === job.id}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
