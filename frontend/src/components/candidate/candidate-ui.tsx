"use client";

// Small, token-only building blocks shared by the candidate workspace pages
// (/candidate/*). Every string comes from the candidate namespaces, so these
// render in the active locale and read correctly in light and dark mode.
import { useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countryDisplayName, WORLDWIDE_CODE } from "@/lib/countries";
import { useLocale } from "@/lib/i18n/client";
import { useCandidateT, type CandidateMessageKey, type CandidateT } from "@/lib/i18n/candidate-messages";

/** Non-translatable URL placeholders (protocol/domain examples, not copy). */
export const URL_PLACEHOLDERS = {
  generic: "https://",
  linkedin: "https://linkedin.com/in/…",
  github: "https://github.com/…",
  meeting: "https://meet.google.com/…",
} as const;

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

export interface CandidateFriendlyError {
  title: string;
  description: string;
  tone: "info" | "warning" | "error";
}

/** describeCandidateError plus a severity tone (rate limits warn, the rest error). */
export function toCandidateFriendly(error: unknown, t: CandidateT): CandidateFriendlyError {
  const meta = (error && typeof error === "object" ? error : {}) as { status?: unknown; code?: unknown };
  const isRate = meta.status === 429 || meta.code === "QUOTA_EXCEEDED";
  return { ...describeCandidateError(error, t), tone: isRate ? "warning" : "error" };
}

/** Alert box for an already-translated friendly error. */
export function CandidateErrorAlert({
  error,
  testId,
  className = "",
  children,
}: {
  error: CandidateFriendlyError;
  testId?: string;
  className?: string;
  children?: ReactNode;
}) {
  const tone = {
    error: "border-danger-line bg-danger-soft",
    warning: "border-warning-line bg-warning-soft",
    info: "border-info-line bg-info-soft",
  }[error.tone];
  return (
    <div role="alert" aria-live="assertive" data-testid={testId} className={`rounded-xl border p-4 text-sm ${tone} ${className}`}>
      <p className="font-medium text-fg">{error.title}</p>
      <p className="mt-0.5 text-fg-secondary">{error.description}</p>
      {children}
    </div>
  );
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

/** Chip list + free-text input; Enter or comma adds, Backspace on empty removes the last chip. */
export function CandidateTagInput({
  label,
  tags,
  onChange,
  placeholder,
  formatTag,
  id: idProp,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  formatTag?: (tag: string) => string;
  id?: string;
}) {
  const t = useCandidateT();
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = `${id}-hint`;
  const [inputValue, setInputValue] = useState("");

  const addTags = (value: string) => {
    const newTags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0 && !tags.includes(tag));
    if (newTags.length > 0) onChange([...tags, ...newTags]);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(inputValue);
    }
    if (e.key === "Backspace" && inputValue === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={id} className={candidateLabelClass}>
        {label}
      </label>
      {tags.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-success-line bg-primary-soft py-1 pe-1.5 ps-3 text-sm text-primary-text"
            >
              {formatTag ? formatTag(tag) : tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                aria-label={t("ui.removeTag", { tag: formatTag ? formatTag(tag) : tag })}
                className="rounded-full p-0.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => inputValue.trim() && addTags(inputValue)}
        placeholder={placeholder}
        aria-describedby={hintId}
        className={candidateFieldClass}
      />
      <p id={hintId} className="mt-1 text-xs text-fg-muted">
        {t("ui.tagHint")}
      </p>
    </div>
  );
}

/** Localised country name for an ISO code (falls back to the stored label). */
export function useCountryName() {
  const t = useCandidateT();
  const locale = useLocale();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      names = null;
    }
    return (code: string) => {
      if (code === WORLDWIDE_CODE) return t("ui.worldwide");
      if (names && /^[A-Z]{2}$/.test(code)) {
        try {
          return names.of(code) ?? countryDisplayName(code);
        } catch {
          return countryDisplayName(code);
        }
      }
      return countryDisplayName(code);
    };
  }, [locale, t]);
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
