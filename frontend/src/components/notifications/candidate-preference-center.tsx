"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { candidateFieldClass } from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";
import type { CandidateRetentionJourney, NotificationPreference } from "@/lib/api";

type PreferenceKey =
  | "savedSearchAlerts"
  | "weeklyDigests"
  | "applicationReminders"
  | "profileCompletionNudges"
  | "verificationCompletionNudges"
  | "visaRelocationAlerts"
  | "salaryInsights"
  | "interviewPrepRecommendations";

interface CandidatePreferenceCenterProps {
  preferences: NotificationPreference;
  journeys: CandidateRetentionJourney[];
  onToggle: (key: PreferenceKey, value: boolean) => void;
  onSetMaxNotifications: (value: number) => void;
  onSetMinimumHours: (value: number) => void;
  pendingKey?: string | null;
  /** Already-translated status line. */
  message?: string | null;
  /** Already-translated error line. */
  error?: string | null;
}

// Labels resolve to pc.group.<id>[.desc] and pc.item.<key>[.hint].
const preferenceGroups: Array<{ id: "discovery" | "momentum"; items: PreferenceKey[] }> = [
  { id: "discovery", items: ["savedSearchAlerts", "weeklyDigests", "visaRelocationAlerts", "salaryInsights"] },
  {
    id: "momentum",
    items: ["applicationReminders", "profileCompletionNudges", "verificationCompletionNudges", "interviewPrepRecommendations"],
  },
];

export function CandidatePreferenceCenter({
  preferences,
  journeys,
  onToggle,
  onSetMaxNotifications,
  onSetMinimumHours,
  pendingKey,
  message,
  error,
}: CandidatePreferenceCenterProps) {
  const t = useCandidateT();
  const locale = useLocale();
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("pc.title")}</h2>
          <p className="text-sm text-fg-secondary">{t("pc.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {preferenceGroups.map((group) => (
            <section key={group.id} className="rounded-2xl border border-line p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {t(`pc.group.${group.id}` as CandidateMessageKey)}
              </h3>
              <p className="mt-1 text-sm text-fg-secondary">{t(`pc.group.${group.id}.desc` as CandidateMessageKey)}</p>
              <div className="mt-4 space-y-2">
                {group.items.map((key) => {
                  const label = t(`pc.item.${key}` as CandidateMessageKey);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-surface-sunken p-3 transition-colors hover:border-line-strong"
                    >
                      <div>
                        <div className="text-sm font-medium text-fg">{label}</div>
                        <div className="mt-1 text-xs text-fg-muted">{t(`pc.item.${key}.hint` as CandidateMessageKey)}</div>
                      </div>
                      <input
                        type="checkbox"
                        aria-label={label}
                        checked={Boolean(preferences[key])}
                        disabled={pendingKey === key}
                        onChange={(event) => onToggle(key, event.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-line p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t("pc.volume")}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-fg-secondary">
                <span className="mb-2 block font-medium text-fg">{t("pc.maxPerWeek")}</span>
                <select
                  value={preferences.maxNotificationsPerWeek}
                  onChange={(event) => onSetMaxNotifications(Number(event.target.value))}
                  className={candidateFieldClass}
                >
                  {[3, 4, 6, 8, 10].map((value) => (
                    <option key={value} value={value}>
                      {t("pc.perWeek", { count: value })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-fg-secondary">
                <span className="mb-2 block font-medium text-fg">{t("pc.minHours")}</span>
                <select
                  value={preferences.minimumHoursBetweenNotifications}
                  onChange={(event) => onSetMinimumHours(Number(event.target.value))}
                  className={candidateFieldClass}
                >
                  {[8, 12, 18, 24, 36].map((value) => (
                    <option key={value} value={value}>
                      {t("pc.hours", { count: value })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {message && (
            <p role="status" className="text-sm font-medium text-success">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("pc.checklist")}</h2>
          <p className="text-sm text-fg-secondary">{t("pc.checklist.desc")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {journeys.slice(0, 5).map((journey) => (
            <div key={journey.key} className="rounded-2xl border border-line bg-surface-sunken p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg">{journey.title}</p>
                  <p className="mt-1 text-xs text-fg-muted">{journey.description}</p>
                </div>
                <Badge variant={journey.status === "DONE" ? "success" : journey.status === "READY" ? "warning" : "info"}>
                  {enumLabel(t, "dash.journey", journey.status)}
                </Badge>
              </div>
              <div className="mt-3">
                <Link href={localizePath(journey.href, locale)}>
                  <Button size="sm" variant={journey.status === "DONE" ? "ghost" : "outline"}>
                    {journey.ctaLabel}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
