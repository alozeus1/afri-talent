"use client";

import { ReactNode, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAdminT } from "@/lib/i18n/admin-messages";
import type { AccountRestrictionStatus } from "@/lib/api";
import type { ConsoleJobStatus, EmployerVerificationLevel, Pagination as PaginationData } from "@/lib/admin-console-api";

// Shared building blocks for the admin console. Every colour resolves through
// the semantic design tokens (globals.css), which carry their own light/dark
// values, so text keeps WCAG-AA contrast on both themes.

export const muted = "text-fg-muted";
export const strong = "text-fg";
export const fieldClass =
  "w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted shadow-xs transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-60";
export const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted";
export const linkClass =
  "font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary-text">{eyebrow}</p>}
        <h1 className={`text-2xl font-semibold tracking-tight sm:text-3xl ${strong}`}>{title}</h1>
        {subtitle && <p className={`mt-1 max-w-3xl text-sm ${muted}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  title,
  description,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`surface-panel rounded-2xl p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className={`text-base font-semibold ${strong}`}>{title}</h2>}
            {description && <p className={`mt-0.5 text-sm ${muted}`}>{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
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
    neutral: "from-surface-muted",
    brand: "from-primary-soft",
    warning: "from-warning-soft",
    danger: "from-danger-soft",
    info: "from-info-soft",
  }[tone];
  return (
    <div className="surface-panel relative overflow-hidden rounded-2xl p-5">
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
  green: "border-success-line bg-success-soft text-success",
  amber: "border-warning-line bg-warning-soft text-warning",
  red: "border-danger-line bg-danger-soft text-danger",
  blue: "border-info-line bg-info-soft text-info",
  violet: "border-line bg-primary-soft text-primary-text",
  zinc: "border-line bg-surface-muted text-fg-secondary",
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

/** Maps a free-form backend status onto a pill tone. */
export function statusTone(status: string | null | undefined): PillTone {
  switch (status) {
    case "APPROVED":
    case "ACTIVE":
    case "PUBLISHED":
    case "RESOLVED":
    case "COMPLETED":
    case "SUCCESS":
    case "PROCESSED":
    case "RECONCILED":
    case "VERIFIED":
    case "ACTIONED":
    case "HEALTHY":
    case "VALIDATED":
      return "green";
    case "REJECTED":
    case "FAILED":
    case "DOWN":
    case "CRITICAL":
    case "HIGH":
    case "REVOKED":
    case "SUSPENDED":
    case "BANNED":
      return "red";
    case "PENDING":
    case "OPEN":
    case "IN_REVIEW":
    case "NEEDS_MORE_INFO":
    case "PARTIAL":
    case "DEGRADED":
    case "WARNING":
    case "QUEUED":
    case "RUNNING":
    case "TRIAGED":
    case "DUPLICATE":
    case "PAST_DUE":
    case "MEDIUM":
    case "ACKNOWLEDGED":
      return "amber";
    case "INFO":
    case "RECEIVED":
      return "blue";
    default:
      return "zinc";
  }
}

export function Notice({ tone, children, onDismiss }: { tone: "success" | "error" | "info" | "warning"; children: ReactNode; onDismiss?: () => void }) {
  const t = useAdminT();
  const styles = {
    success: "border-success-line bg-success-soft text-fg",
    error: "border-danger-line bg-danger-soft text-fg",
    info: "border-info-line bg-info-soft text-fg",
    warning: "border-warning-line bg-warning-soft text-fg",
  }[tone];
  const dot = { success: "bg-success", error: "bg-danger", info: "bg-info", warning: "bg-warning" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0 break-words">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-1 text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label={t("common.dismiss")}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useAdminT();
  return (
    <div className="flex justify-center py-16" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </div>
  );
}

/** Skeleton rows for list/card loading states. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const t = useAdminT();
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="surface-panel animate-pulse rounded-2xl p-5" aria-hidden>
          <div className="h-3 w-1/3 rounded bg-surface-muted" />
          <div className="mt-3 h-3 w-2/3 rounded bg-surface-muted" />
          <div className="mt-2 h-3 w-1/2 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary-text" aria-hidden>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h7" />
        </svg>
      </div>
      <p className={`text-sm font-medium ${strong}`}>{title}</p>
      {description && <p className={`mt-1 max-w-md text-sm ${muted}`}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const t = useAdminT();
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-danger-line bg-danger-soft px-6 py-10 text-center">
      <p className={`text-sm font-semibold ${strong}`}>{t("common.loadFailed")}</p>
      <p className={`mt-1 max-w-md text-sm ${muted}`}>{message || t("common.error")}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/** Segmented filter control. Buttons expose aria-pressed for assistive tech. */
export function FilterChips<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: V; label: string; count?: number }>;
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-line bg-surface p-1 shadow-xs">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              active ? "bg-primary text-primary-fg shadow-xs" : "text-fg-secondary hover:bg-surface-muted hover:text-fg"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-white/20" : "bg-surface-muted text-fg-muted"}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Label + control pair with a generated id, so every field is announced. */
export function Field({
  label,
  help,
  className = "",
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children(id)}
      {help && <p className={`mt-1 text-xs ${muted}`}>{help}</p>}
    </div>
  );
}

/** Definition list for read-only key/value facts. */
export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 py-2">
          <dt className={muted}>{item.label}</dt>
          <dd className={`min-w-0 break-all text-end font-medium ${strong}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PaginationBar({ pagination, onPage }: { pagination?: PaginationData; onPage: (page: number) => void }) {
  const t = useAdminT();
  if (!pagination) return null;
  return (
    <div className={`mt-4 flex flex-col items-center justify-between gap-3 text-sm sm:flex-row ${muted}`}>
      <span>
        {t("common.results", { count: pagination.total })} · {t("common.pageOf", { page: pagination.page, total: Math.max(1, pagination.totalPages) })}
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
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label={t("common.close")} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-s border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
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
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label={t("common.cancel")} onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
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
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
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
        <table className="min-w-full divide-y divide-line text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`bg-surface-sunken px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-fg-muted ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-4 py-3 align-top text-fg ${className}`}>{children}</td>;
}
