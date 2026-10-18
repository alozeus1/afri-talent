"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEmployerT } from "@/lib/i18n/employer-messages";

// Small building blocks shared by the employer pages. Everything here uses the
// semantic tokens from docs/design-system.md, so it reads correctly in light
// and dark mode and inherits RTL from <html dir>.

/** Shared look for native <select> and <textarea> controls (matches <Input>). */
export const controlClass =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-sm text-fg shadow-xs placeholder:text-fg-muted transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-60";

export const labelClass = "mb-1 block text-sm font-medium text-fg-secondary";

export const checkboxClass =
  "h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  const t = useEmployerT();
  return (
    <span role="status" className={`inline-flex items-center justify-center ${className}`}>
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-primary-text"
      />
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </span>
  );
}

export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex justify-center py-24" aria-busy="true">
      <Spinner label={label} className="[&>span:first-child]:h-8 [&>span:first-child]:w-8" />
    </div>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted ${className}`}>{children}</p>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "border-line bg-surface-sunken text-fg-secondary",
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
  brand: "border-success-line bg-primary-soft text-primary-text",
};

/** Inline status message. Body text stays `text-fg-secondary` for readability. */
export function Notice({
  tone = "neutral",
  title,
  children,
  role,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div role={role} className={`rounded-2xl border px-4 py-3 text-sm ${toneClasses[tone]} ${className}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1 text-fg-secondary" : "text-fg-secondary"}>{children}</div>}
    </div>
  );
}

export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  helper,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-xs transition-shadow hover:shadow-card ${
        accent ? "border-success-line bg-primary-soft" : "border-line bg-surface"
      }`}
    >
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-fg">{value}</p>
      {helper && <p className="mt-2 text-sm text-fg-secondary">{helper}</p>}
    </div>
  );
}

/** Dark brand hero shared by the employer cockpit pages (same in both themes). */
export function EmployerHero({
  eyebrow,
  title,
  description,
  children,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[linear-gradient(135deg,#04211e_0%,#064e3b_55%,#0f766e_100%)] px-6 py-8 text-white shadow-raised sm:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-white/5 blur-3xl"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/90 sm:text-base">{description}</p>}
          {children}
        </div>
        {aside}
      </div>
    </section>
  );
}

/**
 * Secondary link-button for the dark hero. A standalone class (not a <Button>
 * variant override) so no light-theme text colour can win the cascade and
 * leave dark text on the dark gradient.
 */
export const heroLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white/30 bg-transparent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0";

export function EmployerLoadError({
  subject,
  onRetry,
  className = "",
}: {
  subject: string;
  onRetry: () => void;
  className?: string;
}) {
  const t = useEmployerT();
  return (
    <div role="alert" className={`rounded-2xl border border-danger-line bg-danger-soft p-6 ${className}`}>
      <p className="font-semibold text-danger">{t("common.loadErrorTitle", { subject })}</p>
      <p className="mt-1 text-sm text-fg-secondary">{t("common.loadErrorBody")}</p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}

export function EmptyPanel({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-6 py-10 text-center ${className}`}>
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-xl text-sm text-fg-secondary">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

/** Accessible modal: labelled, closes on Escape and backdrop click, focuses itself. */
export function EmployerDialog({
  title,
  description,
  onClose,
  children,
  size = "md",
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[85vh] w-full flex-col rounded-2xl border border-line bg-surface-raised p-6 text-fg shadow-overlay focus:outline-none ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-fg">
          {title}
        </h2>
        {description && <div className="mt-2 text-sm text-fg-secondary">{description}</div>}
        <div className="mt-6 flex min-h-0 flex-col">{children}</div>
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-2 rounded-md text-sm font-medium text-primary-text transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <svg aria-hidden="true" className="h-4 w-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {children}
    </Link>
  );
}
