"use client";

// Deterministic candidate-fit panel for the job detail page. Compares the
// signed-in candidate's profile skills against the job's tags — no AI tokens,
// no plan gate. Renders nothing for anonymous visitors or profile-less users.
// Recommendations are explainable and grounded only in the real profile.

import { useEffect, useState } from "react";
import Link from "next/link";
import { profile as profileApi } from "@/lib/api";

interface Fit {
  matched: string[];
  missing: string[];
  scorePct: number;
}

export function JobFitPanel({ jobTags }: { jobTags: string[] }) {
  const [fit, setFit] = useState<Fit | null>(null);

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
      ? { text: "Apply now — your skills cover most of what this role asks for.", tone: "text-emerald-700 dark:text-emerald-400" }
      : fit.scorePct >= 30
        ? { text: "Apply with improvements — highlight your matched skills and address the gaps in your cover letter.", tone: "text-amber-700 dark:text-amber-400" }
        : { text: "Improve first — close a few skill gaps before investing in this application.", tone: "text-gray-700 dark:text-gray-300" };

  return (
    <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Your fit for this role</h3>
        <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fit.scorePct}%</span>
      </div>
      <p className={`text-sm font-medium ${rec.tone}`}>{rec.text}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Based only on the skills in your profile vs. this listing&apos;s tags — keep your profile updated for accuracy.
      </p>
      {fit.matched.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Strong matches</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fit.matched.map((s) => (
              <span key={s} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">{s}</span>
            ))}
          </div>
        </div>
      )}
      {fit.missing.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Missing skills</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {fit.missing.map((s) => (
              <Link key={s} href={`/learning?search=${encodeURIComponent(s)}`} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 hover:border-amber-500 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                {s} → learn
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
