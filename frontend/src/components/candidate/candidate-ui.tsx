"use client";

// Small, token-only building blocks shared by the candidate workspace pages
// (/candidate/*). Every string comes from the candidate namespaces, so these
// render in the active locale and read correctly in light and dark mode.
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCandidateT, type CandidateMessageKey, type CandidateT } from "@/lib/i18n/candidate-messages";

/** Token-only classes for native inputs/selects/textareas on candidate pages. */
export const candidateFieldClass =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-surface-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted shadow-xs transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-60";

/** Token-only label class paired with candidateFieldClass. */
export const candidateLabelClass = "mb-1.5 block text-sm font-medium text-fg-secondary";

/** "Back to dashboard" style link with an RTL-aware chevron. */
export function CandidateBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Maps an API/fetch error to translated title + description keys. */
export function describeCandidateError(error: unknown, t: CandidateT): { title: string; description: string } {
  const meta = (error && typeof error === "object" ? error : {}) as { status?: unknown; code?: unknown };
  const status = typeof meta.status === "number" ? meta.status : undefined;
  const code = typeof meta.code === "string" ? meta.code : undefined;
  let kind: "rate" | "auth" | "forbidden" | "invalid" | "notFound" | "server" | "network" | "generic" = "generic";
  if (code === "QUOTA_EXCEEDED" || status === 429) kind = "rate";
  else if (status === 401 || code === "SESSION_REVOKED") kind = "auth";
  else if (status === 403) kind = "forbidden";
  else if (status === 400 || status === 422) kind = "invalid";
  else if (status === 404) kind = "notFound";
  else if (status !== undefined && status >= 500) kind = "server";
  else if (error instanceof TypeError) kind = "network";
  return {
    title: t(`ui.error.${kind}.title` as CandidateMessageKey),
    description: t(`ui.error.${kind}.description` as CandidateMessageKey),
  };
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Consistent page title block: eyebrow, H1, supporting copy and actions. */
export function CandidatePageHeader({ title, description, eyebrow, actions, className = "" }: PageHeaderProps) {
  return (
    <header className={`mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-text">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

interface LoadErrorProps {
  error: unknown;
  onRetry?: () => void;
  /** Already-translated noun phrase, e.g. t("ui.subject.applications"). */
  subject?: string;
  className?: string;
}

/** Translated "failed to load" card with a retry action. */
export function CandidateLoadError({ error, onRetry, subject, className = "" }: LoadErrorProps) {
  const t = useCandidateT();
  const friendly = describeCandidateError(error, t);
  return (
    <div role="alert" className={`rounded-2xl border border-danger-line bg-danger-soft p-5 ${className}`}>
      <p className="font-semibold text-fg">{subject ? t("ui.error.couldNotLoad", { subject }) : friendly.title}</p>
      <p className="mt-1 text-sm text-fg-secondary">{friendly.description}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t("ui.tryAgain")}
        </Button>
      ) : null}
    </div>
  );
}

/** Inline, translated error/notice banner for form and action feedback. */
export function CandidateNotice({
  tone = "danger",
  children,
  className = "",
}: {
  tone?: "danger" | "success" | "warning" | "info";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "border-danger-line bg-danger-soft text-danger",
    success: "border-success-line bg-success-soft text-success",
    warning: "border-warning-line bg-warning-soft text-warning",
    info: "border-info-line bg-info-soft text-info",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

/** Centered spinner with a visible, translated label. */
export function CandidateSpinner({ label, className = "" }: { label?: string; className?: string }) {
  const t = useCandidateT();
  return (
    <div role="status" className={`flex items-center justify-center gap-3 py-12 text-fg-muted ${className}`}>
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-primary-text"
      />
      <span className="text-sm font-medium">{label ?? t("ui.loading")}</span>
    </div>
  );
}

/** Accessible on/off switch (role="switch"). */
export function CandidateSwitch({
  checked,
  onChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full bg-primary-fg shadow-xs transition-transform ${
          checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
        }`}
      />
    </button>
  );
}

/** Compact KPI tile used across dashboards. */
export function CandidateStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "info" | "success" | "warning";
}) {
  const valueTone = {
    default: "text-fg",
    primary: "text-primary-text",
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${valueTone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </div>
  );
}
