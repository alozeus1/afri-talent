"use client";

import { useT } from "@/lib/i18n/client";

export function JobsHero() {
  const t = useT();
  return (
    <div className="relative overflow-hidden rounded-[2.5rem] border border-[var(--border-soft)] bg-gradient-to-br from-[#0c1824] via-[#0a5c5e] to-[#f59e0b] animate-gradient-breath px-6 py-12 text-white shadow-[0_30px_110px_rgba(11,20,32,0.2)] md:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.1),transparent_20%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-white/68">{t("jobs.hero.signal")}</p>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight md:text-5xl">{t("jobs.hero.heading")}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-white/78">
            {t("jobs.hero.description")}
          </p>
        </div>
        <div className="surface-panel gloss-card flex flex-col justify-between rounded-[1.75rem] p-5 text-gray-900 dark:text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">{t("jobs.hero.rankingSignals")}</p>
            <p className="mt-3 font-display text-2xl font-bold">{t("jobs.hero.rankingDesc")}</p>
          </div>
          <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            AfriTalent prioritizes roles that feel more credible and more actionable, not just more plentiful.
          </p>
        </div>
      </div>
    </div>
  );
}
