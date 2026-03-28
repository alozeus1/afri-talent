"use client";

import { useEffect, useState } from "react";
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
import { EmployerActivationChecklist } from "@/components/employer/activation-checklist";
import { EmployerMilestones } from "@/components/employer/activation-milestones";
import { TrustBadge } from "@/components/trust/trust-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { localizePath, useLocale } from "@/lib/i18n/client";

const statusVariants: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

export default function EmployerDashboard() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [onboarding, setOnboarding] = useState<EmployerOnboarding | null>(null);
  const [trustDashboard, setTrustDashboard] = useState<EmployerTrustDashboard | null>(null);
  const [analytics, setAnalytics] = useState<EmployerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

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
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const publishedJobs = analytics?.publishedJobs ?? myJobs.filter((job) => job.status === "PUBLISHED").length;
  const totalApplications = analytics?.totalApplications ?? myJobs.reduce((sum, job) => sum + (job._count?.applications || 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] bg-[linear-gradient(135deg,#052e2b_0%,#0f766e_58%,#d1fae5_140%)] px-6 py-8 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
              Employer activation cockpit
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {user.employer?.companyName || "Employer"} hiring command center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/90 sm:text-base">
              Move from signup to a trusted, high-signal shortlist as quickly as possible. AfriTalent now shows the next action, trust posture, and early ROI signals in one place.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {trustDashboard && (
                <TrustBadge
                  label={trustDashboard.trust.badge}
                  riskLevel={trustDashboard.trust.riskLevel}
                  variant="success"
                />
              )}
              {trustDashboard?.trust.verifiedDomain && (
                <TrustBadge label={`Domain verified: ${trustDashboard.trust.verifiedDomain}`} variant="info" />
              )}
              {onboarding && (
                <TrustBadge
                  label={onboarding.activationState.label}
                  variant={onboarding.activationState.state === "activated" ? "success" : "info"}
                />
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <Link href={localizePath(onboarding?.nextAction.href || "/employer/onboarding", locale)}>
              <Button className="w-full" size="lg">
                {onboarding?.nextAction.ctaLabel || "Continue onboarding"}
              </Button>
            </Link>
            <Link href={localizePath("/employer/jobs/new", locale)}>
              <Button className="w-full border-white/30 text-white hover:bg-white/10 hover:text-white" variant="outline" size="lg">
                Post first credible job
              </Button>
            </Link>
            <Link href={localizePath("/employer/onboarding", locale)}>
              <Button className="w-full border-white/20 text-white hover:bg-white/10 hover:text-white" variant="outline">
                Open guided onboarding
              </Button>
            </Link>
            <Link href={localizePath("/employer/analytics", locale)}>
              <Button className="w-full border-white/20 text-white hover:bg-white/10 hover:text-white" variant="outline">
                View hiring ROI
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Published jobs",
            value: publishedJobs,
            helper: onboarding?.milestones.firstApprovedJobAt
              ? `First approved ${new Date(onboarding.milestones.firstApprovedJobAt).toLocaleDateString()}`
              : "No approved jobs yet",
          },
          {
            label: "Applications received",
            value: totalApplications,
            helper: analytics ? `${analytics.shortlistRate}% shortlist rate` : "Monitor early conversion",
          },
          {
            label: "Qualified applicants",
            value: analytics?.qualifiedApplicants ?? onboarding?.stats.qualifiedApplicants ?? 0,
            helper: "Shortlisted or accepted talent",
          },
          {
            label: "Time to first qualified shortlist",
            value:
              analytics?.timeToFirstQualifiedApplicantHours == null
                ? "Pending"
                : `${analytics.timeToFirstQualifiedApplicantHours}h`,
            helper: "Measured from first approved job",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-gray-200 bg-white">
            <CardContent className="p-5">
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
              <p className="mt-2 text-sm text-gray-600">{stat.helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {onboarding && (
        <div className="mt-10 space-y-8">
          <EmployerMilestones
            milestones={onboarding.milestones}
            activationState={onboarding.activationState}
          />

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <EmployerActivationChecklist
              checklist={onboarding.checklist}
              completionPct={onboarding.completionPct}
              currentStep={onboarding.currentStep}
              nextAction={onboarding.nextAction}
            />

            <div className="space-y-6">
              <Card className={trustDashboard?.trust.postingEligibility ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}>
                <CardHeader>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                    Trust status
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-gray-900">
                    {trustDashboard?.trust.postingEligibility
                      ? "Public posting is unlocked"
                      : "Verification still blocks public posting"}
                  </h2>
                </CardHeader>
                <CardContent>
                  {trustDashboard ? (
                    <>
                      <p className="text-sm text-gray-700">
                        Authenticity score {trustDashboard.trust.authenticityScore} and risk score {trustDashboard.trust.riskScore}.
                      </p>
                      {trustDashboard.trust.warnings.length > 0 && (
                        <ul className="mt-3 space-y-2 text-sm text-gray-700">
                          {trustDashboard.trust.warnings.map((warning) => (
                            <li key={warning}>• {warning}</li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4">
                        <Link href={localizePath("/employer/trust", locale)}>
                          <Button className="w-full">
                            {trustDashboard.trust.postingEligibility ? "Strengthen trust profile" : "Complete verification"}
                          </Button>
                        </Link>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">Trust profile unavailable right now.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-950 text-white">
                <CardHeader>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                    Upgrade journey
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">{onboarding.upgradeJourney.headline}</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-300">{onboarding.upgradeJourney.body}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={localizePath("/billing", locale)}>
                      <Button size="sm">{onboarding.upgradeJourney.ctaLabel}</Button>
                    </Link>
                    <Link href={localizePath("/employer/talent", locale)}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10 hover:text-white"
                      >
                        Search talent
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {analytics && (
                <Card className="border-blue-200 bg-blue-50/70">
                  <CardHeader>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                      Verification impact
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-blue-950">
                      {analytics.verificationImpact.qualifiedApplicantRate}% of applications are reaching shortlist quality
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-blue-900">{analytics.verificationImpact.insight}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-10">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                  Live job board
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-900">Current openings and trust posture</h2>
              </div>
              <Link href={localizePath("/employer/jobs/new", locale)}>
                <Button>Post new job</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" />
              </div>
            ) : myJobs.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
                <p className="text-lg font-semibold text-gray-900">No jobs live yet</p>
                <p className="mt-2 text-sm text-gray-600">
                  Finish onboarding, preview quality, and publish the first role built to attract qualified applicants.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link href={localizePath("/employer/onboarding", locale)}>
                    <Button variant="outline">Open onboarding</Button>
                  </Link>
                  <Link href={localizePath("/employer/jobs/new", locale)}>
                    <Button>Create first job</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {myJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white px-5 py-5 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{job.title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusVariants[job.status] || "bg-gray-100 text-gray-700"}`}>
                          {job.status.replace(/_/g, " ")}
                        </span>
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
                      <p className="mt-2 text-sm text-gray-600">
                        {job.location} • {job.type} • {job.seniority}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {job._count?.applications || 0} application(s) • Created {new Date(job.createdAt).toLocaleDateString()}
                      </p>
                      {job.trust?.guidance && (
                        <p className="mt-3 text-sm text-gray-600">{job.trust.guidance}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {job.status === "PUBLISHED" && (
                        <Link href={localizePath(`/employer/jobs/${job.id}/applications`, locale)}>
                          <Button variant="outline">View applications</Button>
                        </Link>
                      )}
                      <Link href={localizePath("/employer/analytics", locale)}>
                        <Button variant="outline">View ROI</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
