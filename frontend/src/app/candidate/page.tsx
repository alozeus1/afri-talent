"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  applications,
  Application,
  billing,
  BillingStatus,
  candidateAnalytics,
  CandidateRetentionSummaryResponse,
  CandidateTrustDashboard,
  emailVerification,
  trust,
} from "@/lib/api";
import { candidateRetentionEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { PushOptInCard } from "@/components/notifications/push-opt-in";
import { TrustBadge } from "@/components/trust/trust-badge";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { MapPin, ArrowRight } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CandidateProfile {
  id: string;
  headline: string;
  bio: string;
  skills: string[];
  targetRoles: string[];
  targetCountries: string[];
  yearsExperience: number | null;
  visaStatus: string;
  openToWork: boolean;
  profileCompleteness: number;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

const statusVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  REVIEWING: "info",
  SHORTLISTED: "success",
  REJECTED: "danger",
  ACCEPTED: "success",
};

function getMissingItems(profile: CandidateProfile): string[] {
  const missing: string[] = [];
  if (!profile.headline) missing.push("Add a headline");
  if (!profile.bio) missing.push("Add a bio");
  if (!profile.skills || profile.skills.length === 0) missing.push("Add skills");
  if (!profile.targetRoles || profile.targetRoles.length === 0) missing.push("Add target roles");
  if (!profile.targetCountries || profile.targetCountries.length === 0) missing.push("Add target countries");
  if (profile.yearsExperience === null || profile.yearsExperience === undefined) missing.push("Add years of experience");
  if (!profile.linkedinUrl) missing.push("Add LinkedIn URL");
  if (!profile.githubUrl) missing.push("Add GitHub URL");
  if (!profile.portfolioUrl) missing.push("Add portfolio URL");
  return missing;
}

const planLabels: Record<string, string> = {
  FREE: "Free",
  BASIC: "Basic",
  PROFESSIONAL: "Professional",
};

const MOCK_RECOMMENDED_JOBS = [
  { id: "1", title: "Senior Frontend Engineer", company: "Paystack", location: "Lagos (Hybrid)", salary: "$70k - $90k", type: "FULL-TIME" },
  { id: "2", title: "Lead Product Designer", company: "Flutterwave", location: "Remote", salary: "$80k - $110k", type: "FULL-TIME" },
  { id: "3", title: "Fullstack Developer", company: "Andela", location: "Remote", salary: "$60k - $85k", type: "CONTRACT" },
  { id: "4", title: "Backend Engineer (Go)", company: "Monzo", location: "London (Relocation)", salary: "£85k - £105k", type: "FULL-TIME" },
];

export default function CandidateDashboard() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [openToWork, setOpenToWork] = useState(false);
  const [togglingOtw, setTogglingOtw] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [trustDashboard, setTrustDashboard] = useState<CandidateTrustDashboard | null>(null);
  const [retentionSummary, setRetentionSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean>(true);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role?.toUpperCase() !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      applications
        .my()
        .then(setMyApplications)
        .catch(console.error)
        .finally(() => setLoading(false));

      // Fetch profile
      fetch(`${API_URL}/api/profile`, { credentials: "include" })
        .then((res) => res.json())
        .then((data: CandidateProfile) => {
          setProfile(data);
          setOpenToWork(data.openToWork);
        })
        .catch(console.error);

      // Fetch billing status
      billing
        .status()
        .then(setBillingStatus)
        .catch(console.error);

      trust
        .candidateSummary()
        .then(setTrustDashboard)
        .catch(() => {});

      candidateAnalytics
        .retentionSummary()
        .then((summary) => {
          setRetentionSummary(summary);
          candidateRetentionEvents.summaryViewed({
            recommendation_count: summary.recommendations.length,
            saved_search_count: summary.snapshot.savedSearchCount,
          });
          summary.experiments.forEach((experiment) => {
            candidateRetentionEvents.experimentExposed({
              experiment_key: experiment.key,
              variant: experiment.variant,
            });
          });
        })
        .catch(() => {});

      emailVerification
        .status()
        .then((status) => setEmailVerified(status.verified))
        .catch(() => setEmailVerified(true));
    }
  }, [user, locale]);

  const toggleOpenToWork = async () => {
    setTogglingOtw(true);
    const newValue = !openToWork;
    try {
      await fetch(`${API_URL}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ openToWork: newValue }),
      });
      setOpenToWork(newValue);
    } catch (err) {
      console.error("Failed to update open-to-work status", err);
    } finally {
      setTogglingOtw(false);
    }
  };

  const handleSendVerification = async () => {
    setSendingVerification(true);
    setVerificationMessage(null);
    try {
      const response = await emailVerification.send();
      setVerificationMessage(response.message || "Verification email sent.");
    } catch (sendError) {
      setVerificationMessage(
        sendError instanceof Error ? sendError.message : "Failed to send verification email.",
      );
    } finally {
      setSendingVerification(false);
    }
  };

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  if (loading && !profile && myApplications.length === 0) {
    return <DashboardSkeleton />;
  }

  const completeness = profile?.profileCompleteness ?? 0;
  const missingItems = profile ? getMissingItems(profile) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t("candidate.dashboard")}: {user.name}</h1>
        <p className="text-gray-600">Track your job applications and career progress</p>
      </div>

      {!emailVerified && (
        <Card className="mb-8 border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-amber-900">Verify your email to unlock all actions</h2>
                <p className="text-sm text-amber-800 mt-1">
                  Applying to jobs, quick apply, and billing actions require a verified email.
                </p>
                {verificationMessage && (
                  <p className="text-sm text-amber-900 mt-2">{verificationMessage}</p>
                )}
              </div>
              <Button
                variant="outline"
                onClick={handleSendVerification}
                disabled={sendingVerification}
                className="border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                {sendingVerification ? "Sending..." : "Resend Verification Email"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {trustDashboard && (
        <Card className={`mb-8 ${trustDashboard.trust.premiumFilterEligible ? "border-emerald-200 bg-emerald-50/40" : "border-blue-200 bg-blue-50/50"}`}>
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <TrustBadge
                    label={trustDashboard.trust.badge}
                    riskLevel={trustDashboard.trust.riskLevel}
                    variant="success"
                  />
                  {trustDashboard.trust.maskedPhone && (
                    <TrustBadge label={`Phone: ${trustDashboard.trust.maskedPhone}`} variant="info" />
                  )}
                  {trustDashboard.trust.premiumFilterEligible && (
                    <TrustBadge label="Eligible for premium employer filters" variant="success" />
                  )}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-gray-900">
                  Build a stronger verified profile
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Authenticity score {trustDashboard.trust.authenticityScore} • Risk score {trustDashboard.trust.riskScore}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trustDashboard.trust.verifiedSkillCount > 0 && (
                    <TrustBadge
                      label={`${trustDashboard.trust.verifiedSkillCount} verified skill badge${trustDashboard.trust.verifiedSkillCount === 1 ? "" : "s"}`}
                      variant="success"
                    />
                  )}
                  {trustDashboard.trust.partnerSignalCount > 0 && (
                    <TrustBadge
                      label={`${trustDashboard.trust.partnerSignalCount} partner marker${trustDashboard.trust.partnerSignalCount === 1 ? "" : "s"}`}
                      variant="info"
                    />
                  )}
                  {trustDashboard.trust.assessmentBacked && (
                    <TrustBadge label="Assessment-backed" variant="success" />
                  )}
                  {trustDashboard.trust.fullyCompletedProfile && (
                    <TrustBadge label="Fully completed profile" variant="success" />
                  )}
                </div>
                {trustDashboard.trust.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-gray-700">
                    {trustDashboard.trust.warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Link href={localizePath("/candidate/trust", locale)}>
                <Button>Open trust profile</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {retentionSummary && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-amber-200 bg-amber-50/40">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Your next best actions</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    AfriTalent is prioritizing trusted jobs, verified employers, and low-noise nudges.
                  </p>
                </div>
                <Link href={localizePath("/candidate/preferences", locale)}>
                  <Button variant="outline">Manage alerts</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {retentionSummary.journeys.slice(0, 3).map((journey) => (
                <div key={journey.key} className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{journey.title}</p>
                      <p className="mt-1 text-xs text-gray-600">{journey.description}</p>
                    </div>
                    <Badge variant={journey.status === "DONE" ? "success" : journey.status === "READY" ? "warning" : "info"}>
                      {journey.status}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={localizePath(journey.href, locale)}
                      onClick={() =>
                        candidateRetentionEvents.journeyCtaClicked({
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Trusted matches this week</h2>
              <p className="mt-1 text-sm text-gray-600">{retentionSummary.weeklyDigest.headline}</p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Trusted roles</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{retentionSummary.weeklyDigest.trustedJobCount}</p>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Verified employers</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{retentionSummary.weeklyDigest.verifiedEmployerCount}</p>
                </div>
              </div>
              <div className="space-y-3">
                {retentionSummary.recommendations.slice(0, 3).map((job) => (
                  <div key={job.id} className="rounded-2xl border border-gray-100 p-4">
                    <Link
                      href={localizePath(`/jobs/${job.slug}`, locale)}
                      className="text-sm font-semibold text-gray-900 hover:text-emerald-600"
                      onClick={() =>
                        candidateRetentionEvents.recommendationClicked({
                          source: "candidate_dashboard",
                          job_id: job.id,
                        })
                      }
                    >
                      {job.title}
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">
                      {job.employer?.companyName} • {job.location}
                    </p>
                    <p className="mt-2 text-xs text-gray-600">
                      {job.rankingExplanation?.summary}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Profile Completeness + Streak + Open to Work + Subscription */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Profile Completeness */}
        <Card className="dark:bg-zinc-900/50 dark:border-white/10 dark:shadow-[0_0_15px_rgba(255,255,255,0.03)] backdrop-blur-sm transition-all hover:dark:border-white/20">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Profile Completeness</h3>
            <div className="flex items-center gap-4 mb-3">
              <div className="relative h-16 w-16 flex-shrink-0">
                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15.9155"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18" cy="18" r="15.9155"
                    fill="none"
                    stroke={completeness >= 80 ? "#059669" : "#f59e0b"}
                    strokeWidth="3"
                    strokeDasharray={`${completeness} ${100 - completeness}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
                  {completeness}%
                </span>
              </div>
              <div className="min-w-0">
                {completeness >= 80 ? (
                  <p className="text-sm text-emerald-700 font-medium">Profile looks great! You&apos;re ready for premium matches.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 font-medium leading-tight">Complete your profile to unlock premium employer matches!</p>
                    <Link href={localizePath("/candidate/profile", locale)}>
                      <Button size="sm" className="w-full">Complete Profile</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
            {completeness < 80 && missingItems.length > 0 && (
              <ul className="space-y-1 mt-2">
                {missingItems.slice(0, 3).map((item) => (
                  <li key={item} className="text-xs text-gray-500 flex items-center gap-1">
                    <span className="text-amber-500">•</span> {item}
                  </li>
                ))}
                {missingItems.length > 3 && (
                  <li className="text-xs text-gray-400">+{missingItems.length - 3} more</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Application Streak */}
        <Card className="border-orange-200 bg-orange-50/40 dark:bg-orange-950/20 dark:border-orange-500/20 dark:shadow-[0_0_20px_rgba(249,115,22,0.05)] backdrop-blur-sm transition-all hover:dark:border-orange-500/40">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Activity</h3>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 text-2xl shadow-sm dark:shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                🔥
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-orange-50">3-Day Streak!</p>
                <p className="text-xs text-gray-600 dark:text-orange-200/60 mt-0.5">Keep applying to stay visible</p>
              </div>
            </div>
            <div className="mt-4 w-full bg-orange-100 dark:bg-orange-950/50 rounded-full h-1.5 shadow-inner">
              <div className="bg-orange-500 h-1.5 rounded-full dark:shadow-[0_0_8px_rgba(249,115,22,0.6)]" style={{ width: '40%' }}></div>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-orange-200/50 mt-2 text-right">2 days until next milestone</p>
          </CardContent>
        </Card>

        {/* Open to Work Toggle */}
        <Card className="dark:bg-zinc-900/50 dark:border-white/10 dark:shadow-[0_0_15px_rgba(255,255,255,0.03)] backdrop-blur-sm transition-all hover:dark:border-white/20">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Job Visibility</h3>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={toggleOpenToWork}
                disabled={togglingOtw}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  openToWork ? "bg-emerald-600" : "bg-gray-300"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  openToWork ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
              <span className="text-sm font-medium text-gray-900">
                {openToWork ? "Open to Work" : "Not Looking"}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {openToWork ? "Visible to employers" : "Hidden from employers"}
            </p>
          </CardContent>
        </Card>

        {/* Subscription Status */}
        <Card className="dark:bg-zinc-900/50 dark:border-white/10 dark:shadow-[0_0_15px_rgba(255,255,255,0.03)] backdrop-blur-sm transition-all hover:dark:border-white/20">
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Subscription</h3>
            {billingStatus ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={billingStatus.plan === "FREE" ? "default" : "success"}>
                    {planLabels[billingStatus.plan] || billingStatus.plan}
                  </Badge>
                  {billingStatus.status === "ACTIVE" && billingStatus.plan !== "FREE" && (
                    <span className="text-xs text-emerald-600 font-medium">Active</span>
                  )}
                </div>
                {billingStatus.plan === "FREE" && (
                  <Link href={localizePath("/billing", locale)}>
                    <Button size="sm" variant="outline" className="mt-1">Upgrade Plan</Button>
                  </Link>
                )}
                {billingStatus.plan !== "FREE" && billingStatus.currentPeriodEnd && (
                  <p className="text-xs text-gray-500 mt-1">
                    Renews {new Date(billingStatus.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
              </>
            ) : (
              <div className="animate-pulse h-6 w-24 bg-gray-200 rounded"></div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <PushOptInCard />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-8">
        <Link href={localizePath("/candidate/chat", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-emerald-200 bg-emerald-50/30">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">🤖</span>
              <span className="text-sm font-medium text-emerald-700">Mara (AI Chat)</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/candidate/ai-assistant", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">✦</span>
              <span className="text-sm font-medium text-gray-900">AI Assistant</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/messages", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">💬</span>
              <span className="text-sm font-medium text-gray-900">Messages</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/candidate/saved-searches", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">🔍</span>
              <span className="text-sm font-medium text-gray-900">Saved Searches</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/billing", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">💳</span>
              <span className="text-sm font-medium text-gray-900">Billing</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/candidate/trust", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-200 bg-blue-50/40">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">🛡️</span>
              <span className="text-sm font-medium text-blue-900">Trust Profile</span>
            </CardContent>
          </Card>
        </Link>
        <Link href={localizePath("/candidate/preferences", locale)}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-amber-200 bg-amber-50/40">
            <CardContent className="p-4 text-center">
              <span className="text-2xl mb-1 block">🔔</span>
              <span className="text-sm font-medium text-amber-900">Alert Preferences</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">{myApplications.length}</div>
            <div className="text-gray-600">Total Applications</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {myApplications.filter((a) => a.status === "REVIEWING" || a.status === "SHORTLISTED").length}
            </div>
            <div className="text-gray-600">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {myApplications.filter((a) => a.status === "ACCEPTED").length}
            </div>
            <div className="text-gray-600">Accepted</div>
          </CardContent>
        </Card>
      </div>

      {/* Recommended For You Section */}
      <div className="mb-10">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recommended For You</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Based on your skills and target roles</p>
          </div>
          <Link href={localizePath("/jobs", locale)} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
            View all <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        
        <div className="flex overflow-x-auto gap-4 pb-4 snap-x hide-scrollbar">
          {MOCK_RECOMMENDED_JOBS.map((job) => (
            <Link key={job.id} href={localizePath(`/jobs/${job.id}`, locale)} className="min-w-[300px] sm:min-w-[340px] snap-start group">
              <Card className="h-full hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all duration-300 group-hover:-translate-y-1 bg-white dark:bg-zinc-950/50">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-1">{job.title}</h3>
                      <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{job.company}</p>
                    </div>
                    <Badge variant="default" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                      {job.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-4 mb-3">
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {job.location}</span>
                  </div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100 border-t border-gray-100 dark:border-zinc-800 pt-3">
                    {job.salary}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* My Applications */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">My Applications</h2>
            <Link href={localizePath("/jobs", locale)}>
              <Button>Browse Jobs</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-emerald-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
              <span className="ml-3 text-sm font-medium">Loading your applications...</span>
            </div>
          ) : myApplications.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 dark:bg-zinc-900/50 dark:border-zinc-800">
              <div className="flex justify-center mb-4 text-gray-400 dark:text-zinc-500">
                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-900 dark:text-zinc-100 font-semibold mb-1">No applications yet</p>
              <p className="text-gray-500 dark:text-zinc-400 text-sm mb-6 max-w-sm mx-auto">When you apply to roles, you can track their status and trust-safety reviews here.</p>
              <Link href={localizePath("/jobs", locale)}>
                <Button>Explore Verified Jobs</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {myApplications.map((application) => (
                <div key={application.id} className="py-4 flex justify-between items-center">
                  <div>
                    <Link
                      href={localizePath(`/jobs/${application.job.slug}`, locale)}
                      className="font-medium text-gray-900 hover:text-emerald-600"
                    >
                      {application.job.title}
                    </Link>
                    <p className="text-sm text-gray-600">
                      {application.job.employer?.companyName} • {application.job.location}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Applied {new Date(application.createdAt).toLocaleDateString()}
                    </p>
                    {application.heldForReview && (
                      <p className="text-xs text-amber-700 mt-2">
                        This application is being reviewed by our trust and safety checks before delivery.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariants[application.status] || "default"}>
                      {application.status}
                    </Badge>
                    {application.heldForReview && (
                      <TrustBadge label="Safety review" riskLevel="MEDIUM" variant="warning" />
                    )}
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
