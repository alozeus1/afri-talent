"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  ConfirmDialog,
  ConfirmRequest,
  EmptyState,
  ErrorState,
  FilterChips,
  Notice,
  PageHeader,
  Pill,
  SkeletonList,
  StatCard,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";
import { CrawlerPanel } from "@/components/admin/crawler-panel";

type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
type StatusFilter = AlertStatus | "ALL";

interface PlatformAlert {
  id: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  status: AlertStatus;
  category: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  resolvedAt?: string;
  resolution?: string;
}

interface AlertStats {
  totalActive: number;
  bySeverity: { critical: number; warning: number; info: number };
  resolvedLast24h: number;
}

export default function OpsPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ACTIVE");
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([
        fetchAPI<{ alerts: PlatformAlert[] }>(`/api/admin/alerts?status=${filter}&limit=50`),
        fetchAPI<AlertStats>("/api/admin/alerts/stats/summary").catch(() => null),
      ]);
      setAlerts(list.alerts ?? []);
      setStats(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const acknowledge = async (alert: PlatformAlert) => {
    setBusyId(alert.id);
    setError(null);
    try {
      await fetchAPI(`/api/admin/alerts/${alert.id}/acknowledge`, { method: "POST" });
      setNotice(t("ops.acknowledged"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  };

  const askResolve = (alert: PlatformAlert) =>
    setConfirm({
      title: t("ops.resolveTitle", { title: alert.title }),
      description: t("ops.resolveHelp"),
      confirmLabel: t("ops.resolve"),
      onConfirm: async ({ reason }) => {
        await fetchAPI(`/api/admin/alerts/${alert.id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ resolution: reason }),
        });
        setNotice(t("ops.resolved"));
        await load();
      },
    });

  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: "ACTIVE", label: t("alertStatus.ACTIVE") },
    { value: "ACKNOWLEDGED", label: t("alertStatus.ACKNOWLEDGED") },
    { value: "RESOLVED", label: t("alertStatus.RESOLVED") },
    { value: "ALL", label: t("common.all") },
  ];

  return (
    <div>
      <PageHeader title={t("ops.title")} subtitle={t("ops.subtitle")} />

      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}

      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("ops.statActive")} value={fmt.number(stats.totalActive)} tone="brand" />
          <StatCard label={t("ops.statCritical")} value={fmt.number(stats.bySeverity.critical)} tone="danger" />
          <StatCard label={t("ops.statWarning")} value={fmt.number(stats.bySeverity.warning)} tone="warning" />
          <StatCard label={t("ops.statResolved24h")} value={fmt.number(stats.resolvedLast24h)} tone="info" />
        </div>
      )}

      <div className="mb-4">
        <FilterChips label={t("ops.filterLabel")} options={filters} value={filter} onChange={setFilter} />
      </div>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : alerts.length === 0 ? (
        <EmptyState title={t("ops.empty")} description={t("ops.emptyHelp")} />
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="surface-panel rounded-2xl p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={statusTone(alert.severity)}>{label("alertSeverity", alert.severity)}</Pill>
                    <Pill tone={statusTone(alert.status)}>{label("alertStatus", alert.status)}</Pill>
                    <span className={`text-xs ${muted}`}>{alert.category}</span>
                  </div>
                  <h2 className={`mt-2 font-semibold ${strong}`}>{alert.title}</h2>
                  <p className="mt-1 text-sm text-fg-secondary">{alert.description}</p>
                  <p className={`mt-2 text-xs ${muted}`}>
                    {t("ops.lastSeen", { time: fmt.relative(alert.lastOccurredAt) })} ·{" "}
                    {t("ops.firstSeen", { time: fmt.dateTime(alert.firstOccurredAt) })}
                  </p>
                  {alert.resolution && (
                    <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-fg-secondary">
                      {t("ops.resolution", { text: alert.resolution })}
                    </p>
                  )}
                </div>
                {alert.status !== "RESOLVED" && (
                  <div className="flex shrink-0 gap-2">
                    {alert.status === "ACTIVE" && (
                      <Button size="sm" variant="outline" isLoading={busyId === alert.id} onClick={() => void acknowledge(alert)}>
                        {t("ops.acknowledge")}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => askResolve(alert)} disabled={busyId === alert.id}>
                      {t("ops.resolve")}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CrawlerPanel />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
