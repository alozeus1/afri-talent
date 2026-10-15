"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowRight,
  Bell,
  Bot,
  BriefcaseBusiness,
  CreditCard,
  MapPin,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  applications,
  Application,
  billing,
  BillingStatus,
  candidateAnalytics,
  CandidateRetentionSummaryResponse,
  CandidateTrustDashboard,
  emailVerification,
  onboarding,
  InstantMatch,
  profile as profileApi,
  trust,
} from "@/lib/api";
import { candidateRetentionEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FREE_MODE } from "@/lib/free-mode";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { PushOptInCard } from "@/components/notifications/push-opt-in";
import { TrustBadge } from "@/components/trust/trust-badge";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import {
  CandidateLoadError,
  CandidatePageHeader,
  CandidateSpinner,
  CandidateStat,
  CandidateSwitch,
} from "@/components/candidate/candidate-ui";
import { applicationStatusVariants } from "@/components/candidate/application-status";
import { localizePath, useLocale } from "@/lib/i18n/client";
import {
  enumLabel,
  useCandidateFormatters,
  useCandidateT,
  type CandidateMessageKey,
} from "@/lib/i18n/candidate-messages";

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

function getMissingItems(profile: CandidateProfile): CandidateMessageKey[] {
  const missing: CandidateMessageKey[] = [];
  if (!profile.headline) missing.push("dash.missing.headline");
  if (!profile.bio) missing.push("dash.missing.bio");
  if (!profile.skills || profile.skills.length === 0) missing.push("dash.missing.skills");
  if (!profile.targetRoles || profile.targetRoles.length === 0) missing.push("dash.missing.targetRoles");
  if (!profile.targetCountries || profile.targetCountries.length === 0) missing.push("dash.missing.targetCountries");
  if (profile.yearsExperience === null || profile.yearsExperience === undefined) missing.push("dash.missing.experience");
  if (!profile.linkedinUrl) missing.push("dash.missing.linkedin");
  if (!profile.githubUrl) missing.push("dash.missing.github");
  if (!profile.portfolioUrl) missing.push("dash.missing.portfolio");
  return missing;
}

type WorkspaceLink = { href: string; key: string; premium?: boolean };

// "My workspace" section map (roadmap Phase 2 IA + Workstream-C career tools).
// Labels resolve to dash.ws.<key> and dash.ws.<key>.desc.
const workspaceLinks: WorkspaceLink[] = [
  { href: "/candidate/resumes", key: "resumes" },
  { href: "/candidate/applications", key: "applications" },
  { href: "/candidate/interview-prep", key: "interviews" },
  { href: "/learning", key: "learning" },
  { href: "/candidate/job-matches", key: "matches" },
  { href: "/candidate/saved-jobs", key: "savedJobs" },
  { href: "/candidate/saved-searches", key: "savedSearches" },
  { href: "/candidate/calendar", key: "calendar" },
  { href: "/candidate/cover-letter", key: "coverLetters" },
  { href: "/candidate/skills", key: "skills" },
  { href: "/candidate/analytics", key: "analytics" },
  { href: "/candidate/career-gap", key: "careerGap" },
  { href: "/candidate/career-advisor", key: "advisor", premium: true },
  { href: "/candidate/salary", key: "salary" },
  { href: "/candidate/referrals", key: "referrals" },
  { href: "/immigration", key: "visa" },
  { href: "/candidate/trust", key: "trust" },
  { href: "/candidate/preferences", key: "preferences" },
  { href: "/candidate/settings", key: "settings" },
];

type NextAction = { id: string; href: string };

function buildFallbackNextActions(params: {
  completeness: number;
  applicationCount: number;
  hasTrustWarnings: boolean;
}): NextAction[] {
  const actions: NextAction[] = [];
  if (params.completeness < 80) actions.push({ id: "profile", href: "/candidate/profile" });
  actions.push({ id: "resume", href: "/candidate/resume-builder" });
  actions.push({ id: "templates", href: "/candidate/resume-templates" });
  actions.push({ id: "matches", href: "/candidate/job-matches" });
  if (params.applicationCount === 0) actions.push({ id: "firstApp", href: "/jobs" });
  else actions.push({ id: "followUp", href: "/candidate/applications" });
  actions.push({ id: "interview", href: "/candidate/interview-prep" });
  if (params.hasTrustWarnings) actions.push({ id: "trust", href: "/candidate/trust" });
  return actions.slice(0, 4);
}

const TAB_IDS = ["overview", "applications", "settings"] as const;
type TabId = (typeof TAB_IDS)[number];

function QuickLink({
  href,
  icon,
  label,
  tone = "default",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  tone?: "default" | "primary" | "info" | "warning";
}) {
  const iconTone = {
    default: "bg-surface-muted text-fg-secondary",
    primary: "bg-primary-soft text-primary-text",
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
  }[tone];
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-xs transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
        {icon}
      </span>
      <span className="text-sm font-medium text-fg">{label}</span>
    </Link>
  );
}

export default function CandidateDashboard() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<unknown>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [profileError, setProfileError] = useState<unknown>(null);
  const [openToWork, setOpenToWork] = useState(false);
  const [togglingOtw, setTogglingOtw] = useState(false);
  const [otwError, setOtwError] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [trustDashboard, setTrustDashboard] = useState<CandidateTrustDashboard | null>(null);
  const [retentionSummary, setRetentionSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [instantMatches, setInstantMatches] = useState<InstantMatch[]>([]);
  const [matchesProfileReady, setMatchesProfileReady] = useState(true);
  const [emailVerified, setEmailVerified] = useState<boolean>(true);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<"sent" | "failed" | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabId>("overview");

  const href = (path: string) => localizePath(path, locale);

  useEffect(() => {
    if (!isLoading && (!user || user.role?.toUpperCase() !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadApplications = useCallback(() => {
    applications
      .my()
      .then(setMyApplications)
      .catch((err) => setApplicationsError(err))
      .finally(() => setLoading(false));
  }, []);

  // profile.get() throws ApiError on 4xx/5xx, so an error body is never stored
  // as the profile. The backend returns null for brand-new candidates.
  const loadProfile = useCallback(() => {
    profileApi
      .get()
      .then((data) => {
        if (!data) return;
        // The dashboard's local view type treats nullable text fields as optional strings.
        setProfile(data as unknown as CandidateProfile);
        setOpenToWork(Boolean(data.openToWork));
      })
      .catch((err) => setProfileError(err));
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") {
      loadApplications();
      loadProfile();

      // Fetch billing status (non-critical: the card falls back to the free plan copy)
      billing
        .status()
        .then(setBillingStatus)
        .catch(() => setBillingStatus(null));

      // First-look instant matches (free for every plan)
      onboarding
        .instantMatches()
        .then((data) => {
          setInstantMatches(data.matches);
          setMatchesProfileReady(data.profileReady);
        })
        .catch(() => {});

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
  }, [user, locale, loadApplications, loadProfile]);

  const toggleOpenToWork = async (newValue: boolean) => {
    setTogglingOtw(true);
    setOtwError(false);
    try {
      await profileApi.update({ openToWork: newValue });
      setOpenToWork(newValue);
    } catch (err) {
      console.error("Failed to update open-to-work status", err);
      setOtwError(true);
    } finally {
      setTogglingOtw(false);
    }
  };

  const handleSendVerification = async () => {
    setSendingVerification(true);
    setVerificationMessage(null);
    try {
      await emailVerification.send();
      setVerificationMessage("sent");
    } catch {
      setVerificationMessage("failed");
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
  const fallbackNextActions = buildFallbackNextActions({
    completeness,
    applicationCount: myApplications.length,
    hasTrustWarnings: Boolean(trustDashboard?.trust.warnings.length),
  });
  const inProgressCount = myApplications.filter(
    (a) => a.status === "REVIEWING" || a.status === "SHORTLISTED" || a.status === "INTERVIEW",
  ).length;
  const acceptedCount = myApplications.filter((a) => a.status === "ACCEPTED" || a.status === "HIRED").length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidatePageHeader
        eyebrow={t("dash.eyebrow")}
        title={t("dash.title", { name: user.name })}
        description={t("dash.subtitle")}
        actions={
          <Link href={href("/jobs")}>
            <Button>
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
              {t("dash.browseJobs")}
            </Button>
          </Link>
        }
      />

      {profileError ? (
        <CandidateLoadError
          className="mb-6"
          error={profileError}
          subject={t("ui.subject.profile")}
          onRetry={() => {
            setProfileError(null);
            loadProfile();
          }}
        />
      ) : null}

      <Tabs.Root value={selectedTab} orientation="horizontal" onValueChange={(val) => setSelectedTab(val as TabId)}>
        <div className="mb-8 border-b border-line">
          <Tabs.List className="hide-scrollbar -mb-px flex gap-6 overflow-x-auto" aria-label={t("dash.tabsLabel")}>
            {TAB_IDS.map((id) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className="whitespace-nowrap border-b-2 border-transparent px-1 py-3.5 text-sm font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:border-primary-text data-[state=active]:text-primary-text"
              >
                {t(`dash.tab.${id}` as CandidateMessageKey)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="overview" className="space-y-8 focus-visible:outline-none">
          {!emailVerified && (
            <Card className="border-warning-line bg-warning-soft">
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-fg">{t("dash.verify.title")}</h2>
                    <p className="mt-1 text-sm text-fg-secondary">{t("dash.verify.body")}</p>
                    {verificationMessage && (
                      <p role="status" className={`mt-2 text-sm ${verificationMessage === "sent" ? "text-success" : "text-danger"}`}>
                        {t(verificationMessage === "sent" ? "dash.verify.sent" : "dash.verify.failed")}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" onClick={handleSendVerification} disabled={sendingVerification}>
                    {sendingVerification ? t("dash.verify.sending") : t("dash.verify.resend")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {trustDashboard && (
            <Card
              className={
                trustDashboard.trust.premiumFilterEligible
                  ? "border-success-line bg-success-soft"
                  : "border-info-line bg-info-soft"
              }
            >
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
                        <TrustBadge label={t("dash.trust.phone", { phone: trustDashboard.trust.maskedPhone })} variant="info" />
                      )}
                      {trustDashboard.trust.premiumFilterEligible && (
                        <TrustBadge label={t("dash.trust.premiumEligible")} variant="success" />
                      )}
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-fg">{t("dash.trust.title")}</h2>
                    <p className="mt-2 text-sm text-fg-secondary">
                      {t("dash.trust.scores", {
                        authenticity: trustDashboard.trust.authenticityScore,
                        risk: trustDashboard.trust.riskScore,
                      })}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trustDashboard.trust.verifiedSkillCount > 0 && (
                        <TrustBadge
                          label={t("dash.trust.skillBadges", { count: trustDashboard.trust.verifiedSkillCount })}
                          variant="success"
                        />
                      )}
                      {trustDashboard.trust.partnerSignalCount > 0 && (
                        <TrustBadge
                          label={t("dash.trust.partnerMarkers", { count: trustDashboard.trust.partnerSignalCount })}
                          variant="info"
                        />
                      )}
                      {trustDashboard.trust.assessmentBacked && (
                        <TrustBadge label={t("dash.trust.assessmentBacked")} variant="success" />
                      )}
                      {trustDashboard.trust.fullyCompletedProfile && (
                        <TrustBadge label={t("dash.trust.fullProfile")} variant="success" />
                      )}
                    </div>
                    {trustDashboard.trust.warnings.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-fg-secondary">
                        {trustDashboard.trust.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link href={href("/candidate/trust")} className="shrink-0">
                    <Button>
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {t("dash.trust.open")}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {retentionSummary ? (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-fg">{t("dash.next.title")}</h2>
                      <p className="mt-1 text-sm text-fg-secondary">{t("dash.next.subtitle")}</p>
                    </div>
                    <Link href={href("/candidate/preferences")} className="shrink-0">
                      <Button variant="outline" size="sm">
                        <Bell className="h-4 w-4" aria-hidden="true" />
                        {t("dash.next.manageAlerts")}
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {retentionSummary.journeys.slice(0, 3).map((journey) => (
                    <div key={journey.key} className="rounded-2xl border border-line bg-surface-sunken p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-fg">{journey.title}</p>
                          <p className="mt-1 text-xs leading-5 text-fg-secondary">{journey.description}</p>
                        </div>
                        <Badge
                          variant={journey.status === "DONE" ? "success" : journey.status === "READY" ? "warning" : "info"}
                        >
                          {enumLabel(t, "dash.journey", journey.status)}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <Link
                          href={href(journey.href)}
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
                  <h2 className="text-lg font-semibold text-fg">{t("dash.matches.title")}</h2>
                  <p className="mt-1 text-sm text-fg-secondary">{retentionSummary.weeklyDigest.headline}</p>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line bg-surface-sunken p-3">
                      <p className="text-xs uppercase tracking-wide text-fg-muted">{t("dash.matches.trustedRoles")}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                        {fmt.number(retentionSummary.weeklyDigest.trustedJobCount)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-sunken p-3">
                      <p className="text-xs uppercase tracking-wide text-fg-muted">{t("dash.matches.verifiedEmployers")}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-fg">
                        {fmt.number(retentionSummary.weeklyDigest.verifiedEmployerCount)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {retentionSummary.recommendations.slice(0, 3).map((job) => (
                      <div key={job.id} className="rounded-2xl border border-line bg-surface-sunken p-4">
                        <Link
                          href={href(`/jobs/${job.slug}`)}
                          className="text-sm font-semibold text-fg hover:text-primary-text"
                          onClick={() =>
                            candidateRetentionEvents.recommendationClicked({
                              source: "candidate_dashboard",
                              job_id: job.id,
                            })
                          }
                        >
                          {job.title}
                        </Link>
                        <p className="mt-1 text-xs text-fg-muted">
                          {[job.employer?.companyName, job.location].filter(Boolean).join(" · ")}
                        </p>
                        {job.rankingExplanation?.summary ? (
                          <p className="mt-2 text-xs text-fg-secondary">{job.rankingExplanation.summary}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-fg">{t("dash.fallback.title")}</h2>
                <p className="mt-1 text-sm text-fg-secondary">{t("dash.fallback.subtitle")}</p>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {fallbackNextActions.map((action) => (
                  <div key={action.id} className="flex flex-col rounded-2xl border border-line bg-surface-sunken p-4">
                    <p className="text-sm font-semibold text-fg">
                      {t(`dash.action.${action.id}.title` as CandidateMessageKey)}
                    </p>
                    <p className="mt-1 flex-1 text-xs leading-5 text-fg-secondary">
                      {t(`dash.action.${action.id}.desc` as CandidateMessageKey)}
                    </p>
                    <Link href={href(action.href)} className="mt-3 inline-block">
                      <Button size="sm" variant="outline">
                        {t(`dash.action.${action.id}.cta` as CandidateMessageKey)}
                      </Button>
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {t("dash.completeness.title")}
                </h3>
                <div className="flex items-center gap-4">
                  <div
                    className="relative h-16 w-16 shrink-0"
                    role="progressbar"
                    aria-valuenow={completeness}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("dash.completeness.title")}
                  >
                    <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.9155"
                        fill="none"
                        stroke={completeness >= 80 ? "var(--success)" : "var(--warning)"}
                        strokeWidth="3"
                        strokeDasharray={`${completeness} ${100 - completeness}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-fg">
                      {completeness}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    {completeness >= 80 ? (
                      <p className="text-sm font-medium text-success">{t("dash.completeness.great")}</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-fg-secondary">{t("dash.completeness.nudge")}</p>
                        <Link href={href("/candidate/profile")}>
                          <Button size="sm">{t("dash.action.profile.cta")}</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
                {completeness < 80 && missingItems.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {missingItems.slice(0, 3).map((item) => (
                      <li key={item} className="flex items-center gap-2 text-xs text-fg-muted">
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                        <Link href={href("/candidate/profile")} className="hover:text-primary-text hover:underline">
                          {t(item)}
                        </Link>
                      </li>
                    ))}
                    {missingItems.length > 3 && (
                      <li className="text-xs text-fg-muted">{t("dash.completeness.more", { count: missingItems.length - 3 })}</li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("dash.activity.title")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-surface-sunken p-3">
                    <p className="text-xs text-fg-muted">{t("dash.activity.total")}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{fmt.number(myApplications.length)}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-sunken p-3">
                    <p className="text-xs text-fg-muted">{t("dash.activity.inProgress")}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-info">{fmt.number(inProgressCount)}</p>
                  </div>
                </div>
                {myApplications.length === 0 ? (
                  <p className="mt-3 text-xs text-fg-muted">{t("dash.activity.empty")}</p>
                ) : null}
                <Link
                  href={href("/candidate/analytics")}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline"
                >
                  {t("dash.activity.analytics")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <nav aria-label={t("dash.quick.label")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <QuickLink href={href("/candidate/chat")} icon={<Bot className="h-4 w-4" />} label={t("dash.quick.mara")} tone="primary" />
            <QuickLink href={href("/candidate/ai-assistant")} icon={<Sparkles className="h-4 w-4" />} label={t("dash.quick.assistant")} />
            <QuickLink href={href("/messages")} icon={<MessageSquare className="h-4 w-4" />} label={t("dash.quick.messages")} />
            <QuickLink href={href("/candidate/saved-searches")} icon={<Search className="h-4 w-4" />} label={t("dash.quick.savedSearches")} />
            {!FREE_MODE && (
              <QuickLink href={href("/billing")} icon={<CreditCard className="h-4 w-4" />} label={t("dash.quick.billing")} />
            )}
            <QuickLink href={href("/candidate/trust")} icon={<ShieldCheck className="h-4 w-4" />} label={t("dash.quick.trust")} tone="info" />
            <QuickLink href={href("/candidate/preferences")} icon={<Bell className="h-4 w-4" />} label={t("dash.quick.alerts")} tone="warning" />
          </nav>

          <section aria-labelledby="workspace-heading">
            <h2 id="workspace-heading" className="mb-4 text-lg font-semibold text-fg">
              {t("dash.workspace.title")}
            </h2>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {workspaceLinks.map((item) => (
                <Link
                  key={item.href}
                  href={href(item.href)}
                  className="rounded-xl border border-line bg-surface p-4 transition hover:border-line-strong hover:bg-surface-raised hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                    {t(`dash.ws.${item.key}` as CandidateMessageKey)}
                    {item.premium && (
                      <Badge variant={FREE_MODE ? "success" : "info"}>
                        {FREE_MODE ? t("ui.includedFree") : t("ui.premium")}
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">{t(`dash.ws.${item.key}.desc` as CandidateMessageKey)}</p>
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="recommended-heading">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="recommended-heading" className="text-lg font-semibold text-fg">
                  {t("dash.recommended.title")}
                </h2>
                <p className="text-sm text-fg-muted">
                  {matchesProfileReady ? t("dash.recommended.ready") : t("dash.recommended.notReady")}
                </p>
              </div>
              <Link
                href={href("/jobs")}
                className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-text hover:underline"
              >
                {t("ui.viewAll")} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>

            {instantMatches.length === 0 ? (
              <Card className="border-success-line bg-success-soft">
                <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-fg">{t("dash.recommended.emptyTitle")}</h3>
                    <p className="mt-1 text-sm text-fg-secondary">{t("dash.recommended.emptyBody")}</p>
                  </div>
                  <Link href={href("/candidate/profile")} className="shrink-0">
                    <Button>
                      {t("dash.action.profile.cta")}
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="hide-scrollbar flex snap-x gap-4 overflow-x-auto pb-4">
                {instantMatches.map((job) => (
                  <Link
                    key={job.id}
                    href={href(`/jobs/${job.slug}`)}
                    className="group min-w-[280px] snap-start sm:min-w-[340px]"
                  >
                    <Card className="h-full transition-all duration-300 group-hover:-translate-y-1 group-hover:border-line-strong group-hover:shadow-raised">
                      <CardContent className="p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 font-semibold text-fg">{job.title}</h3>
                            <p className="text-sm font-medium text-primary-text">{job.companyName}</p>
                          </div>
                          <Badge variant="success">{enumLabel(t, "jobType", job.type)}</Badge>
                        </div>
                        <div className="mb-3 mt-4 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {job.location}
                          </span>
                          {job.hiresFromAfrica && (
                            <span className="font-medium text-primary-text">{t("dash.recommended.hiresFromAfrica")}</span>
                          )}
                        </div>
                        {(job.salaryMin != null || job.salaryMax != null) && (
                          <div className="border-t border-line pt-3 font-semibold tabular-nums text-fg">
                            {[job.salaryMin, job.salaryMax]
                              .filter((v): v is number => v != null)
                              .map((v) => `${job.currency ?? "$"}${Math.round(v / 1000)}k`)
                              .join(" – ")}
                          </div>
                        )}
                        {job.matchedSkills.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {job.matchedSkills.map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-text"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </Tabs.Content>

        <Tabs.Content value="applications" className="focus-visible:outline-none">
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <CandidateStat label={t("dash.apps.total")} value={fmt.number(myApplications.length)} tone="primary" />
            <CandidateStat label={t("dash.apps.inProgress")} value={fmt.number(inProgressCount)} tone="info" />
            <CandidateStat label={t("dash.apps.accepted")} value={fmt.number(acceptedCount)} tone="success" />
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg">{t("dash.apps.title")}</h2>
                <div className="flex flex-wrap gap-2">
                  <Link href={href("/candidate/applications")}>
                    <Button variant="outline" size="sm">{t("dash.apps.openTracker")}</Button>
                  </Link>
                  <Link href={href("/jobs")}>
                    <Button size="sm">{t("dash.browseJobs")}</Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <CandidateSpinner label={t("dash.apps.loading")} />
              ) : applicationsError ? (
                <CandidateLoadError
                  error={applicationsError}
                  subject={t("ui.subject.applications")}
                  onRetry={() => {
                    setLoading(true);
                    setApplicationsError(null);
                    loadApplications();
                  }}
                />
              ) : myApplications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface-sunken px-4 py-12 text-center">
                  <BriefcaseBusiness className="mx-auto mb-4 h-10 w-10 text-fg-muted" aria-hidden="true" />
                  <p className="mb-1 font-semibold text-fg">{t("dash.apps.emptyTitle")}</p>
                  <p className="mx-auto mb-6 max-w-sm text-sm text-fg-muted">{t("dash.apps.emptyBody")}</p>
                  <Link href={href("/jobs")}>
                    <Button>{t("dash.apps.emptyCta")}</Button>
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {myApplications.map((application) => (
                    <li key={application.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <Link
                          href={href(`/jobs/${application.job.slug}`)}
                          className="font-medium text-fg hover:text-primary-text"
                        >
                          {application.job.title}
                        </Link>
                        <p className="text-sm text-fg-secondary">
                          {[application.job.employer?.companyName, application.job.location].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {t("dash.apps.applied", { date: fmt.date(application.createdAt) })}
                        </p>
                        {application.heldForReview && (
                          <p className="mt-2 text-xs text-warning">{t("dash.apps.heldForReview")}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={applicationStatusVariants[application.status] || "default"}>
                          {enumLabel(t, "status", application.status)}
                        </Badge>
                        {application.heldForReview && (
                          <TrustBadge label={t("dash.apps.safetyReview")} riskLevel="MEDIUM" variant="warning" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="settings" className="focus-visible:outline-none">
          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {t("dash.settings.visibility")}
                </h3>
                <div className="mb-2 flex items-center gap-3">
                  <CandidateSwitch
                    checked={openToWork}
                    onChange={toggleOpenToWork}
                    disabled={togglingOtw}
                    label={t("dash.settings.openToWork")}
                  />
                  <span className="text-sm font-medium text-fg">
                    {openToWork ? t("dash.settings.openToWork") : t("dash.settings.notLooking")}
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  {openToWork ? t("dash.settings.visible") : t("dash.settings.hidden")}
                </p>
                {otwError ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {t("dash.settings.otwError")}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {FREE_MODE ? t("dash.settings.plan") : t("dash.settings.subscription")}
                </h3>
                {FREE_MODE ? (
                  <p className="text-sm font-medium text-primary-text" data-testid="free-plan-note">
                    {t("dash.settings.freeNote")}
                  </p>
                ) : billingStatus ? (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant={billingStatus.plan === "FREE" ? "default" : "success"}>
                        {enumLabel(t, "plan", billingStatus.plan)}
                      </Badge>
                      {billingStatus.status === "ACTIVE" && billingStatus.plan !== "FREE" && (
                        <span className="text-xs font-medium text-primary-text">{t("dash.settings.active")}</span>
                      )}
                    </div>
                    {billingStatus.plan === "FREE" && (
                      <Link href={href("/billing")}>
                        <Button size="sm" variant="outline" className="mt-1">
                          {t("dash.settings.upgrade")}
                        </Button>
                      </Link>
                    )}
                    {billingStatus.plan !== "FREE" && billingStatus.currentPeriodEnd && (
                      <p className="mt-1 text-xs text-fg-muted">
                        {t("dash.settings.renews", { date: fmt.date(billingStatus.currentPeriodEnd) })}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-6 w-24 animate-pulse rounded bg-surface-muted" />
                )}
                <Link
                  href={href("/candidate/settings")}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-text hover:underline"
                >
                  {t("dash.settings.more")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8">
            <PushOptInCard />
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <div className="mt-10">
        <EarlyTesterFeedback area="Job match quality" />
      </div>
    </div>
  );
}
