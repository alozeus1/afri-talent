"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  applications,
  candidateAnalytics,
  messages,
  Application,
  ApplicationFunnel,
  MessageThread,
} from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { EarlyTesterFeedback } from "@/components/feedback/early-tester-feedback";
import { APPLICATION_ASSISTANT_STATUSES } from "@/lib/early-tester-content";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidatePageHeader,
  CandidateSpinner,
  CandidateStat,
  candidateFieldClass,
} from "@/components/candidate/candidate-ui";
import { applicationStatusVariants } from "@/components/candidate/application-status";

const statusBar: Record<string, string> = {
  PENDING: "bg-line-strong",
  REVIEWING: "bg-info",
  SHORTLISTED: "bg-warning",
  INTERVIEW: "bg-info",
  OFFERED: "bg-success",
  ACCEPTED: "bg-success",
  HIRED: "bg-success",
  REJECTED: "bg-danger",
};

type SortKey = "newest" | "status";
type LocalTrackerState = Record<string, { status: string; note: string; reminder: string }>;
const TRACKER_STORAGE_KEY = "afritalent_application_tracker";

export default function CandidateApplicationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const [myApplications, setMyApplications] = useState<Application[]>([]);
  const [funnel, setFunnel] = useState<ApplicationFunnel | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [localTracker, setLocalTracker] = useState<LocalTrackerState>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem(TRACKER_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as LocalTrackerState) : {};
    } catch {
      return {};
    }
  });

  const href = (path: string) => localizePath(path, locale);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const load = useCallback(() => {
    Promise.all([
      applications.my(),
      candidateAnalytics.applicationFunnel(),
      messages.threads().then((r) => r.threads).catch(() => [] as MessageThread[]),
    ])
      .then(([apps, funnelData, threadData]) => {
        setMyApplications(apps);
        setFunnel(funnelData);
        setThreads(threadData);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") load();
  }, [user, load]);

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const sorted = [...myApplications].sort((a, b) => {
    if (sortBy === "status") return a.status.localeCompare(b.status);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function updateLocalTracker(applicationId: string, patch: Partial<LocalTrackerState[string]>) {
    setLocalTracker((prev) => {
      const next = {
        ...prev,
        [applicationId]: {
          status: prev[applicationId]?.status || "Applied",
          note: prev[applicationId]?.note || "",
          reminder: prev[applicationId]?.reminder || "",
          ...patch,
        },
      };
      try {
        window.localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep in-memory state */
      }
      return next;
    });
  }

  const funnelTotal = funnel ? funnel.totalApplied + funnel.reviewing + funnel.shortlisted + funnel.accepted : 0;

  const funnelSegments =
    funnel && funnelTotal > 0
      ? [
          { label: t("apps.pipeline.applied"), count: funnel.totalApplied, color: "bg-line-strong" },
          { label: t("apps.pipeline.reviewing"), count: funnel.reviewing, color: "bg-info" },
          { label: t("apps.pipeline.shortlisted"), count: funnel.shortlisted, color: "bg-warning" },
          { label: t("apps.pipeline.accepted"), count: funnel.accepted, color: "bg-success" },
        ]
      : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("apps.title")}
        description={
          <>
            {t("apps.subtitle")}
            <span className="mt-1 block text-xs text-fg-muted">{t("apps.localNote")}</span>
          </>
        }
        actions={
          <Link href={href("/jobs")}>
            <Button>{t("apps.empty.cta")}</Button>
          </Link>
        }
      />

      {error ? (
        <CandidateLoadError
          className="mb-6"
          error={error}
          subject={t("ui.subject.applications")}
          onRetry={() => {
            setLoading(true);
            setError(null);
            load();
          }}
        />
      ) : null}

      {loading ? (
        <CandidateSpinner label={t("dash.apps.loading")} className="py-24" />
      ) : error ? null : (
        <>
          {funnel && (
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <CandidateStat label={t("apps.stat.totalApplied")} value={fmt.number(funnel.totalApplied)} />
              <CandidateStat label={t("apps.stat.inReview")} value={fmt.number(funnel.reviewing)} tone="info" />
              <CandidateStat label={t("apps.stat.shortlisted")} value={fmt.number(funnel.shortlisted)} tone="warning" />
              <CandidateStat label={t("apps.stat.accepted")} value={fmt.number(funnel.accepted)} tone="success" />
              <CandidateStat label={t("apps.stat.rejected")} value={fmt.number(funnel.rejected)} />
            </div>
          )}

          {funnelSegments.length > 0 && (
            <Card className="mb-8">
              <CardContent className="p-6">
                <h2 className="mb-4 text-lg font-semibold text-fg">{t("apps.pipeline.title")}</h2>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                  {funnelSegments.map((seg) =>
                    seg.count > 0 ? (
                      <div
                        key={seg.label}
                        className={`${seg.color} transition-all`}
                        style={{ width: `${(seg.count / funnelTotal) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                  {funnelSegments.map((seg) => (
                    <li key={seg.label} className="flex items-center gap-2 text-sm text-fg-secondary">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${seg.color}`} />
                      {t("apps.pipeline.segment", { label: seg.label, count: fmt.number(seg.count) })}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-fg">{t("apps.list.title")}</h2>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              {t("apps.sort.label")}
              <select
                className={`${candidateFieldClass} w-auto py-1.5`}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                <option value="newest">{t("apps.sort.newest")}</option>
                <option value="status">{t("apps.sort.status")}</option>
              </select>
            </label>
          </div>

          {sorted.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title={t("apps.empty.title")}
              description={t("apps.empty.body")}
              primaryAction={{ label: t("apps.empty.cta"), href: href("/jobs") }}
            />
          ) : (
            <ul className="space-y-4">
              {sorted.map((app) => {
                const thread = threads.find((th) => th.job?.id === app.job.id);
                const tracker = localTracker[app.id];
                return (
                  <li key={app.id}>
                    <Card className="overflow-hidden">
                      <div aria-hidden="true" className={`h-1 ${statusBar[app.status] || "bg-line-strong"}`} />
                      <CardContent className="p-6">
                        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-3">
                              <Link
                                href={href(`/jobs/${app.job.slug}`)}
                                className="truncate text-lg font-semibold text-fg hover:text-primary-text"
                              >
                                {app.job.title}
                              </Link>
                              <Badge variant={applicationStatusVariants[app.status] || "default"}>
                                {enumLabel(t, "status", app.status)}
                              </Badge>
                            </div>
                            <p className="text-sm text-fg-secondary">
                              {[app.job.employer?.companyName, app.job.location, app.job.type ? enumLabel(t, "jobType", app.job.type) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            <p className="mt-1 text-xs text-fg-muted">
                              <time dateTime={app.createdAt} title={fmt.dateTime(app.createdAt)}>
                                {t("apps.applied", { time: fmt.relative(app.createdAt) })}
                              </time>
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <label className="text-xs font-medium text-fg-secondary">
                                {t("apps.tracker.status")}
                                <select
                                  value={tracker?.status || "Applied"}
                                  onChange={(event) => updateLocalTracker(app.id, { status: event.target.value })}
                                  className={`${candidateFieldClass} mt-1 text-xs`}
                                >
                                  {APPLICATION_ASSISTANT_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {enumLabel(t, "tracker", status)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs font-medium text-fg-secondary">
                                {t("apps.tracker.reminder")}
                                <input
                                  type="date"
                                  value={tracker?.reminder || ""}
                                  onChange={(event) => updateLocalTracker(app.id, { reminder: event.target.value })}
                                  className={`${candidateFieldClass} mt-1 text-xs`}
                                />
                              </label>
                              <label className="text-xs font-medium text-fg-secondary">
                                {t("apps.tracker.notes")}
                                <input
                                  type="text"
                                  value={tracker?.note || ""}
                                  onChange={(event) => updateLocalTracker(app.id, { note: event.target.value })}
                                  placeholder={t("apps.tracker.notesPlaceholder")}
                                  className={`${candidateFieldClass} mt-1 text-xs`}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Link href={href(`/jobs/${app.job.slug}`)}>
                              <Button variant="outline" size="sm">
                                {t("apps.viewJob")}
                              </Button>
                            </Link>
                            <Link href={href("/candidate/calendar")}>
                              <Button variant="ghost" size="sm">
                                {t("apps.schedule")}
                              </Button>
                            </Link>
                          </div>
                        </div>
                        {thread ? (
                          <Link
                            href={href(`/messages/${thread.id}`)}
                            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary-text hover:underline"
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("apps.messages")}
                          </Link>
                        ) : null}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <div className="mt-10">
        <EarlyTesterFeedback area="Application tracker usefulness" />
      </div>
    </div>
  );
}
