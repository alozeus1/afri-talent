import { getPublicStatsServer } from "@/lib/server-public-api";

function formatCompact(value: number): string {
  if (value < 1000) return value.toString();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

  return compact.toUpperCase().replace(".0", "");
}

export async function HeroStats() {
  const stats = await getPublicStatsServer();
  const hasLiveStats = Boolean(stats);
  const items = [
    {
      label: "Active Candidates",
      value: stats ? `${formatCompact(stats.activeCandidates)}+` : "10K+",
    },
    {
      label: "Partner Companies",
      value: stats ? `${formatCompact(stats.partnerCompanies)}+` : "500+",
    },
    {
      label: "Jobs Posted",
      value: stats ? `${formatCompact(stats.jobsPosted)}+` : "2K+",
    },
    {
      label: "African Countries",
      value: stats ? `${stats.africanCountries}` : "54",
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
            Live stats are temporarily unavailable. Showing trusted baseline platform metrics.
          </p>
        )}
      </div>
    </section>
  );
}
