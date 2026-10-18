"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { hasAdminKey, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import { EmptyState, ErrorState, Pill, PillTone, SkeletonList, StatCard, TableShell, Td, Th, muted, strong } from "./console-ui";

// Job crawler (aggregator engine) metrics: GET /api/aggregator/health and
// /api/aggregator/runs/latest. Shapes: lib/jobs/aggregator/engine/README.md.

interface CrawlerSourceMetrics {
  source: string;
  name?: string;
  status: string;
  skipReason?: string;
  circuit?: string;
  fetched?: number;
  eligible?: number;
  inserted?: number;
  updated?: number;
  errors?: number;
}

interface CrawlerRun {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  durationMs: number;
  totals: Record<string, number>;
  sources: CrawlerSourceMetrics[];
}

interface CrawlerHealth {
  engine: string;
  feeds: Array<{ id: string; name: string; kind: string; circuit: { state: string; consecutiveFailures: number } }>;
  atsCompanies: number;
}

const tone = (state: string): PillTone =>
  state === "success" || state === "closed" ? "green" : state === "partial" || state === "half_open" || state === "skipped" ? "amber" : "red";

export function CrawlerPanel() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const [health, setHealth] = useState<CrawlerHealth | null>(null);
  const [run, setRun] = useState<CrawlerRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, latest] = await Promise.all([
        fetchAPI<CrawlerHealth>("/api/aggregator/health"),
        fetchAPI<{ run: CrawlerRun | null }>("/api/aggregator/runs/latest"),
      ]);
      setHealth(h);
      setRun(latest.run);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const state = (value: string) => {
    const key = `crawler.state.${value}`;
    return hasAdminKey(key) ? t(key) : value;
  };
  const openCircuits = health?.feeds.filter((f) => f.circuit.state !== "closed").length ?? 0;

  return (
    <section aria-labelledby="crawler-title" className="mt-10" data-testid="crawler-panel">
      <h2 id="crawler-title" className={`text-lg font-semibold ${strong}`}>{t("crawler.title")}</h2>
      <p className={`mb-4 text-sm ${muted}`}>{t("crawler.subtitle")}</p>

      {loading ? (
        <SkeletonList rows={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("crawler.feeds")} value={fmt.number(health?.feeds.length ?? 0)} tone="brand" />
            <StatCard label={t("crawler.atsBoards")} value={fmt.number(health?.atsCompanies ?? 0)} tone="info" />
            <StatCard label={t("crawler.openCircuits")} value={fmt.number(openCircuits)} tone={openCircuits > 0 ? "warning" : "neutral"} />
            <StatCard
              label={t("crawler.lastRunInserted")}
              value={fmt.number(run?.totals?.inserted ?? 0)}
              hint={run ? t("crawler.lastRunAt", { time: fmt.relative(run.startedAt) }) : undefined}
              tone="neutral"
            />
          </div>

          {!run ? (
            <EmptyState title={t("crawler.noRuns")} description={t("crawler.noRunsHelp")} />
          ) : (
            <>
              <p className={`mb-3 flex flex-wrap items-center gap-2 text-sm ${muted}`}>
                <Pill tone={tone(run.status)}>{state(run.status)}</Pill>
                {t("crawler.runSummary", {
                  fetched: fmt.number(run.totals?.fetched ?? 0),
                  eligible: fmt.number(run.totals?.eligible ?? 0),
                  seconds: fmt.number(Math.round(run.durationMs / 1000)),
                })}
              </p>
              <TableShell>
                <thead>
                  <tr>
                    <Th>{t("crawler.colSource")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th>{t("crawler.colFetched")}</Th>
                    <Th>{t("crawler.colEligible")}</Th>
                    <Th>{t("crawler.colInserted")}</Th>
                    <Th>{t("crawler.colErrors")}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-soft)]">
                  {(run.sources ?? []).map((s) => (
                    <tr key={s.source}>
                      <Td><span className={`font-medium ${strong}`}>{s.name ?? s.source}</span></Td>
                      <Td><Pill tone={tone(s.status)}>{state(s.status)}</Pill></Td>
                      <Td>{fmt.number(s.fetched ?? 0)}</Td>
                      <Td>{fmt.number(s.eligible ?? 0)}</Td>
                      <Td>{fmt.number(s.inserted ?? 0)}</Td>
                      <Td>{fmt.number(s.errors ?? 0)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </>
          )}
        </>
      )}
    </section>
  );
}
