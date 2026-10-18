"use client";

import { useCallback, useEffect, useState } from "react";
import { adminAts, AdminAtsDashboard } from "@/lib/api";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Pill,
  SkeletonList,
  StatCard,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

export default function AdminIntegrationsPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const [dashboard, setDashboard] = useState<AdminAtsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await adminAts.dashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const when = (value: string | null | undefined) => (value ? fmt.dateTime(value) : t("ats.notYet"));

  return (
    <div>
      <PageHeader title={t("ats.title")} subtitle={t("ats.subtitle")} />

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !dashboard ? (
        <EmptyState title={t("ats.unavailable")} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t("ats.healthy")}
              value={fmt.number(dashboard.summary.healthyConnections)}
              hint={t("ats.totalIntegrations", { count: fmt.number(dashboard.summary.totalConnections) })}
              tone="brand"
            />
            <StatCard label={t("ats.needsAttention")} value={fmt.number(dashboard.summary.needsAttentionConnections)} hint={t("ats.needsAttentionHint")} tone="info" />
            <StatCard label={t("ats.failedSyncs")} value={fmt.number(dashboard.summary.failedSyncRunsLast7Days)} hint={t("ats.failedSyncsHint")} tone="warning" />
            <StatCard label={t("ats.failedWebhooks")} value={fmt.number(dashboard.summary.failedWebhooksLast7Days)} hint={t("ats.failedWebhooksHint")} tone="danger" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Panel title={t("ats.providers")}>
              {dashboard.providerBreakdown.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("ats.noProviders")}</p>
              ) : (
                <ul className="space-y-3">
                  {dashboard.providerBreakdown.map((provider) => (
                    <li key={provider.provider} className="rounded-xl border border-line p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className={`font-semibold ${strong}`}>{provider.label}</p>
                          <p className={`mt-0.5 text-sm ${muted}`}>{t("ats.connectedAccounts", { count: fmt.number(provider.total) })}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Pill tone="green">{t("ats.countHealthy", { count: provider.healthy })}</Pill>
                          <Pill tone="amber">{t("ats.countDegraded", { count: provider.degraded })}</Pill>
                          <Pill tone="red">{t("ats.countDown", { count: provider.down })}</Pill>
                          <Pill tone="blue">{t("ats.countAttention", { count: provider.needsAttention })}</Pill>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("ats.review")}>
              {(() => {
                const items = dashboard.connections.filter((c) => c.healthStatus !== "HEALTHY").slice(0, 8);
                if (items.length === 0) return <p className={`text-sm ${muted}`}>{t("ats.allHealthy")}</p>;
                return (
                  <ul className="space-y-3">
                    {items.map((connection) => (
                      <li key={connection.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`font-semibold ${strong}`}>{connection.employer.companyName}</p>
                              <Pill tone={statusTone(connection.healthStatus)}>{label("atsHealth", connection.healthStatus)}</Pill>
                            </div>
                            <p className={`mt-1 break-all text-sm ${muted}`}>
                              {connection.providerLabel} · {connection.externalOrgId} · {connection.employer.user.email}
                            </p>
                            {connection.lastErrorMessage && <p className="mt-2 text-sm text-danger">{connection.lastErrorMessage}</p>}
                          </div>
                          <div className={`shrink-0 text-xs md:text-end ${muted}`}>
                            <p>{t("ats.lastSync", { time: when(connection.lastSyncedAt) })}</p>
                            <p>{t("ats.lastWebhook", { time: when(connection.lastWebhookAt) })}</p>
                            <p>{t("ats.failedRuns", { count: connection.recentLogSummary.failedSyncRuns })}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={t("ats.recentFailedSyncs")}>
              {dashboard.recentFailedSyncs.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("ats.noFailedSyncs")}</p>
              ) : (
                <ul className="space-y-3">
                  {dashboard.recentFailedSyncs.map((run) => (
                    <li key={run.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-semibold ${strong}`}>{run.connection.employer.companyName}</p>
                        <Pill tone={statusTone(run.status)}>{label("atsRun", run.status)}</Pill>
                      </div>
                      <p className={`mt-1 text-sm ${muted}`}>
                        {run.connection.provider} · {label("atsSync", run.syncType)} · {when(run.startedAt)}
                      </p>
                      <p className="mt-2 text-sm text-fg-secondary">{t("ats.errorsRetries", { errors: run.errorCount, retries: run.retryCount })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("ats.recentFailedWebhooks")}>
              {dashboard.recentFailedWebhooks.length === 0 ? (
                <p className={`text-sm ${muted}`}>{t("ats.noFailedWebhooks")}</p>
              ) : (
                <ul className="space-y-3">
                  {dashboard.recentFailedWebhooks.map((event) => (
                    <li key={event.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-semibold ${strong}`}>{event.connection.employer.companyName}</p>
                        <Pill tone="red">{label("atsRun", event.status)}</Pill>
                      </div>
                      <p className={`mt-1 break-all text-sm ${muted}`}>
                        {event.connection.provider} · {event.eventType} · {when(event.receivedAt)}
                      </p>
                      {event.errorMessage && <p className="mt-2 text-sm text-danger">{event.errorMessage}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
