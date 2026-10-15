"use client";

import { useEffect, useState } from "react";
import { getPublicStatsServer } from "@/lib/server-public-api";
import { EARLY_LEARNING_LESSONS, INTERVIEW_ROLE_TRACKS, SCAM_PROTECTION_TIPS } from "@/lib/early-tester-content";
import { useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

function formatCompact(value: number, locale: string): string {
  if (value < 1000) return value.toLocaleString(locale);
  const compact = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

  return compact.toUpperCase().replace(".0", "");
}

export function HeroStats() {
  const tp = usePublicT();
  const locale = useLocale();
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
          label: tp("site.stats.earlyUsers"),
          value: formatCompact(stats.activeCandidates, locale),
        },
        {
          label: tp("site.stats.employerProof"),
          value: tp("site.stats.pending"),
        },
        {
          label: tp("site.stats.openRoles"),
          value: formatCompact(stats.jobsPosted, locale),
        },
        {
          label: tp("site.stats.africaContext"),
          value: `${stats.africanCountries}`,
        },
      ]
    : [
        {
          label: tp("site.stats.starterLessons"),
          value: `${EARLY_LEARNING_LESSONS.length}`,
        },
        {
          label: tp("site.stats.practiceQuestions"),
          value: `${interviewQuestionCount}`,
        },
        {
          label: tp("site.stats.safetyTips"),
          value: `${SCAM_PROTECTION_TIPS.length}`,
        },
        {
          label: tp("site.stats.pilotOutcomes"),
          value: tp("site.stats.soon"),
        },
      ];

  return (
    <section className="section-shell py-14">
      <div className="page-frame">
        <div className="surface-panel-strong gloss-card grid grid-cols-2 gap-6 rounded-[2rem] px-5 py-8 md:grid-cols-4 md:gap-8 md:px-10">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className="font-display mb-2 text-4xl font-bold text-primary-text">{item.value}</div>
              <div className="text-sm uppercase tracking-[0.18em] text-fg-muted">{item.label}</div>
            </div>
          ))}
        </div>

        {!hasLiveStats && (
          <p className="mt-5 text-center text-sm text-fg-muted">
            {tp("site.stats.readinessNote")}
          </p>
        )}
        {hasLiveStats && (
          <p className="mt-5 text-center text-sm text-fg-muted">
            {tp("site.stats.liveNote")}
          </p>
        )}
      </div>
    </section>
  );
}
