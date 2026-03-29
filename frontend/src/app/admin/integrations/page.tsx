"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminAts, AdminAtsDashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Not yet";
  }

  return new Date(value).toLocaleString();
}

function healthVariant(health: string): "success" | "warning" | "danger" | "info" {
  switch (health) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "DOWN":
      return "danger";
    default:
      return "info";
  }
}

export default function AdminIntegrationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [dashboard, setDashboard] = useState<AdminAtsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      void adminAts.dashboard()
        .then((data) => setDashboard(data))
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load ATS operations"))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ATS Operations</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Monitor employer integration health, failed syncs, webhook issues, and writeback readiness across Greenhouse, Lever, and Workable.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/admin")}>
          Back to admin
        </Button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : !dashboard ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-gray-600">
          ATS operations data is unavailable right now.
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-gray-500">Healthy connections</div>
                <div className="mt-2 text-3xl font-semibold text-emerald-700">{dashboard.summary.healthyConnections}</div>
                <p className="mt-2 text-sm text-gray-600">{dashboard.summary.totalConnections} total integrations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-gray-500">Need attention</div>
                <div className="mt-2 text-3xl font-semibold text-blue-700">{dashboard.summary.needsAttentionConnections}</div>
                <p className="mt-2 text-sm text-gray-600">Credential or mapping gaps</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-gray-500">Failed syncs, 7d</div>
                <div className="mt-2 text-3xl font-semibold text-amber-700">{dashboard.summary.failedSyncRunsLast7Days}</div>
                <p className="mt-2 text-sm text-gray-600">Recent import or writeback issues</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-gray-500">Failed webhooks, 7d</div>
                <div className="mt-2 text-3xl font-semibold text-red-700">{dashboard.summary.failedWebhooksLast7Days}</div>
                <p className="mt-2 text-sm text-gray-600">Inbound event delivery or verification failures</p>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Provider breakdown</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.providerBreakdown.map((provider) => (
                  <div key={provider.provider} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">{provider.label}</p>
                        <p className="mt-1 text-sm text-gray-600">{provider.total} connected accounts</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="success">{provider.healthy} healthy</Badge>
                        <Badge variant="warning">{provider.degraded} degraded</Badge>
                        <Badge variant="danger">{provider.down} down</Badge>
                        <Badge variant="info">{provider.needsAttention} needs attention</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Connections needing review</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.connections
                  .filter((connection) => connection.healthStatus !== "HEALTHY")
                  .slice(0, 8)
                  .map((connection) => (
                    <div key={connection.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{connection.employer.companyName}</p>
                            <Badge variant={healthVariant(connection.healthStatus)}>
                              {connection.healthStatus.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">
                            {connection.providerLabel} • {connection.externalOrgId} • {connection.employer.user.email}
                          </p>
                          {connection.lastErrorMessage && (
                            <p className="mt-2 text-sm text-red-700">{connection.lastErrorMessage}</p>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <p>Last sync: {formatTimestamp(connection.lastSyncedAt)}</p>
                          <p>Last webhook: {formatTimestamp(connection.lastWebhookAt)}</p>
                          <p>{connection.recentLogSummary.failedSyncRuns} failed sync runs</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Recent failed syncs</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.recentFailedSyncs.length === 0 ? (
                  <p className="text-sm text-gray-500">No failed syncs in the past 7 days.</p>
                ) : (
                  dashboard.recentFailedSyncs.map((run) => (
                    <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{run.connection.employer.companyName}</p>
                        <Badge variant={run.status === "FAILED" ? "danger" : "warning"}>{run.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {run.connection.provider} • {run.syncType.replace(/_/g, " ")} • {formatTimestamp(run.startedAt)}
                      </p>
                      <p className="mt-2 text-sm text-gray-700">
                        Errors: {run.errorCount} • Retries: {run.retryCount}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Recent failed webhooks</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboard.recentFailedWebhooks.length === 0 ? (
                  <p className="text-sm text-gray-500">No failed webhooks in the past 7 days.</p>
                ) : (
                  dashboard.recentFailedWebhooks.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{event.connection.employer.companyName}</p>
                        <Badge variant="danger">{event.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {event.connection.provider} • {event.eventType} • {formatTimestamp(event.receivedAt)}
                      </p>
                      {event.errorMessage && (
                        <p className="mt-2 text-sm text-red-700">{event.errorMessage}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
