"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ats,
  ATSConnection,
  ATSConnectionLogs,
  ATSHealthStatus,
  EmployerAtsDashboard,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Provider = "GREENHOUSE" | "LEVER" | "WORKABLE";

const PROVIDER_HELP: Record<Provider, {
  orgLabel: string;
  accessTokenLabel: string;
  description: string;
  stageMappingHint: string;
}> = {
  GREENHOUSE: {
    orgLabel: "Board token",
    accessTokenLabel: "Harvest API key",
    description: "Use the public board token for job import. Add a Harvest API key, stage mappings, and a Greenhouse user ID for writeback.",
    stageMappingHint: `{
  "REVIEWING": "12345",
  "SHORTLISTED": "67890",
  "ACCEPTED": "24680",
  "REJECTED": "13579"
}`,
  },
  LEVER: {
    orgLabel: "Site token",
    accessTokenLabel: "API key or OAuth token",
    description: "Use the Lever site token for import. Add an API key or OAuth token with opportunities write scope to push stage changes back.",
    stageMappingHint: `{
  "REVIEWING": "screen-stage-id",
  "SHORTLISTED": "onsite-stage-id",
  "ACCEPTED": "hired-stage-id",
  "REJECTED": "rejected-stage-id"
}`,
  },
  WORKABLE: {
    orgLabel: "Account subdomain",
    accessTokenLabel: "Workable API token",
    description: "Workable requires an API token for import and writeback. Provide a member ID plus target stage slugs for candidate moves.",
    stageMappingHint: `{
  "REVIEWING": "phone-screen",
  "SHORTLISTED": "final-interview",
  "ACCEPTED": "hired",
  "REJECTED": "rejected"
}`,
  },
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Not yet";
  }

  return new Date(value).toLocaleString();
}

function healthBadgeVariant(health: ATSHealthStatus): "success" | "warning" | "danger" | "info" {
  switch (health) {
    case "HEALTHY":
      return "success";
    case "DEGRADED":
      return "warning";
    case "DOWN":
      return "danger";
    case "NEEDS_ATTENTION":
      return "info";
    default:
      return "info";
  }
}

function connectionStatusVariant(status: ATSConnection["status"]): "success" | "warning" | "danger" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "ERROR":
      return "danger";
    case "DISCONNECTED":
      return "warning";
    default:
      return "warning";
  }
}

function splitConnectionMetadata(metadata: Record<string, unknown> | null) {
  const safe = metadata ?? {};
  const { stageMappings, performAsUserId, ...rest } = safe;
  return {
    stageMappings: stageMappings && typeof stageMappings === "object" && !Array.isArray(stageMappings)
      ? stageMappings
      : {},
    performAsUserId: typeof performAsUserId === "string" ? performAsUserId : "",
    extraMetadata: rest,
  };
}

function buildConnectionPayload(form: {
  provider: Provider;
  externalOrgId: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  webhookSecret: string;
  webhookSyncEnabled: boolean;
  twoWaySyncEnabled: boolean;
  performAsUserId: string;
  stageMappingsText: string;
  extraMetadataText: string;
  clearAccessToken: boolean;
  clearRefreshToken: boolean;
  clearWebhookSecret: boolean;
}) {
  let stageMappings: Record<string, unknown> = {};
  let extraMetadata: Record<string, unknown> = {};

  try {
    stageMappings = form.stageMappingsText.trim()
      ? JSON.parse(form.stageMappingsText)
      : {};
  } catch {
    throw new Error("Stage mapping JSON is invalid.");
  }

  try {
    extraMetadata = form.extraMetadataText.trim()
      ? JSON.parse(form.extraMetadataText)
      : {};
  } catch {
    throw new Error("Advanced metadata JSON is invalid.");
  }

  if (Array.isArray(stageMappings) || typeof stageMappings !== "object" || stageMappings === null) {
    throw new Error("Stage mappings must be a JSON object.");
  }

  if (Array.isArray(extraMetadata) || typeof extraMetadata !== "object" || extraMetadata === null) {
    throw new Error("Advanced metadata must be a JSON object.");
  }

  const metadata: Record<string, unknown> = {
    ...extraMetadata,
  };

  if (Object.keys(stageMappings).length > 0) {
    metadata.stageMappings = stageMappings;
  }

  if (form.performAsUserId.trim()) {
    metadata.performAsUserId = form.performAsUserId.trim();
  }

  return {
    provider: form.provider,
    externalOrgId: form.externalOrgId.trim(),
    displayName: form.displayName.trim() || undefined,
    accessToken: form.accessToken.trim() || undefined,
    refreshToken: form.refreshToken.trim() || undefined,
    webhookSecret: form.webhookSecret.trim() || undefined,
    webhookSyncEnabled: form.webhookSyncEnabled,
    twoWaySyncEnabled: form.twoWaySyncEnabled,
    clearAccessToken: form.clearAccessToken,
    clearRefreshToken: form.clearRefreshToken,
    clearWebhookSecret: form.clearWebhookSecret,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function emptyForm(provider: Provider = "GREENHOUSE") {
  return {
    provider,
    externalOrgId: "",
    displayName: "",
    accessToken: "",
    refreshToken: "",
    webhookSecret: "",
    webhookSyncEnabled: true,
    twoWaySyncEnabled: true,
    performAsUserId: "",
    stageMappingsText: PROVIDER_HELP[provider].stageMappingHint,
    extraMetadataText: "{}",
    clearAccessToken: false,
    clearRefreshToken: false,
    clearWebhookSecret: false,
  };
}

export default function EmployerIntegrationsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [dashboard, setDashboard] = useState<EmployerAtsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [loadingLogsId, setLoadingLogsId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [logsByConnection, setLogsByConnection] = useState<Record<string, ATSConnectionLogs>>({});
  const [form, setForm] = useState(emptyForm());

  const connections = dashboard?.connections ?? [];
  const selectedConnection = connections.find((connection) => connection.id === editingConnectionId) ?? null;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push("/login");
    }
  }, [isLoading, router, user]);

  const loadDashboard = async () => {
    const data = await ats.dashboard();
    setDashboard(data);
  };

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      setLoading(true);
      void loadDashboard()
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load ATS integrations");
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  const resetForm = (provider: Provider = form.provider) => {
    setEditingConnectionId(null);
    setForm(emptyForm(provider));
  };

  const populateFormForConnection = (connection: ATSConnection) => {
    const { stageMappings, performAsUserId, extraMetadata } = splitConnectionMetadata(connection.metadata);
    setEditingConnectionId(connection.id);
    setForm({
      provider: connection.provider,
      externalOrgId: connection.externalOrgId,
      displayName: connection.displayName ?? "",
      accessToken: "",
      refreshToken: "",
      webhookSecret: "",
      webhookSyncEnabled: connection.webhookSyncEnabled,
      twoWaySyncEnabled: connection.twoWaySyncEnabled,
      performAsUserId,
      stageMappingsText: JSON.stringify(stageMappings, null, 2) || PROVIDER_HELP[connection.provider].stageMappingHint,
      extraMetadataText: JSON.stringify(extraMetadata, null, 2),
      clearAccessToken: false,
      clearRefreshToken: false,
      clearWebhookSecret: false,
    });
    setNotice(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildConnectionPayload(form);
      if (editingConnectionId) {
        await ats.updateConnection(editingConnectionId, payload);
        setNotice("Integration settings updated.");
      } else {
        await ats.createConnection(payload);
        setNotice("Integration saved. Run a connection test to validate credentials and readiness.");
      }

      await loadDashboard();
      resetForm(form.provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save integration");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (connectionId: string) => {
    setTestingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const result = await ats.testConnection(connectionId);
      await loadDashboard();
      if (selectedConnectionId === connectionId) {
        const logs = await ats.connectionLogs(connectionId);
        setLogsByConnection((prev) => ({ ...prev, [connectionId]: logs }));
      }
      setNotice(
        result.ok
          ? `Connection test passed. ${result.sampleJobCount} jobs were visible.`
          : `Connection test completed with issues: ${result.warnings[0] ?? "Check the readiness notes."}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const result = await ats.syncConnection(connectionId);
      await loadDashboard();
      if (selectedConnectionId === connectionId) {
        const logs = await ats.connectionLogs(connectionId);
        setLogsByConnection((prev) => ({ ...prev, [connectionId]: logs }));
      }
      setNotice(
        `Sync complete: ${result.createdJobs} new job${result.createdJobs === 1 ? "" : "s"}, ${result.updatedJobs} updated.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "ATS sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const handleRetry = async (connectionId: string) => {
    setRetryingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const result = await ats.retryConnection(connectionId);
      await loadDashboard();
      if (selectedConnectionId === connectionId) {
        const logs = await ats.connectionLogs(connectionId);
        setLogsByConnection((prev) => ({ ...prev, [connectionId]: logs }));
      }
      setNotice(
        `Retry finished: ${result.createdJobs} new job${result.createdJobs === 1 ? "" : "s"}, ${result.updatedJobs} updated.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    setDisconnectingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      await ats.disconnectConnection(connectionId);
      await loadDashboard();
      setNotice("Integration disconnected.");
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
      }
      if (editingConnectionId === connectionId) {
        resetForm(form.provider);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleLoadLogs = async (connectionId: string) => {
    if (selectedConnectionId === connectionId && logsByConnection[connectionId]) {
      setSelectedConnectionId(null);
      return;
    }

    setSelectedConnectionId(connectionId);
    setLoadingLogsId(connectionId);
    setError(null);
    try {
      const logs = await ats.connectionLogs(connectionId);
      setLogsByConnection((prev) => ({ ...prev, [connectionId]: logs }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sync logs");
    } finally {
      setLoadingLogsId(null);
    }
  };

  const copyWebhookUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Webhook URL copied.");
    } catch {
      setError("Failed to copy webhook URL.");
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const help = PROVIDER_HELP[form.provider];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ATS Integrations</h1>
          <p className="mt-2 max-w-3xl text-gray-600">
            Connect Greenhouse, Lever, and Workable with real health checks, webhook readiness, sync logs, and stage writeback configuration.
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          First launch milestone: healthy connection, successful import, webhook enabled, and stage mappings configured for writeback.
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {notice && (
        <div className="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-500">Healthy connections</div>
            <div className="mt-2 text-3xl font-semibold text-emerald-700">
              {dashboard?.summary.healthyConnections ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {dashboard?.summary.totalConnections ?? 0} total live integrations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-500">Needs attention</div>
            <div className="mt-2 text-3xl font-semibold text-blue-700">
              {dashboard?.summary.needsAttentionConnections ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Missing credentials, secrets, or stage mappings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-500">Webhook issues</div>
            <div className="mt-2 text-3xl font-semibold text-amber-700">
              {dashboard?.summary.failedWebhookEvents ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Failed webhook deliveries across all connected ATS instances
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-500">Two-way sync enabled</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {dashboard?.summary.twoWayEnabledConnections ?? 0}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Connections configured for application stage writeback
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingConnectionId ? "Manage Integration" : "Add Integration"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Store credentials safely, configure webhook verification, and map AfriTalent statuses to provider stages.
                </p>
              </div>
              {editingConnectionId && (
                <Button variant="outline" size="sm" onClick={() => resetForm(form.provider)}>
                  Cancel edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={saveConnection}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Provider</span>
                  <select
                    value={form.provider}
                    onChange={(event) => {
                      const provider = event.target.value as Provider;
                      setForm({
                        ...emptyForm(provider),
                        provider,
                      });
                      setEditingConnectionId(null);
                    }}
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  >
                    <option value="GREENHOUSE">Greenhouse</option>
                    <option value="LEVER">Lever</option>
                    <option value="WORKABLE">Workable</option>
                  </select>
                </label>
                <Input
                  label="Connection label"
                  placeholder="EMEA hiring pipeline"
                  value={form.displayName}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                />
                <Input
                  label={help.orgLabel}
                  placeholder={form.provider === "WORKABLE" ? "acme" : "company-token"}
                  value={form.externalOrgId}
                  onChange={(event) => setForm((prev) => ({ ...prev, externalOrgId: event.target.value }))}
                />
                <Input
                  label={help.accessTokenLabel}
                  placeholder="Stored securely"
                  value={form.accessToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, accessToken: event.target.value }))}
                />
                <Input
                  label="Refresh token"
                  placeholder="Optional"
                  value={form.refreshToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, refreshToken: event.target.value }))}
                />
                <Input
                  label="Webhook secret"
                  placeholder="Used to verify inbound events"
                  value={form.webhookSecret}
                  onChange={(event) => setForm((prev) => ({ ...prev, webhookSecret: event.target.value }))}
                />
                <Input
                  label="Service user / member ID"
                  placeholder="Required for Greenhouse and Workable writeback"
                  value={form.performAsUserId}
                  onChange={(event) => setForm((prev) => ({ ...prev, performAsUserId: event.target.value }))}
                />
              </div>

              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.webhookSyncEnabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, webhookSyncEnabled: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">Enable webhook sync</span>
                    Verify inbound candidate or job events before they are applied locally.
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.twoWaySyncEnabled}
                    onChange={(event) => setForm((prev) => ({ ...prev, twoWaySyncEnabled: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="block font-medium text-gray-900">Enable stage writeback</span>
                    Push AfriTalent application status changes back into the ATS when credentials and mappings are ready.
                  </span>
                </label>
                {editingConnectionId && (
                  <>
                    <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.clearAccessToken}
                        onChange={(event) => setForm((prev) => ({ ...prev, clearAccessToken: event.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block font-medium text-gray-900">Clear stored access token</span>
                        Remove the current token on save.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.clearWebhookSecret}
                        onChange={(event) => setForm((prev) => ({ ...prev, clearWebhookSecret: event.target.checked }))}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>
                        <span className="block font-medium text-gray-900">Clear webhook secret</span>
                        Disable shared-secret verification until a new one is saved.
                      </span>
                    </label>
                  </>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Stage mappings JSON</span>
                  <textarea
                    value={form.stageMappingsText}
                    onChange={(event) => setForm((prev) => ({ ...prev, stageMappingsText: event.target.value }))}
                    rows={8}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                  />
                  <span className="mt-2 block text-xs text-gray-500">
                    {help.description}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Advanced metadata JSON</span>
                  <textarea
                    value={form.extraMetadataText}
                    onChange={(event) => setForm((prev) => ({ ...prev, extraMetadataText: event.target.value }))}
                    rows={8}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900"
                  />
                  <span className="mt-2 block text-xs text-gray-500">
                    Use this for provider-specific settings such as custom conditions, enterprise proxy URLs, or future flags.
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving || !form.externalOrgId.trim()}>
                  {saving ? "Saving..." : editingConnectionId ? "Update integration" : "Save integration"}
                </Button>
                {editingConnectionId && selectedConnection && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleTest(selectedConnection.id)}
                    disabled={testingId === selectedConnection.id}
                  >
                    {testingId === selectedConnection.id ? "Testing..." : "Test current config"}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Provider readiness guide</h2>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div className="rounded-2xl bg-white p-4">
              <p className="font-semibold text-gray-900">{help.orgLabel}</p>
              <p className="mt-1">{help.description}</p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="font-semibold text-gray-900">Webhook setup</p>
              <p className="mt-1">
                Save the integration, then copy the generated webhook URL from the connection card. Use the shared secret or provider-specific signature verification where supported.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="font-semibold text-gray-900">Writeback readiness</p>
              <p className="mt-1">
                Stage writeback only turns healthy when a write-capable token is stored, stage mappings are present, and the provider-specific service user/member ID is configured where required.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="font-semibold text-gray-900">Support visibility</p>
              <p className="mt-1">
                Every sync run, webhook event, and retry is captured in the connection timeline so your recruiting team can troubleshoot without digging into backend logs.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Connected providers</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" />
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-gray-600">
              No ATS integrations yet. Add your first connection above, then run a connection test before turning on webhooks or stage writeback.
            </div>
          ) : (
            <div className="space-y-5">
              {connections.map((connection) => {
                const logs = logsByConnection[connection.id];
                const isLogsOpen = selectedConnectionId === connection.id;
                const isEditing = editingConnectionId === connection.id;

                return (
                  <div key={connection.id} className="rounded-2xl border border-gray-200 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {connection.displayName || `${connection.providerLabel} integration`}
                          </h3>
                          <Badge variant={healthBadgeVariant(connection.healthStatus)}>
                            {connection.healthStatus.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant={connectionStatusVariant(connection.status)}>
                            {connection.status}
                          </Badge>
                          {connection.webhookSyncEnabled && <Badge variant="info">Webhook sync on</Badge>}
                          {connection.twoWaySyncEnabled && <Badge variant="default">Writeback on</Badge>}
                        </div>
                        <p className="text-sm text-gray-600">
                          {connection.providerLabel} • {connection.externalOrgId}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={connection.capabilities.jobImportReady ? "success" : "warning"}>
                            Job import {connection.capabilities.jobImportReady ? "ready" : "needs config"}
                          </Badge>
                          <Badge variant={connection.capabilities.webhookReady ? "success" : "warning"}>
                            Webhooks {connection.capabilities.webhookReady ? "ready" : "unverified"}
                          </Badge>
                          <Badge variant={connection.capabilities.stageWritebackReady ? "success" : "warning"}>
                            Stage writeback {connection.capabilities.stageWritebackReady ? "ready" : "needs config"}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => populateFormForConnection(connection)}>
                          {isEditing ? "Editing" : "Manage"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleLoadLogs(connection.id)}
                          disabled={loadingLogsId === connection.id}
                        >
                          {loadingLogsId === connection.id ? "Loading..." : isLogsOpen ? "Hide logs" : "View logs"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleTest(connection.id)}
                          disabled={testingId === connection.id}
                        >
                          {testingId === connection.id ? "Testing..." : "Test"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void handleSync(connection.id)}
                          disabled={syncingId === connection.id}
                        >
                          {syncingId === connection.id ? "Syncing..." : "Sync jobs"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleRetry(connection.id)}
                          disabled={retryingId === connection.id}
                        >
                          {retryingId === connection.id ? "Retrying..." : "Retry"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void handleDisconnect(connection.id)}
                          disabled={disconnectingId === connection.id}
                        >
                          {disconnectingId === connection.id ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Credentials on file</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={connection.credentials.hasAccessToken ? "success" : "warning"}>Access token</Badge>
                          <Badge variant={connection.credentials.hasRefreshToken ? "success" : "default"}>Refresh token</Badge>
                          <Badge variant={connection.credentials.hasWebhookSecret ? "success" : "warning"}>Webhook secret</Badge>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-700">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent activity</p>
                        <p className="mt-3">Last sync: {formatTimestamp(connection.lastSyncedAt)}</p>
                        <p>Last test: {formatTimestamp(connection.lastConnectionTestAt)}</p>
                        <p>Last webhook: {formatTimestamp(connection.lastWebhookAt)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-700">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Backlog</p>
                        <p className="mt-3">{connection.recentLogSummary.failedSyncRuns} failed sync runs</p>
                        <p>{connection.recentLogSummary.failedWebhookEvents} failed webhook events</p>
                        <p>{connection.recentLogSummary.pendingApplicationLinks} pending application links</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-700">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Webhook endpoint</p>
                        <p className="mt-3 break-all font-mono text-xs text-slate-600">{connection.webhookUrl}</p>
                        <Button size="sm" variant="ghost" className="mt-3" onClick={() => void copyWebhookUrl(connection.webhookUrl)}>
                          Copy webhook URL
                        </Button>
                      </div>
                    </div>

                    {connection.capabilities.notes.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-medium">Readiness gaps</p>
                        <ul className="mt-2 list-disc pl-5">
                          {connection.capabilities.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {connection.lastErrorMessage && (
                      <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        <p className="font-medium">Latest error</p>
                        <p className="mt-2">{connection.lastErrorMessage}</p>
                        <p className="mt-2 text-xs text-red-700">Recorded {formatTimestamp(connection.lastErrorAt)}</p>
                      </div>
                    )}

                    {isLogsOpen && (
                      <div className="mt-5 space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        {!logs ? (
                          <div className="flex justify-center py-8">
                            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" />
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-4 md:grid-cols-4">
                              <div className="rounded-2xl bg-white p-4 text-sm text-gray-700">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Linked applications</p>
                                <p className="mt-3 text-2xl font-semibold text-gray-900">{logs.applicationLinks.stats.total}</p>
                              </div>
                              <div className="rounded-2xl bg-white p-4 text-sm text-gray-700">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Synced</p>
                                <p className="mt-3 text-2xl font-semibold text-emerald-700">{logs.applicationLinks.stats.synced}</p>
                              </div>
                              <div className="rounded-2xl bg-white p-4 text-sm text-gray-700">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending</p>
                                <p className="mt-3 text-2xl font-semibold text-amber-700">{logs.applicationLinks.stats.pending}</p>
                              </div>
                              <div className="rounded-2xl bg-white p-4 text-sm text-gray-700">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manual review</p>
                                <p className="mt-3 text-2xl font-semibold text-slate-900">{logs.applicationLinks.stats.manualReview}</p>
                              </div>
                            </div>

                            <div className="grid gap-5 xl:grid-cols-3">
                              <div className="space-y-3 rounded-2xl bg-white p-4">
                                <h4 className="font-semibold text-gray-900">Recent sync runs</h4>
                                {logs.syncRuns.length === 0 ? (
                                  <p className="text-sm text-gray-500">No sync runs yet.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.syncRuns.slice(0, 6).map((run) => (
                                      <div key={run.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-medium text-gray-900">{run.syncType.replace(/_/g, " ")}</span>
                                          <Badge variant={run.status === "SUCCESS" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>
                                            {run.status}
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-gray-600">
                                          {run.direction} via {run.trigger.toLowerCase()} • {formatTimestamp(run.startedAt)}
                                        </p>
                                        <p className="mt-1 text-gray-600">
                                          {run.createdJobs} created, {run.updatedJobs} updated, {run.updatedStages} stage changes
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-2xl bg-white p-4">
                                <h4 className="font-semibold text-gray-900">Webhook events</h4>
                                {logs.webhookEvents.length === 0 ? (
                                  <p className="text-sm text-gray-500">No webhook events yet.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.webhookEvents.slice(0, 6).map((event) => (
                                      <div key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-medium text-gray-900">{event.eventType}</span>
                                          <Badge variant={event.status === "PROCESSED" ? "success" : event.status === "FAILED" ? "danger" : "warning"}>
                                            {event.status}
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-gray-600">
                                          {formatTimestamp(event.receivedAt)}
                                        </p>
                                        {event.errorMessage && (
                                          <p className="mt-1 text-red-700">{event.errorMessage}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-2xl bg-white p-4">
                                <h4 className="font-semibold text-gray-900">Audit timeline</h4>
                                {logs.auditLogs.length === 0 ? (
                                  <p className="text-sm text-gray-500">No audit entries yet.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.auditLogs.slice(0, 8).map((entry) => (
                                      <div key={entry.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                                        <p className="font-medium text-gray-900">{entry.actionType.replace(/_/g, " ")}</p>
                                        <p className="mt-1 text-gray-600">{entry.summary}</p>
                                        <p className="mt-1 text-xs text-gray-500">{formatTimestamp(entry.createdAt)}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {logs.applicationLinks.recent.length > 0 && (
                              <div className="rounded-2xl bg-white p-4">
                                <h4 className="font-semibold text-gray-900">Recent application links</h4>
                                <div className="mt-4 space-y-3">
                                  {logs.applicationLinks.recent.slice(0, 6).map((link) => (
                                    <div key={link.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <p className="font-medium text-gray-900">
                                            {link.application.candidate.name} • {link.application.job.title}
                                          </p>
                                          <p className="mt-1 text-gray-600">
                                            Local status: {link.application.status} • External stage: {link.externalStageName || "Unknown"}
                                          </p>
                                        </div>
                                        <Badge variant={link.status === "SYNCED" ? "success" : link.status === "FAILED" ? "danger" : "warning"}>
                                          {link.status.replace(/_/g, " ")}
                                        </Badge>
                                      </div>
                                      {link.lastSyncError && (
                                        <p className="mt-2 text-red-700">{link.lastSyncError}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
