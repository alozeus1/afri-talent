"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  candidateAnalytics,
  CandidateRetentionSummaryResponse,
  NotificationPreference,
  pushNotifications,
} from "@/lib/api";
import { candidateRetentionEvents } from "@/lib/analytics";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PushOptInCard } from "@/components/notifications/push-opt-in";
import { CandidatePreferenceCenter } from "@/components/notifications/candidate-preference-center";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidatePageHeader,
  CandidateSpinner,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

type PreferenceKey =
  | "savedSearchAlerts"
  | "weeklyDigests"
  | "applicationReminders"
  | "profileCompletionNudges"
  | "verificationCompletionNudges"
  | "visaRelocationAlerts"
  | "salaryInsights"
  | "interviewPrepRecommendations";

export default function CandidatePreferencesPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [summary, setSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<CandidateMessageKey | null>(null);
  const [error, setError] = useState<CandidateMessageKey | null>(null);

  const href = (path: string) => localizePath(path, locale);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([pushNotifications.getPreferences(), candidateAnalytics.retentionSummary()])
      .then(([prefs, retentionSummary]) => {
        setPreferences(prefs);
        setSummary(retentionSummary);
        candidateRetentionEvents.summaryViewed({
          recommendation_count: retentionSummary.recommendations.length,
          budget_remaining: retentionSummary.snapshot.notificationBudgetRemaining,
        });
        retentionSummary.experiments.forEach((experiment) => {
          candidateRetentionEvents.experimentExposed({
            experiment_key: experiment.key,
            variant: experiment.variant,
          });
        });
      })
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role === "CANDIDATE") load();
  }, [user, load]);

  const updatePreferences = async (updates: Partial<NotificationPreference>, key: string) => {
    if (!preferences) return;
    const previous = preferences;
    setPreferences({ ...preferences, ...updates });
    setPendingKey(key);
    setMessage(null);
    setError(null);

    try {
      const updated = await pushNotifications.updatePreferences(updates);
      setPreferences(updated);
      setMessage("prefs.updated");
      candidateRetentionEvents.preferencesUpdated({
        changed_key: key,
      });
    } catch {
      setPreferences(previous);
      setError("prefs.updateFailed");
    } finally {
      setPendingKey(null);
    }
  };

  if (isLoading || !user || loading) {
    return <CandidateSpinner className="py-24" />;
  }

  if (!preferences || !summary) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
        <CandidateLoadError error={loadError} subject={t("ui.subject.preferences")} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidateBackLink href={href("/candidate")}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("prefs.title")}
        description={t("prefs.subtitle")}
        actions={
          <div className="rounded-2xl border border-success-line bg-success-soft px-4 py-3 md:max-w-sm">
            <p className="text-sm font-semibold text-fg">
              {t("prefs.budget", {
                remaining: fmt.number(summary.snapshot.notificationBudgetRemaining),
                max: fmt.number(summary.snapshot.maxNotificationsPerWeek),
              })}
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              {t("prefs.cadence", { hours: fmt.number(summary.snapshot.notificationCadenceHours) })}
            </p>
          </div>
        }
      />

      <CandidatePreferenceCenter
        preferences={preferences}
        journeys={summary.journeys}
        pendingKey={pendingKey}
        message={message ? t(message) : null}
        error={error ? t(error) : null}
        onToggle={(key: PreferenceKey, value: boolean) => updatePreferences({ [key]: value }, key)}
        onSetMaxNotifications={(value) => updatePreferences({ maxNotificationsPerWeek: value }, "maxNotificationsPerWeek")}
        onSetMinimumHours={(value) =>
          updatePreferences({ minimumHoursBetweenNotifications: value }, "minimumHoursBetweenNotifications")
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-fg">{t("prefs.digest.title")}</h2>
            <p className="text-sm text-fg-secondary">{summary.weeklyDigest.headline}</p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ["an.digest.trustedRoles", summary.weeklyDigest.trustedJobCount],
                  ["an.digest.verifiedEmployers", summary.weeklyDigest.verifiedEmployerCount],
                  ["an.digest.salaryDisclosed", summary.weeklyDigest.salaryTransparentCount],
                  ["an.digest.visaFriendly", summary.weeklyDigest.visaFriendlyCount],
                ] as Array<[CandidateMessageKey, number]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-surface-sunken p-3">
                  <p className="text-xs uppercase tracking-wide text-fg-muted">{t(label)}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{fmt.number(value)}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {summary.weeklyDigest.jobs.slice(0, 3).map((job) => (
                <div key={job.id} className="rounded-xl border border-line bg-surface-sunken p-4">
                  <Link
                    href={href(`/jobs/${job.slug}`)}
                    className="text-sm font-semibold text-fg hover:text-primary-text"
                    onClick={() =>
                      candidateRetentionEvents.recommendationClicked({
                        source: "preferences_digest_preview",
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
              {summary.weeklyDigest.jobs.length === 0 ? (
                <p className="text-sm text-fg-muted">{t("an.digest.empty")}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PushOptInCard />

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-fg">{t("prefs.why.title")}</h2>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 ps-5 text-sm text-fg-secondary">
                <li>{t("prefs.why.1")}</li>
                <li>{t("prefs.why.2")}</li>
                <li>{t("prefs.why.3")}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
