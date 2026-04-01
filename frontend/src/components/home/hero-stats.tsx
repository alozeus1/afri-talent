"use client";

import { useEffect, useMemo, useState } from "react";
import { publicStats, PublicStats } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

function formatCompact(value: number): string {
  if (value < 1000) return value.toString();
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

  return compact.toUpperCase().replace(".0", "");
}

export function HeroStats() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    publicStats
      .get()
      .then((data) => {
        if (!mounted) return;
        setStats(data);
      })
      .catch(() => {
        if (!mounted) return;
        setError(true);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const items = useMemo(
    () => [
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
    ],
    [stats],
  );

  return (
    <section className="py-16 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {items.map((item) => (
            <div key={item.label} className="text-center">
              {loading ? (
                <div className="mx-auto flex flex-col items-center">
                  <Skeleton className="h-10 w-20 mb-2" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ) : (
                <>
                  <div className="text-4xl font-bold text-emerald-600 mb-2">{item.value}</div>
                  <div className="text-gray-600 dark:text-gray-300">{item.label}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {!loading && error && (
          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            Live stats are temporarily unavailable. Showing trusted baseline platform metrics.
          </p>
        )}
      </div>
    </section>
  );
}
