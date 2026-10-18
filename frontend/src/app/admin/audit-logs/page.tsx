"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  PaginationBar,
  Panel,
  Pill,
  PillTone,
  SkeletonList,
  fieldClass,
  muted,
  strong,
} from "@/components/admin/console-ui";

// Mirrors the AdminAction enum (backend/prisma/schema.prisma).
const ACTIONS = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DELETED",
  "USER_RESTRICTED",
  "USER_PASSWORD_RESET",
  "USER_SUSPENDED",
  "USER_BANNED",
  "USER_REACTIVATED",
  "USER_SESSIONS_REVOKED",
  "USER_EMAIL_REVERIFICATION_FORCED",
  "USER_MESSAGED",
  "USERS_BROADCAST_SENT",
  "JOB_REVIEWED",
  "JOB_APPROVED",
  "JOB_REJECTED",
  "JOB_CLOSED",
  "JOB_REOPENED",
  "JOB_FEATURED",
  "JOB_UNFEATURED",
  "JOB_REMOVED",
  "APPLICATION_REVIEWED",
  "EMPLOYER_VERIFICATION_UPDATED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "TRUST_CASE_OPENED",
  "TRUST_CASE_ACTIONED",
  "ABUSE_REPORT_ACTIONED",
  "ALERT_CREATED",
  "ALERT_RESOLVED",
  "ALERT_SETTINGS_UPDATED",
  "BULK_OPERATION_STARTED",
  "BULK_OPERATION_COMPLETED",
  "SYSTEM_CONFIGURATION_CHANGED",
] as const;

const TARGET_TYPES = ["USER", "JOB", "EMPLOYER", "APPLICATION", "TRUST_CASE", "VERIFICATION", "BULK_OPERATION"] as const;
const PAGE_SIZE = 50;

interface AuditLog {
  id: string;
  action: string;
  admin: { id: string; title: string; email: string; name: string } | null;
  target: { type: string; id: string | null; name: string | null };
  changes: Record<string, unknown> | null;
  reason: string | null;
  status: string;
  timestamp: string;
  ipAddress: string | null;
}

interface AuditResponse {
  logs: AuditLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function actionTone(action: string): PillTone {
  if (/(CREATED|APPROVED|REACTIVATED|REOPENED|FEATURED|COMPLETED|RESOLVED)$/.test(action) && !action.endsWith("UNFEATURED")) return "green";
  if (/(REJECTED|DELETED|BANNED|SUSPENDED|REMOVED|RESTRICTED|REVOKED)$/.test(action)) return "red";
  if (/(UPDATED|CHANGED|ACTIONED|REVIEWED|FORCED|RESET)$/.test(action)) return "blue";
  return "zinc";
}

export default function AuditLogsPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("ALL");
  const [targetType, setTargetType] = useState("");
  const [targetIdInput, setTargetIdInput] = useState("");
  const [targetId, setTargetId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (action !== "ALL") params.set("action", action);
      if (targetType) params.set("targetType", targetType);
      if (targetId) params.set("targetId", targetId);
      if (startDate) params.set("startDate", new Date(startDate).toISOString());
      if (endDate) params.set("endDate", new Date(`${endDate}T23:59:59`).toISOString());
      const data = await fetchAPI<AuditResponse>(`/api/admin/audit-logs?${params}`);
      setLogs(data.logs ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [page, action, targetType, targetId, startDate, endDate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setTargetId(targetIdInput.trim());
    setPage(1);
  };

  const reset = () => {
    setAction("ALL");
    setTargetType("");
    setTargetIdInput("");
    setTargetId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <Panel className="mb-6">
        <form onSubmit={applySearch} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label={t("audit.action")}>
            {(id) => (
              <select id={id} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className={fieldClass}>
                <option value="ALL">{t("audit.allActions")}</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>{label("auditAction", a)}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("audit.targetType")}>
            {(id) => (
              <select id={id} value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }} className={fieldClass}>
                <option value="">{t("audit.allTypes")}</option>
                {TARGET_TYPES.map((type) => (
                  <option key={type} value={type}>{label("targetType", type)}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("audit.from")}>
            {(id) => <input id={id} type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className={fieldClass} />}
          </Field>
          <Field label={t("audit.to")}>
            {(id) => <input id={id} type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className={fieldClass} />}
          </Field>
          <Field label={t("audit.targetId")}>
            {(id) => (
              <input
                id={id}
                type="search"
                value={targetIdInput}
                onChange={(e) => setTargetIdInput(e.target.value)}
                placeholder={t("audit.targetIdPlaceholder")}
                className={`${fieldClass} font-mono`}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
            <Button type="submit" size="sm">{t("common.search")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>{t("audit.reset")}</Button>
          </div>
        </form>
      </Panel>

      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : logs.length === 0 ? (
        <EmptyState title={t("audit.empty")} description={t("audit.emptyHelp")} />
      ) : (
        <>
          <ol className="space-y-3">
            {logs.map((log) => (
              <li key={log.id} className="surface-panel rounded-2xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={actionTone(log.action)}>{label("auditAction", log.action)}</Pill>
                      {log.status && log.status !== "SUCCESS" && <Pill tone="amber">{label("auditStatus", log.status)}</Pill>}
                    </div>
                    <p className={`mt-2 text-sm font-medium ${strong}`} data-user-content>
                      {log.admin ? t("audit.actor", { name: log.admin.name || log.admin.email, title: log.admin.title }) : t("detail.system")}
                    </p>
                    <p className="mt-0.5 break-all text-sm text-fg-secondary" data-user-content>
                      {label("targetType", log.target.type)}: {log.target.name || log.target.id || t("common.notAvailable")}
                    </p>
                  </div>
                  <div className={`shrink-0 text-xs sm:text-end ${muted}`}>
                    <p title={fmt.dateTime(log.timestamp)}>{fmt.relative(log.timestamp)}</p>
                    {log.ipAddress && <p className="font-mono">{log.ipAddress}</p>}
                  </div>
                </div>
                {log.reason && (
                  <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-fg-secondary">
                    <span className={`font-semibold ${strong}`}>{t("common.reason")}:</span> <span data-user-content>{log.reason}</span>
                  </p>
                )}
                {log.changes && Object.keys(log.changes).length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer select-none font-medium text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                      {t("audit.changes")}
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface-sunken p-3 text-xs text-fg-secondary">
                      {JSON.stringify(log.changes, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
          <PaginationBar pagination={{ page, limit: PAGE_SIZE, total, totalPages }} onPage={setPage} />
        </>
      )}
    </div>
  );
}
