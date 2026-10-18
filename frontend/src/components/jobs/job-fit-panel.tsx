"use client";

// Deterministic candidate-fit panel for the job detail page. Compares the
// signed-in candidate's profile skills against the job's tags — no AI tokens,
// no plan gate. Renders nothing for anonymous visitors or profile-less users.
// Recommendations are explainable and grounded only in the real profile.

import { useEffect, useState } from "react";
import Link from "next/link";
import { profile as profileApi } from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

interface Fit {
  matched: string[];
  missing: string[];
  scorePct: number;
}

export function JobFitPanel({ jobTags }: { jobTags: string[] }) {
  const [fit, setFit] = useState<Fit | null>(null);
  const tp = usePublicT();
  const locale = useLocale();

  useEffect(() => {
    if (jobTags.length === 0) return;
    let cancelled = false;
    profileApi
      .get()
      .then((p) => {
        if (cancelled || !p || !Array.isArray(p.skills) || p.skills.length === 0) return;
        const mine = new Set(p.skills.map((s: string) => s.toLowerCase()));
        const tags = [...new Set(jobTags.map((t) => t.toLowerCase()))];
        const matched = tags.filter((t) => mine.has(t));
        const missing = tags.filter((t) => !mine.has(t)).slice(0, 6);
        setFit({
          matched,
          missing,
          scorePct: Math.round((matched.length / tags.length) * 100),
        });
      })
      .catch(() => {}); // anonymous / error → render nothing
    return () => {
      cancelled = true;
    };
  }, [jobTags]);

  if (!fit) return null;

  const rec =
    fit.scorePct >= 60
      ? { text: tp("discover.fit.strong"), tone: "text-success" }
      : fit.scorePct >= 30
        ? { text: tp("discover.fit.medium"), tone: "text-warning" }
        : { text: tp("discover.fit.weak"), tone: "text-fg-secondary" };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-fg">{tp("discover.fit.title")}</h3>
        <span className="text-2xl font-bold text-primary-text">{fit.scorePct}%</span>
      </div>
      <p className={`text-sm font-medium ${rec.tone}`}>{rec.text}</p>
      <p className="mt-1 text-xs text-fg-muted">
        {tp("discover.fit.basis")}
      </p>
      {fit.matched.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-fg-secondary">{tp("discover.fit.matches")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fit.matched.map((s) => (
              <span key={s} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{s}</span>
            ))}
          </div>
        </div>
      )}
      {fit.missing.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-fg-secondary">{tp("discover.fit.missing")}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fit.missing.map((s) => (
              <Link key={s} href={localizePath(`/learning?search=${encodeURIComponent(s)}`, locale)} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {tp("discover.fit.learn", { skill: s })}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
