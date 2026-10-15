"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminT } from "@/lib/i18n/admin-messages";
import type { AccountRestrictionStatus } from "@/lib/api";
import type { ConsoleJobStatus, EmployerVerificationLevel, Pagination as PaginationData } from "@/lib/admin-console-api";

// Shared building blocks for the admin console. All colours resolve through
// light/dark pairs so text keeps WCAG-AA contrast on both themes.

export const muted = "text-zinc-600 dark:text-zinc-400";
export const strong = "text-zinc-900 dark:text-zinc-50";
export const fieldClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500";
export const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className={`text-2xl font-semibold sm:text-3xl ${strong}`}>{title}</h1>
        {subtitle && <p className={`mt-1 text-sm ${muted}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface-panel rounded-2xl p-5 ${className}`}>{children}</section>;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "brand" | "warning" | "danger" | "info";
}) {
  const accent = {
    neutral: "from-zinc-400/15",
    brand: "from-emerald-500/20",
    warning: "from-amber-500/20",
    danger: "from-rose-500/20",
    info: "from-sky-500/20",
  }[tone];
  return (
    <div className={`surface-panel relative overflow-hidden rounded-2xl p-5`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} to-transparent`} aria-hidden />
      <div className="relative">
        <p className={`text-xs font-semibold uppercase tracking-wide ${muted}`}>{label}</p>
        <p className={`mt-2 text-3xl font-semibold tabular-nums ${strong}`}>{value}</p>
        {hint && <p className={`mt-1 text-xs ${muted}`}>{hint}</p>}
      </div>
    </div>
  );
}

const pillBase = "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";
const pillTones = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-200",
  amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/40 dark:text-amber-200",
  red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-900/40 dark:text-rose-200",
  blue: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-900/40 dark:text-sky-200",
  violet: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-700/50 dark:bg-violet-900/40 dark:text-violet-200",
  zinc: "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
} as const;
export type PillTone = keyof typeof pillTones;

export function Pill({ tone = "zinc", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`${pillBase} ${pillTones[tone]}`}>{children}</span>;
}

export const restrictionTone: Record<AccountRestrictionStatus, PillTone> = {
  ACTIVE: "green",
  LIMITED: "amber",
  SUSPENDED: "red",
  BANNED: "red",
};

export const jobStatusTone: Record<ConsoleJobStatus, PillTone> = {
  DRAFT: "zinc",
  PENDING_REVIEW: "amber",
  PUBLISHED: "green",
  REJECTED: "red",
  CLOSED: "blue",
  REMOVED: "red",
};

export const verificationTone: Record<EmployerVerificationLevel, PillTone> = {
  UNVERIFIED: "zinc",
  EMAIL_DOMAIN_VERIFIED: "blue",
  BUSINESS_DOC_VERIFIED: "blue",
  MANUAL_REVIEW_APPROVED: "green",
  PREMIUM_TRUSTED: "violet",
};

export function Notice({ tone, children, onDismiss }: { tone: "success" | "error" | "info"; children: ReactNode; onDismiss?: () => void }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-100",
    error: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-100",
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-700/50 dark:bg-sky-900/30 dark:text-sky-100",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div>{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-current opacity-70 hover:opacity-100" aria-label="×">
          ×
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16" aria-busy="true">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
    </div>
  );
}

export function PaginationBar({ pagination, onPage }: { pagination?: PaginationData; onPage: (page: number) => void }) {
  const t = useAdminT();
  if (!pagination) return null;
  return (
    <div className={`mt-4 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row ${muted}`}>
      <span>
        {t("common.results", { count: pagination.total })} · {t("common.pageOf", { page: pagination.page, total: pagination.totalPages })}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          {t("common.prev")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useAdminT();
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" aria-label={t("common.close")} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-s border-[var(--border-soft)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-4">
          <h2 id={titleId} className={`text-lg font-semibold ${strong}`}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  withDate?: { label: string; help?: string };
  onConfirm: (input: { reason: string; date: string | null }) => Promise<void>;
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  // Mounting a fresh inner dialog per request resets its form state.
  if (!request) return null;
  return <ConfirmDialogBody request={request} onClose={onClose} />;
}

function ConfirmDialogBody({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const t = useAdminT();
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const reasonId = useId();
  const dateId = useId();

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError(t("common.reasonTooShort"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await request.onConfirm({ reason: reason.trim(), date: date ? new Date(date).toISOString() : null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--surface)] p-6 shadow-2xl">
        <h2 id={titleId} className={`text-lg font-semibold ${strong}`}>{request.title}</h2>
        {request.description && <p className={`mt-1 text-sm ${muted}`}>{request.description}</p>}
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor={reasonId} className={labelClass}>{t("common.reason")}</label>
            <textarea
              id={reasonId}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the required field when the dialog opens
              autoFocus
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
              aria-describedby={`${reasonId}-help`}
            />
            <p id={`${reasonId}-help`} className={`mt-1 text-xs ${muted}`}>{t("common.reasonHelp")}</p>
          </div>
          {request.withDate && (
            <div>
              <label htmlFor={dateId} className={labelClass}>{request.withDate.label}</label>
              <input id={dateId} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
              {request.withDate.help && <p className={`mt-1 text-xs ${muted}`}>{request.withDate.help}</p>}
            </div>
          )}
          <p className={`text-xs ${muted}`}>{t("confirm.audited")}</p>
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button variant={request.danger ? "danger" : "primary"} onClick={submit} isLoading={submitting}>
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="surface-panel overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border-soft)] text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`bg-zinc-50 px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-400 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-4 py-3 align-top text-zinc-800 dark:text-zinc-200 ${className}`}>{children}</td>;
}
