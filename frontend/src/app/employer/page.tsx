"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  jobs,
  Job,
  employerAnalytics,
  EmployerOnboarding,
  EmployerTrustDashboard,
  trust,
} from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrustBadge } from "@/components/trust/trust-badge";
import { localizePath, useLocale } from "@/lib/i18n/client";

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  DRAFT: "default",
  PENDING_REVIEW: "warning",
  PUBLISHED: "success",
  REJECTED: "danger",
};

export default function EmployerDashboard() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [onboarding, setOnboarding] = useState<EmployerOnboarding | null>(null);
  const [trustDashboard, setTrustDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      Promise.all([
        jobs.myJobs(),
        employerAnalytics.onboarding().catch(() => null),
        trust.employerSummary().catch(() => null),
      ])
        .then(([jobsData, onboardingData, trustData]) => {
          setMyJobs(jobsData);
          setOnboarding(onboardingData);
          setTrustDashboard(trustData);
        })
        .catch(console.error)
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

  const totalApplications = myJobs.reduce((sum, job) => sum + (job._count?.applications || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {user.employer?.companyName || "Employer"} Dashboard
        </h1>
        <p className="text-gray-600">Manage your job postings and review applications</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href={localizePath("/employer/talent", locale)}>
            <Button variant="outline" size="sm">Browse Talent</Button>
          </Link>
          <Link href={localizePath("/employer/integrations", locale)}>
            <Button variant="outline" size="sm">ATS Integrations</Button>
          </Link>
          <Link href={localizePath("/employer/analytics", locale)}>
            <Button variant="outline" size="sm">Analytics</Button>
          </Link>
          <Link href={localizePath("/billing", locale)}>
            <Button variant="outline" size="sm">Billing & Upgrades</Button>
          </Link>
          <Link href={localizePath("/employer/trust", locale)}>
            <Button variant="outline" size="sm">Trust & Verification</Button>
          </Link>
        </div>
      </div>

      {trustDashboard && (
        <Card className={`mb-8 ${trustDashboard.trust.postingEligibility ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/60"}`}>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <TrustBadge
                    label={trustDashboard.trust.badge}
                    riskLevel={trustDashboard.trust.riskLevel}
                    variant="success"
                  />
                  {trustDashboard.trust.verifiedDomain && (
                    <TrustBadge label={`Domain matched: ${trustDashboard.trust.verifiedDomain}`} variant="info" />
                  )}
                  {trustDashboard.trust.requiresEnhancedVerification && (
                    <TrustBadge label="Enhanced verification required" riskLevel="MEDIUM" variant="warning" />
                  )}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-gray-900">
                  {trustDashboard.trust.postingEligibility
                    ? "Your employer account can publish jobs"
                    : "Complete trust checks before publishing jobs"}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Authenticity score {trustDashboard.trust.authenticityScore} • Risk score {trustDashboard.trust.riskScore}
                </p>
                {trustDashboard.trust.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-gray-700">
                    {trustDashboard.trust.warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Link href={localizePath("/employer/trust", locale)}>
                <Button>{trustDashboard.trust.postingEligibility ? "Strengthen trust profile" : "Finish verification"}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {onboarding && (
        <Card className="mb-8 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Employer onboarding {onboarding.completionPct}%
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">{onboarding.recommendation}</p>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              {onboarding.checklist.map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <span className={item.done ? "text-emerald-600" : "text-amber-600"}>{item.done ? "✓" : "○"}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={localizePath("/employer/jobs/new", locale)}>
                <Button size="sm">Launch First Job Wizard</Button>
              </Link>
              <Link href={localizePath("/employer/integrations", locale)}>
                <Button size="sm" variant="outline">Connect ATS</Button>
              </Link>
              <Link href={localizePath("/employer/analytics", locale)}>
                <Button size="sm" variant="outline">View Funnel Analytics</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">{myJobs.length}</div>
            <div className="text-gray-600">Total Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {myJobs.filter((j) => j.status === "PUBLISHED").length}
            </div>
            <div className="text-gray-600">Published</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-yellow-600 mb-1">
              {myJobs.filter((j) => j.status === "PENDING_REVIEW").length}
            </div>
            <div className="text-gray-600">Pending Review</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-600 mb-1">{totalApplications}</div>
            <div className="text-gray-600">Applications</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">My Job Postings</h2>
            <Link href={localizePath("/employer/jobs/new", locale)}>
              <Button>Post New Job</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : myJobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">You haven&apos;t posted any jobs yet</p>
              <Link href={localizePath("/employer/jobs/new", locale)}>
                <Button>Post Your First Job</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {myJobs.map((job) => (
                <div key={job.id} className="py-4 flex justify-between items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{job.title}</span>
                      <Badge variant={statusVariants[job.status] || "default"}>
                        {job.status.replace("_", " ")}
                      </Badge>
                      {job.trust?.companyReviewed && (
                        <TrustBadge label="Company reviewed" variant="info" />
                      )}
                      {job.trust?.jobQualityChecked && (
                        <TrustBadge label="Quality checked" variant="success" />
                      )}
                      {job.trust?.newEmployerCaution && (
                        <TrustBadge label="New employer caution" riskLevel="MEDIUM" variant="warning" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {job.location} • {job.type} • {job.seniority}
                    </p>
                    {job.trust?.guidance && (
                      <p className="text-xs text-gray-500 mt-2">{job.trust.guidance}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {job._count?.applications || 0} application(s) • Created{" "}
                      {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {job.status === "PUBLISHED" && (
                      <Link href={localizePath(`/employer/jobs/${job.id}/applications`, locale)}>
                        <Button variant="outline" size="sm">
                          View Applications
                        </Button>
                      </Link>
                    )}
                    <Link href={localizePath(`/jobs/${job.slug}`, locale)}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
