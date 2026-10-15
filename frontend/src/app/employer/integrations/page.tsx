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
import { Eyebrow, Notice, PageSpinner, Spinner, StatCard, checkboxClass, controlClass, labelClass } from "@/components/employer/employer-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { ATS_PROVIDER_NAMES } from "@/components/employer/locale-neutral";
import { useEmployerI18n, type EmployerMessageKey, type EmployerVars } from "@/lib/i18n/employer-messages";

type Provider = "GREENHOUSE" | "LEVER" | "WORKABLE";

// Labels and help copy are translated (`ats.help.<PROVIDER>.*`); the stage
// mapping hint is a JSON template and stays as-is.
const PROVIDER_HELP: Record<Provider, { stageMappingHint: string }> = {
  GREENHOUSE: {
    stageMappingHint: `{
  "REVIEWING": "12345",
  "SHORTLISTED": "67890",
  "ACCEPTED": "24680",
  "REJECTED": "13579"
}`,
  },
  LEVER: {
    stageMappingHint: `{
  "REVIEWING": "screen-stage-id",
  "SHORTLISTED": "onsite-stage-id",
  "ACCEPTED": "hired-stage-id",
  "REJECTED": "rejected-stage-id"
}`,
  },
  WORKABLE: {
    stageMappingHint: `{
  "REVIEWING": "phone-screen",
  "SHORTLISTED": "final-interview",
  "ACCEPTED": "hired",
  "REJECTED": "rejected"
}`,
  },
};

type T = (key: EmployerMessageKey, vars?: EmployerVars) => string;

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

function buildConnectionPayload(t: T, form: {
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
    throw new Error(t("ats.errStageJson"));
  }

  try {
    extraMetadata = form.extraMetadataText.trim()
      ? JSON.parse(form.extraMetadataText)
      : {};
  } catch {
    throw new Error(t("ats.errMetaJson"));
  }

  if (Array.isArray(stageMappings) || typeof stageMappings !== "object" || stageMappings === null) {
    throw new Error(t("ats.errStageObject"));
  }

  if (Array.isArray(extraMetadata) || typeof extraMetadata !== "object" || extraMetadata === null) {
    throw new Error(t("ats.errMetaObject"));
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
  const locale = useLocale();
  const { user, isLoading } = useAuth();
  const { t, tn, tv, fmt } = useEmployerI18n();
  const [dashboard, setDashboard] = useState<EmployerAtsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  // "" = failed without a server message (rendered with a translated fallback).
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
  const when = (value: string | null | undefined) => (value ? fmt.dateTime(value) : t("ats.notYet"));
  const errText = (err: unknown, fallback: EmployerMessageKey) =>
    err instanceof Error && err.message ? err.message : t(fallback);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "EMPLOYER")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, router, user, locale]);

  const loadDashboard = async () => {
    const data = await ats.dashboard();
    setDashboard(data);
  };

  useEffect(() => {
    if (user?.role === "EMPLOYER") {
      setLoading(true);
      void loadDashboard()
        .catch((err) => {
          setError(err instanceof Error ? err.message : "");
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

  const refreshLogsIfOpen = async (connectionId: string) => {
    if (selectedConnectionId === connectionId) {
      const logs = await ats.connectionLogs(connectionId);
      setLogsByConnection((prev) => ({ ...prev, [connectionId]: logs }));
    }
  };

  const saveConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const payload = buildConnectionPayload(t, form);
      if (editingConnectionId) {
        await ats.updateConnection(editingConnectionId, payload);
        setNotice(t("ats.noticeUpdated"));
      } else {
        await ats.createConnection(payload);
        setNotice(t("ats.noticeSaved"));
      }

      await loadDashboard();
      resetForm(form.provider);
    } catch (err) {
      setError(errText(err, "ats.errSave"));
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
      await refreshLogsIfOpen(connectionId);
      setNotice(
        result.ok
          ? t("ats.testPassed", { count: result.sampleJobCount })
          : t("ats.testIssues", { issue: result.warnings[0] ?? t("ats.checkReadiness") }),
      );
    } catch (err) {
      setError(errText(err, "ats.errTest"));
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
      await refreshLogsIfOpen(connectionId);
      setNotice(t("ats.syncComplete", { created: result.createdJobs, updated: result.updatedJobs }));
    } catch (err) {
      setError(errText(err, "ats.errSync"));
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
      await refreshLogsIfOpen(connectionId);
      setNotice(t("ats.retryComplete", { created: result.createdJobs, updated: result.updatedJobs }));
    } catch (err) {
      setError(errText(err, "ats.errRetry"));
    } finally {
      setRetryingId(null);
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!window.confirm(t("ats.confirmDisconnect"))) return;
    setDisconnectingId(connectionId);
    setError(null);
    setNotice(null);
    try {
      await ats.disconnectConnection(connectionId);
      await loadDashboard();
      setNotice(t("ats.noticeDisconnected"));
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
      }
      if (editingConnectionId === connectionId) {
        resetForm(form.provider);
      }
    } catch (err) {
      setError(errText(err, "ats.errDisconnect"));
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
      setError(errText(err, "ats.errLogs"));
    } finally {
      setLoadingLogsId(null);
    }
  };

  const copyWebhookUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t("ats.noticeCopied"));
    } catch {
      setError(t("ats.errCopy"));
    }
  };

  if (isLoading || !user) {
    return <PageSpinner />;
  }

  const provider = form.provider;
  const orgLabel = t(`ats.help.${provider}.org` as EmployerMessageKey);
  const tokenLabel = t(`ats.help.${provider}.token` as EmployerMessageKey);
  const providerDescription = t(`ats.help.${provider}.description` as EmployerMessageKey);
  const toggles: Array<{
    id: string;
    field: "webhookSyncEnabled" | "twoWaySyncEnabled" | "clearAccessToken" | "clearWebhookSecret";
    title: string;
    body: string;
  }> = [
    { id: "ats-webhook", field: "webhookSyncEnabled", title: t("ats.webhookToggle"), body: t("ats.webhookToggleBody") },
    { id: "ats-writeback", field: "twoWaySyncEnabled", title: t("ats.writebackToggle"), body: t("ats.writebackToggleBody") },
    ...(editingConnectionId
      ? [
          { id: "ats-clear-token", field: "clearAccessToken" as const, title: t("ats.clearToken"), body: t("ats.clearTokenBody") },
          { id: "ats-clear-secret", field: "clearWebhookSecret" as const, title: t("ats.clearSecret"), body: t("ats.clearSecretBody") },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Eyebrow className="text-primary-text">{t("ats.eyebrow")}</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{t("ats.title")}</h1>
          <p className="mt-2 max-w-3xl text-fg-secondary">{t("ats.subtitle")}</p>
        </div>
        <Notice tone="brand" className="lg:max-w-sm">
          {t("ats.milestone")}
        </Notice>
      </header>

      {error !== null && (
        <Notice tone="danger" role="alert" className="mb-6">
          {error || t("ats.errLoad")}
        </Notice>
      )}

      {notice && (
        <Notice tone="success" role="status" className="mb-6">
          {notice}
        </Notice>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          accent
          label={t("ats.statHealthy")}
          value={fmt.number(dashboard?.summary.healthyConnections ?? 0)}
          helper={t("ats.statHealthyHelper", { count: dashboard?.summary.totalConnections ?? 0 })}
        />
        <StatCard
          label={t("ats.statAttention")}
          value={fmt.number(dashboard?.summary.needsAttentionConnections ?? 0)}
          helper={t("ats.statAttentionHelper")}
        />
        <StatCard
          label={t("ats.statWebhook")}
          value={fmt.number(dashboard?.summary.failedWebhookEvents ?? 0)}
          helper={t("ats.statWebhookHelper")}
        />
        <StatCard
          label={t("ats.statTwoWay")}
          value={fmt.number(dashboard?.summary.twoWayEnabledConnections ?? 0)}
          helper={t("ats.statTwoWayHelper")}
        />
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-fg">
                  {editingConnectionId ? t("ats.manageTitle") : t("ats.addTitle")}
                </h2>
                <p className="mt-1 text-sm text-fg-secondary">{t("ats.formBody")}</p>
              </div>
              {editingConnectionId && (
                <Button variant="outline" size="sm" onClick={() => resetForm(form.provider)}>
                  {t("ats.cancelEdit")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={saveConnection}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="ats-provider" className={labelClass}>
                    {t("ats.provider")}
                  </label>
                  <select
                    id="ats-provider"
                    value={form.provider}
                    onChange={(event) => {
                      const nextProvider = event.target.value as Provider;
                      setForm({
                        ...emptyForm(nextProvider),
                        provider: nextProvider,
                      });
                      setEditingConnectionId(null);
                    }}
                    className={controlClass}
                  >
                    {(Object.keys(ATS_PROVIDER_NAMES) as Provider[]).map((value) => (
                      <option key={value} value={value}>
                        {ATS_PROVIDER_NAMES[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  id="ats-label"
                  label={t("ats.connectionLabel")}
                  placeholder={t("ats.connectionLabelPlaceholder")}
                  value={form.displayName}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                />
                <Input
                  id="ats-org"
                  label={orgLabel}
                  placeholder={form.provider === "WORKABLE" ? "acme" : "company-token"}
                  value={form.externalOrgId}
                  onChange={(event) => setForm((prev) => ({ ...prev, externalOrgId: event.target.value }))}
                />
                <Input
                  id="ats-token"
                  type="password"
                  autoComplete="off"
                  label={tokenLabel}
                  placeholder={t("ats.storedSecurely")}
                  value={form.accessToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, accessToken: event.target.value }))}
                />
                <Input
                  id="ats-refresh"
                  type="password"
                  autoComplete="off"
                  label={t("ats.refreshToken")}
                  placeholder={t("ats.optional")}
                  value={form.refreshToken}
                  onChange={(event) => setForm((prev) => ({ ...prev, refreshToken: event.target.value }))}
                />
                <Input
                  id="ats-secret"
                  type="password"
                  autoComplete="off"
                  label={t("ats.webhookSecret")}
                  placeholder={t("ats.webhookSecretPlaceholder")}
                  value={form.webhookSecret}
                  onChange={(event) => setForm((prev) => ({ ...prev, webhookSecret: event.target.value }))}
                />
                <Input
                  id="ats-service-user"
                  label={t("ats.serviceUser")}
                  placeholder={t("ats.serviceUserPlaceholder")}
                  value={form.performAsUserId}
                  onChange={(event) => setForm((prev) => ({ ...prev, performAsUserId: event.target.value }))}
                />
              </div>

              <fieldset className="grid gap-3 rounded-2xl border border-line bg-surface-sunken p-4 md:grid-cols-2">
                <legend className="sr-only">{t("ats.syncOptions")}</legend>
                {toggles.map((toggle) => (
                  <label
                    key={toggle.id}
                    htmlFor={toggle.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface p-4 text-sm text-fg-secondary"
                  >
                    <input
                      id={toggle.id}
                      type="checkbox"
                      checked={form[toggle.field]}
                      onChange={(event) => setForm((prev) => ({ ...prev, [toggle.field]: event.target.checked }))}
                      className={`mt-0.5 ${checkboxClass}`}
                    />
                    <span>
                      <span className="block font-medium text-fg">{toggle.title}</span>
                      {toggle.body}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label htmlFor="ats-stage-mappings" className={labelClass}>
                    {t("ats.stageMappings")}
                  </label>
                  <textarea
                    id="ats-stage-mappings"
                    aria-describedby="ats-stage-mappings-hint"
                    value={form.stageMappingsText}
                    onChange={(event) => setForm((prev) => ({ ...prev, stageMappingsText: event.target.value }))}
                    rows={8}
                    dir="ltr"
                    spellCheck={false}
                    className={`${controlClass} font-mono text-xs`}
                  />
                  <p id="ats-stage-mappings-hint" className="mt-2 text-xs text-fg-muted">
                    {providerDescription}
                  </p>
                </div>
                <div>
                  <label htmlFor="ats-metadata" className={labelClass}>
                    {t("ats.metadata")}
                  </label>
                  <textarea
                    id="ats-metadata"
                    aria-describedby="ats-metadata-hint"
                    value={form.extraMetadataText}
                    onChange={(event) => setForm((prev) => ({ ...prev, extraMetadataText: event.target.value }))}
                    rows={8}
                    dir="ltr"
                    spellCheck={false}
                    className={`${controlClass} font-mono text-xs`}
                  />
                  <p id="ats-metadata-hint" className="mt-2 text-xs text-fg-muted">
                    {t("ats.metadataHint")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" isLoading={saving} disabled={saving || !form.externalOrgId.trim()}>
                  {saving ? t("common.saving") : editingConnectionId ? t("ats.update") : t("ats.save")}
                </Button>
                {editingConnectionId && selectedConnection && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleTest(selectedConnection.id)}
                    disabled={testingId === selectedConnection.id}
                  >
                    {testingId === selectedConnection.id ? t("ats.testing") : t("ats.testCurrent")}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-surface-sunken">
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{t("ats.guideTitle")}</h2>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-fg-secondary">
            {[
              [orgLabel, providerDescription],
              [t("ats.guideWebhook"), t("ats.guideWebhookBody")],
              [t("ats.guideWriteback"), t("ats.guideWritebackBody")],
              [t("ats.guideSupport"), t("ats.guideSupportBody")],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-semibold text-fg">{title}</p>
                <p className="mt-1">{body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-fg">{t("ats.connectedTitle")}</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken p-8 text-center text-sm text-fg-secondary">
              {t("ats.empty")}
            </div>
          ) : (
            <div className="space-y-5">
              {connections.map((connection) => {
                const logs = logsByConnection[connection.id];
                const isLogsOpen = selectedConnectionId === connection.id;
                const isEditing = editingConnectionId === connection.id;

                return (
                  <div key={connection.id} className="rounded-2xl border border-line p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-fg">
                            {connection.displayName || t("ats.integrationOf", { provider: connection.providerLabel })}
                          </h3>
                          <Badge variant={healthBadgeVariant(connection.healthStatus)}>
                            {tv("ats.health", connection.healthStatus)}
                          </Badge>
                          <Badge variant={connectionStatusVariant(connection.status)}>
                            {tv("ats.status", connection.status)}
                          </Badge>
                          {connection.webhookSyncEnabled && <Badge variant="info">{t("ats.webhookOn")}</Badge>}
                          {connection.twoWaySyncEnabled && <Badge variant="default">{t("ats.writebackOn")}</Badge>}
                        </div>
                        <p className="text-sm text-fg-secondary">
                          {connection.providerLabel} • <span dir="ltr">{connection.externalOrgId}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={connection.capabilities.jobImportReady ? "success" : "warning"}>
                            {connection.capabilities.jobImportReady ? t("ats.importReady") : t("ats.importNeedsConfig")}
                          </Badge>
                          <Badge variant={connection.capabilities.webhookReady ? "success" : "warning"}>
                            {connection.capabilities.webhookReady ? t("ats.webhooksReady") : t("ats.webhooksUnverified")}
                          </Badge>
                          <Badge variant={connection.capabilities.stageWritebackReady ? "success" : "warning"}>
                            {connection.capabilities.stageWritebackReady ? t("ats.writebackReady") : t("ats.writebackNeedsConfig")}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => populateFormForConnection(connection)}>
                          {isEditing ? t("ats.editing") : t("ats.manage")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-expanded={isLogsOpen}
                          onClick={() => void handleLoadLogs(connection.id)}
                          disabled={loadingLogsId === connection.id}
                        >
                          {loadingLogsId === connection.id ? t("common.loading") : isLogsOpen ? t("ats.hideLogs") : t("ats.viewLogs")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleTest(connection.id)}
                          disabled={testingId === connection.id}
                        >
                          {testingId === connection.id ? t("ats.testing") : t("ats.test")}
                        </Button>
                        <Button size="sm" onClick={() => void handleSync(connection.id)} disabled={syncingId === connection.id}>
                          {syncingId === connection.id ? t("ats.syncing") : t("ats.sync")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleRetry(connection.id)}
                          disabled={retryingId === connection.id}
                        >
                          {retryingId === connection.id ? t("ats.retrying") : t("common.retry")}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => void handleDisconnect(connection.id)}
                          disabled={disconnectingId === connection.id}
                        >
                          {disconnectingId === connection.id ? t("ats.disconnecting") : t("ats.disconnect")}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-surface-sunken p-4">
                        <Eyebrow className="tracking-wide">{t("ats.credentials")}</Eyebrow>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={connection.credentials.hasAccessToken ? "success" : "warning"}>{t("ats.accessToken")}</Badge>
                          <Badge variant={connection.credentials.hasRefreshToken ? "success" : "default"}>{t("ats.refreshToken")}</Badge>
                          <Badge variant={connection.credentials.hasWebhookSecret ? "success" : "warning"}>{t("ats.webhookSecret")}</Badge>
                        </div>
                      </div>
                      <div className="rounded-2xl bg-surface-sunken p-4 text-sm text-fg-secondary">
                        <Eyebrow className="tracking-wide">{t("ats.recentActivity")}</Eyebrow>
                        <p className="mt-3">{t("ats.lastSync", { when: when(connection.lastSyncedAt) })}</p>
                        <p>{t("ats.lastTest", { when: when(connection.lastConnectionTestAt) })}</p>
                        <p>{t("ats.lastWebhook", { when: when(connection.lastWebhookAt) })}</p>
                      </div>
                      <div className="rounded-2xl bg-surface-sunken p-4 text-sm text-fg-secondary">
                        <Eyebrow className="tracking-wide">{t("ats.backlog")}</Eyebrow>
                        <p className="mt-3">{tn("ats.failedSyncRuns", connection.recentLogSummary.failedSyncRuns)}</p>
                        <p>{tn("ats.failedWebhookEvents", connection.recentLogSummary.failedWebhookEvents)}</p>
                        <p>{tn("ats.pendingLinks", connection.recentLogSummary.pendingApplicationLinks)}</p>
                      </div>
                      <div className="rounded-2xl bg-surface-sunken p-4 text-sm text-fg-secondary">
                        <Eyebrow className="tracking-wide">{t("ats.webhookEndpoint")}</Eyebrow>
                        <p className="mt-3 break-all font-mono text-xs text-fg-secondary" dir="ltr">{connection.webhookUrl}</p>
                        <Button size="sm" variant="ghost" className="mt-3" onClick={() => void copyWebhookUrl(connection.webhookUrl)}>
                          {t("ats.copyWebhook")}
                        </Button>
                      </div>
                    </div>

                    {connection.capabilities.notes.length > 0 && (
                      <Notice tone="warning" className="mt-4" title={t("ats.readinessGaps")}>
                        <ul className="list-disc ps-5">
                          {connection.capabilities.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </Notice>
                    )}

                    {connection.lastErrorMessage && (
                      <Notice tone="danger" className="mt-4" title={t("ats.latestError")}>
                        <p>{connection.lastErrorMessage}</p>
                        <p className="mt-2 text-xs text-fg-muted">{t("ats.recorded", { when: when(connection.lastErrorAt) })}</p>
                      </Notice>
                    )}

                    {isLogsOpen && (
                      <div className="mt-5 space-y-5 rounded-2xl border border-line bg-surface-sunken p-5">
                        {!logs ? (
                          <div className="flex justify-center py-8">
                            <Spinner />
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                              {(
                                [
                                  [t("ats.linkedApplications"), logs.applicationLinks.stats.total, "text-fg"],
                                  [t("ats.synced"), logs.applicationLinks.stats.synced, "text-success"],
                                  [t("common.pending"), logs.applicationLinks.stats.pending, "text-warning"],
                                  [t("ats.manualReview"), logs.applicationLinks.stats.manualReview, "text-fg"],
                                ] as const
                              ).map(([label, value, tone]) => (
                                <div key={label} className="rounded-2xl bg-surface p-4 text-sm text-fg-secondary">
                                  <Eyebrow className="tracking-wide">{label}</Eyebrow>
                                  <p className={`mt-3 text-2xl font-semibold tabular-nums ${tone}`}>{fmt.number(value)}</p>
                                </div>
                              ))}
                            </div>

                            <div className="grid gap-5 xl:grid-cols-3">
                              <div className="space-y-3 rounded-2xl bg-surface p-4">
                                <h4 className="font-semibold text-fg">{t("ats.recentRuns")}</h4>
                                {logs.syncRuns.length === 0 ? (
                                  <p className="text-sm text-fg-muted">{t("ats.noRuns")}</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.syncRuns.slice(0, 6).map((run) => (
                                      <div key={run.id} className="rounded-xl border border-line p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="font-medium text-fg">{tv("ats.syncType", run.syncType)}</span>
                                          <Badge variant={run.status === "SUCCESS" ? "success" : run.status === "FAILED" ? "danger" : "warning"}>
                                            {tv("ats.runStatus", run.status)}
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-fg-secondary">
                                          {t("ats.runVia", {
                                            direction: tv("ats.direction", run.direction),
                                            trigger: tv("ats.trigger", run.trigger),
                                            when: when(run.startedAt),
                                          })}
                                        </p>
                                        <p className="mt-1 text-fg-secondary">
                                          {t("ats.runCounts", {
                                            created: run.createdJobs,
                                            updated: run.updatedJobs,
                                            stages: run.updatedStages,
                                          })}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-2xl bg-surface p-4">
                                <h4 className="font-semibold text-fg">{t("ats.webhookEvents")}</h4>
                                {logs.webhookEvents.length === 0 ? (
                                  <p className="text-sm text-fg-muted">{t("ats.noWebhookEvents")}</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.webhookEvents.slice(0, 6).map((event) => (
                                      <div key={event.id} className="rounded-xl border border-line p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="break-all font-medium text-fg" dir="ltr">{event.eventType}</span>
                                          <Badge variant={event.status === "PROCESSED" ? "success" : event.status === "FAILED" ? "danger" : "warning"}>
                                            {tv("ats.runStatus", event.status)}
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-fg-secondary">{when(event.receivedAt)}</p>
                                        {event.errorMessage && <p className="mt-1 text-danger">{event.errorMessage}</p>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-3 rounded-2xl bg-surface p-4">
                                <h4 className="font-semibold text-fg">{t("ats.auditTimeline")}</h4>
                                {logs.auditLogs.length === 0 ? (
                                  <p className="text-sm text-fg-muted">{t("ats.noAudit")}</p>
                                ) : (
                                  <div className="space-y-3">
                                    {logs.auditLogs.slice(0, 8).map((entry) => (
                                      <div key={entry.id} className="rounded-xl border border-line p-3 text-sm">
                                        <p className="font-medium text-fg">{tv("ats.action", entry.actionType)}</p>
                                        <p className="mt-1 text-fg-secondary">{entry.summary}</p>
                                        <p className="mt-1 text-xs text-fg-muted">{when(entry.createdAt)}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {logs.applicationLinks.recent.length > 0 && (
                              <div className="rounded-2xl bg-surface p-4">
                                <h4 className="font-semibold text-fg">{t("ats.recentLinks")}</h4>
                                <div className="mt-4 space-y-3">
                                  {logs.applicationLinks.recent.slice(0, 6).map((link) => (
                                    <div key={link.id} className="rounded-xl border border-line p-4 text-sm">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <p className="font-medium text-fg">
                                            {link.application.candidate.name} • {link.application.job.title}
                                          </p>
                                          <p className="mt-1 text-fg-secondary">
                                            {t("ats.linkStatus", {
                                              local: tv("status.app", link.application.status),
                                              external: link.externalStageName || t("ats.unknown"),
                                            })}
                                          </p>
                                        </div>
                                        <Badge variant={link.status === "SYNCED" ? "success" : link.status === "FAILED" ? "danger" : "warning"}>
                                          {tv("ats.linkState", link.status)}
                                        </Badge>
                                      </div>
                                      {link.lastSyncError && <p className="mt-2 text-danger">{link.lastSyncError}</p>}
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
