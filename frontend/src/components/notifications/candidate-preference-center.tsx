"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  CandidateRetentionJourney,
  NotificationPreference,
} from "@/lib/api";

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
  message?: string | null;
  error?: string | null;
}

const preferenceGroups: Array<{
  title: string;
  description: string;
  items: Array<{ key: PreferenceKey; label: string; hint: string }>;
}> = [
  {
    title: "Job discovery",
    description: "Keep high-signal opportunities flowing without turning alerts into noise.",
    items: [
      {
        key: "savedSearchAlerts",
        label: "Saved search alerts",
        hint: "Immediate or batched matches from your saved searches.",
      },
      {
        key: "weeklyDigests",
        label: "Weekly digest",
        hint: "A weekly roundup of the strongest trusted jobs and employers.",
      },
      {
        key: "visaRelocationAlerts",
        label: "Visa and relocation alerts",
        hint: "Extra signals when a role explicitly supports cross-border moves.",
      },
      {
        key: "salaryInsights",
        label: "Salary insights",
        hint: "Pay-market nudges when enough salary data exists for your target roles.",
      },
    ],
  },
  {
    title: "Candidate momentum",
    description: "Stay active on the parts of the journey that move you toward a shortlist.",
    items: [
      {
        key: "applicationReminders",
        label: "Application reminders",
        hint: "Prompts to keep a healthy application rhythm when your feed is warming up.",
      },
      {
        key: "profileCompletionNudges",
        label: "Profile completion nudges",
        hint: "Reminders to fill the missing proof points employers trust most.",
      },
      {
        key: "verificationCompletionNudges",
        label: "Verification nudges",
        hint: "Suggestions to add phone, ID, and skills trust signals.",
      },
      {
        key: "interviewPrepRecommendations",
        label: "Interview prep recommendations",
        hint: "Suggestions to practice when employer interest is active.",
      },
    ],
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
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Notification preferences</h2>
          <p className="text-sm text-gray-600">
            Tune the lifecycle loops you want AfriTalent to run on your behalf.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {preferenceGroups.map((group) => (
            <section key={group.title} className="rounded-2xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {group.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600">{group.description}</p>
              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 p-3"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.label}</div>
                      <div className="mt-1 text-xs text-gray-500">{item.hint}</div>
                    </div>
                    <input
                      type="checkbox"
                      aria-label={item.label}
                      checked={Boolean(preferences[item.key])}
                      disabled={pendingKey === item.key}
                      onChange={(event) => onToggle(item.key, event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Volume controls
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-gray-700">
                <span className="mb-2 block font-medium text-gray-900">Max notifications per week</span>
                <select
                  value={preferences.maxNotificationsPerWeek}
                  onChange={(event) => onSetMaxNotifications(Number(event.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  {[3, 4, 6, 8, 10].map((value) => (
                    <option key={value} value={value}>
                      {value} per week
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-700">
                <span className="mb-2 block font-medium text-gray-900">Minimum hours between nudges</span>
                <select
                  value={preferences.minimumHoursBetweenNotifications}
                  onChange={(event) => onSetMinimumHours(Number(event.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  {[8, 12, 18, 24, 36].map((value) => (
                    <option key={value} value={value}>
                      {value} hours
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {message && <p className="text-sm text-emerald-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Lifecycle checklist</h2>
          <p className="text-sm text-gray-600">
            These are the journeys AfriTalent will keep nudging toward, in order of signal quality.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {journeys.slice(0, 5).map((journey) => (
            <div
              key={journey.key}
              className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{journey.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{journey.description}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    journey.status === "DONE"
                      ? "bg-emerald-100 text-emerald-700"
                      : journey.status === "READY"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {journey.status}
                </span>
              </div>
              <div className="mt-3">
                <Link href={journey.href}>
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
