"use client";

import { useEffect, useState } from "react";
import { getPublicStatsServer } from "@/lib/server-public-api";
import { EARLY_LEARNING_LESSONS, INTERVIEW_ROLE_TRACKS, SCAM_PROTECTION_TIPS } from "@/lib/early-tester-content";

function formatCompact(value: number): string {
  if (value < 1000) return value.toString();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

  return compact.toUpperCase().replace(".0", "");
}

export function HeroStats() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getPublicStatsServer>>>(null);

  useEffect(() => {
    let isMounted = true;

    void getPublicStatsServer().then((nextStats) => {
      if (isMounted) {
        setStats(nextStats);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const hasLiveStats = Boolean(stats);
  const interviewQuestionCount = INTERVIEW_ROLE_TRACKS.reduce(
    (total, track) => total + track.questions.length,
    0,
  );
  const items = stats
    ? [
        {
          label: "Early Users",
          value: `${formatCompact(stats.activeCandidates)}`,
        },
        {
          label: "Employer Proof",
          value: "Pending",
        },
        {
          label: "Open Roles Indexed",
          value: `${formatCompact(stats.jobsPosted)}`,
        },
        {
          label: "Africa Context",
          value: `${stats.africanCountries}`,
        },
      ]
    : [
        {
          label: "Starter Lessons",
          value: `${EARLY_LEARNING_LESSONS.length}`,
        },
        {
          label: "Practice Questions",
          value: `${interviewQuestionCount}`,
        },
        {
          label: "Trust Safety Tips",
          value: `${SCAM_PROTECTION_TIPS.length}`,
        },
        {
          label: "Pilot Outcomes",
          value: "Soon",
        },
      ];

  return (
    <section className="section-shell py-14">
      <div className="page-frame">
        <div className="surface-panel-strong gloss-card grid grid-cols-2 gap-6 rounded-[2rem] px-5 py-8 md:grid-cols-4 md:gap-8 md:px-10">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className="font-display mb-2 text-4xl font-bold text-emerald-700 dark:text-emerald-300">{item.value}</div>
              <div className="text-sm uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{item.label}</div>
            </div>
          ))}
        </div>

        {!hasLiveStats && (
          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            Showing verifiable product-readiness signals. Candidate outcomes, employer counts, and testimonials will appear after real early-access activity.
          </p>
        )}
        {hasLiveStats && (
          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            Employer validation, hiring-partner counts, and testimonials will appear only after verified early-access workflows produce real proof.
          </p>
        )}
      </div>
    </section>
  );
}
