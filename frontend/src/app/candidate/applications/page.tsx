"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  applications,
  candidateAnalytics,
  Application,
  ApplicationFunnel,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusColors: Record<string, string> = {
  PENDING: "bg-gray-400",
  REVIEWING: "bg-blue-500",
  SHORTLISTED: "bg-yellow-500",
  ACCEPTED: "bg-emerald-500",
  REJECTED: "bg-red-500",
};

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "default",
  REVIEWING: "info",
  SHORTLISTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
};

type SortKey = "newest" | "status";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

export default function CandidateApplicationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [funnel, setFunnel] = useState<ApplicationFunnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      Promise.all([
        applications.my(),
        candidateAnalytics.applicationFunnel(),
      ])
        .then(([apps, funnelData]) => {
          setMyApplications(apps);
          setFunnel(funnelData);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load data"))
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

  const sorted = [...myApplications].sort((a, b) => {
    if (sortBy === "status") return a.status.localeCompare(b.status);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const funnelTotal = funnel
    ? funnel.totalApplied + funnel.reviewing + funnel.shortlisted + funnel.accepted
    : 0;

  const funnelSegments = funnel && funnelTotal > 0
    ? [
        { label: "Applied", count: funnel.totalApplied, color: "bg-gray-400" },
        { label: "Reviewing", count: funnel.reviewing, color: "bg-blue-500" },
        { label: "Shortlisted", count: funnel.shortlisted, color: "bg-yellow-500" },
        { label: "Accepted", count: funnel.accepted, color: "bg-emerald-500" },
      ]
    : [];

  const statCards = funnel
    ? [
        { label: "Total Applied", value: funnel.totalApplied, color: "text-gray-700", bg: "bg-gray-50" },
        { label: "In Review", value: funnel.reviewing, color: "text-blue-700", bg: "bg-blue-50" },
        { label: "Shortlisted", value: funnel.shortlisted, color: "text-yellow-700", bg: "bg-yellow-50" },
        { label: "Accepted", value: funnel.accepted, color: "text-emerald-700", bg: "bg-emerald-50" },
        { label: "Rejected", value: funnel.rejected, color: "text-red-700", bg: "bg-red-50" },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link href="/candidate" className="inline-flex items-center text-emerald-600 hover:text-emerald-700 mb-4">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Applications</h1>
        <p className="text-gray-600">Track the status of your job applications</p>
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
          {/* Summary Stat Cards */}
          {funnel && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              {statCards.map((stat) => (
                <Card key={stat.label} className={stat.bg}>
                  <CardContent className="p-4 text-center">
                    <div className={`text-2xl font-bold ${stat.color} mb-1`}>{stat.value}</div>
                    <div className="text-sm text-gray-600">{stat.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Pipeline Funnel Bar */}
          {funnelSegments.length > 0 && funnelTotal > 0 && (
            <Card className="mb-8">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Pipeline</h2>
                <div className="flex h-8 rounded-full overflow-hidden bg-gray-100">
                  {funnelSegments.map((seg) =>
                    seg.count > 0 ? (
                      <div
                        key={seg.label}
                        className={`${seg.color} flex items-center justify-center text-white text-xs font-medium transition-all`}
                        style={{ width: `${(seg.count / funnelTotal) * 100}%` }}
                        title={`${seg.label}: ${seg.count}`}
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
                      {seg.label} ({seg.count})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sort Controls */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">All Applications</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              <select
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                <option value="newest">Newest First</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>

          {/* Application List */}
          {sorted.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 mb-4">No applications yet. Start exploring jobs!</p>
                <Link href="/jobs">
                  <Button>Browse Jobs</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sorted.map((app) => (
                <Card key={app.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <Link
                            href={`/jobs/${app.job.slug}`}
                            className="text-lg font-semibold text-gray-900 hover:text-emerald-600 truncate"
                          >
                            {app.job.title}
                          </Link>
                          <Badge variant={statusVariants[app.status] || "default"}>
                            {app.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">
                          {app.job.employer?.companyName}
                          {app.job.location && ` • ${app.job.location}`}
                          {app.job.type && ` • ${app.job.type}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Applied {timeAgo(app.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link href={`/jobs/${app.job.slug}`}>
                          <Button variant="outline" size="sm">View Job</Button>
                        </Link>
                        <Link href="/candidate/calendar">
                          <Button variant="ghost" size="sm">Schedule Interview</Button>
                        </Link>
                      </div>
                    </div>
                    {/* Status indicator bar */}
                    <div className={`mt-4 h-1 rounded-full ${statusColors[app.status] || "bg-gray-300"}`} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
