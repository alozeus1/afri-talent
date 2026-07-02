"use client";

// Live weekly market pulse — real numbers from the platform's own job data.
// Renders nothing until the API responds so the homepage never shows a hole.

import { useEffect, useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface MarketPulseData {
  jobsThisWeek: number;
  totalOpenJobs: number;
  africaFriendlyJobs: number;
  africaFriendlyShare: number;
  remoteShare: number;
  salaryTransparencyShare: number;
  topSkills: Array<{ skill: string; count: number }>;
}

export function MarketPulse() {
  const [data, setData] = useState<MarketPulseData | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/public/market-pulse`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.totalOpenJobs === 0) return null;

  const stats = [
    { value: data.jobsThisWeek.toLocaleString(), label: "New jobs this week" },
    { value: data.africaFriendlyJobs.toLocaleString(), label: "Verified hires-from-Africa roles" },
    { value: `${data.remoteShare}%`, label: "Remote-friendly" },
    { value: `${data.salaryTransparencyShare}%`, label: "Show salary upfront" },
  ];

  return (
    <section className="section-shell py-16">
      <div className="page-frame">
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-8 dark:border-emerald-900/60 dark:bg-emerald-950/20 md:p-12">
          <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                This week&apos;s market pulse
              </p>
              <h2 className="font-display mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50 md:text-3xl">
                Live data from {data.totalOpenJobs.toLocaleString()} open roles
              </h2>
            </div>
            <Link
              href="/blog"
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
            >
              Read the weekly digest →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{s.value}</div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.label}</div>
              </div>
            ))}
          </div>

          {data.topSkills.length > 0 && (
            <div className="mt-8 border-t border-emerald-100 pt-6 dark:border-emerald-900/60">
              <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Most in-demand skills this week
              </p>
              <div className="flex flex-wrap gap-2">
                {data.topSkills.map((s) => (
                  <Link
                    key={s.skill}
                    href={`/jobs?search=${encodeURIComponent(s.skill)}`}
                    className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-sm font-medium text-emerald-800 transition hover:border-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {s.skill}
                    <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-500">{s.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
