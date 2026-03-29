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
    <section className="py-16 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">{item.value}</div>
              <div className="text-gray-600 dark:text-gray-300">{item.label}</div>
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
