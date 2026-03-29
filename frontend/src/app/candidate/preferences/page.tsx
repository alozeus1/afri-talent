"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { PushOptInCard } from "@/components/notifications/push-opt-in";
import { CandidatePreferenceCenter } from "@/components/notifications/candidate-preference-center";

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
  const { user, isLoading } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [summary, setSummary] = useState<CandidateRetentionSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role !== "CANDIDATE") {
      return;
    }

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
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Failed to load preferences"),
      )
      .finally(() => setLoading(false));
  }, [user]);

  const updatePreferences = async (updates: Partial<NotificationPreference>, key: string) => {
    if (!preferences) return;
    const optimistic = { ...preferences, ...updates };
    setPreferences(optimistic);
    setPendingKey(key);
    setMessage(null);
    setError(null);

    try {
      const updated = await pushNotifications.updatePreferences(updates);
      setPreferences(updated);
      setMessage("Preferences updated.");
      candidateRetentionEvents.preferencesUpdated({
        changed_key: key,
      });
    } catch (updateError) {
      setPreferences(preferences);
      setError(updateError instanceof Error ? updateError.message : "Failed to update preferences");
    } finally {
      setPendingKey(null);
    }
  };

  if (isLoading || !user || loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!preferences || !summary) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-gray-600">
              We could not load your retention settings right now.
            </p>
            <div className="mt-4">
              <Link href="/candidate">
                <Button variant="outline">Back to dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/candidate" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
            Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Alerts and retention preferences</h1>
          <p className="mt-2 text-gray-600">
            Control how AfriTalent keeps your search warm, trusted, and high-signal.
          </p>
        </div>
        <Card className="border-emerald-200 bg-emerald-50/50 md:max-w-sm">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-emerald-800">
              {summary.snapshot.notificationBudgetRemaining} of {summary.snapshot.maxNotificationsPerWeek} lifecycle nudges left this week
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Minimum spacing is {summary.snapshot.notificationCadenceHours} hours between non-critical nudges.
            </p>
          </CardContent>
        </Card>
      </div>

      <CandidatePreferenceCenter
        preferences={preferences}
        journeys={summary.journeys}
        pendingKey={pendingKey}
        message={message}
        error={error}
        onToggle={(key: PreferenceKey, value: boolean) => updatePreferences({ [key]: value }, key)}
        onSetMaxNotifications={(value) =>
          updatePreferences({ maxNotificationsPerWeek: value }, "maxNotificationsPerWeek")
        }
        onSetMinimumHours={(value) =>
          updatePreferences({ minimumHoursBetweenNotifications: value }, "minimumHoursBetweenNotifications")
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">This week&apos;s digest preview</h2>
            <p className="text-sm text-gray-600">{summary.weeklyDigest.headline}</p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Trusted roles", summary.weeklyDigest.trustedJobCount],
                ["Verified employers", summary.weeklyDigest.verifiedEmployerCount],
                ["Salary disclosed", summary.weeklyDigest.salaryTransparentCount],
                ["Visa-friendly", summary.weeklyDigest.visaFriendlyCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {summary.weeklyDigest.jobs.slice(0, 3).map((job) => (
                <div key={job.id} className="rounded-xl border border-white/70 bg-white/90 p-4 shadow-sm">
                  <Link
                    href={`/jobs/${job.slug}`}
                    className="text-sm font-semibold text-gray-900 hover:text-emerald-600"
                    onClick={() =>
                      candidateRetentionEvents.recommendationClicked({
                        source: "preferences_digest_preview",
                        job_id: job.id,
                      })
                    }
                  >
                    {job.title}
                  </Link>
                  <p className="mt-1 text-xs text-gray-500">
                    {job.employer?.companyName} • {job.location}
                  </p>
                  <p className="mt-2 text-xs text-gray-600">{job.rankingExplanation?.summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PushOptInCard />

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Why these loops matter</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <p>Trusted jobs and verified employers are prioritized before anything reaches your digest.</p>
              <p>Freshness and fit shape the order of recommendations so alerts stay useful.</p>
              <p>Volume controls stop AfriTalent from turning every weak signal into a notification.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
