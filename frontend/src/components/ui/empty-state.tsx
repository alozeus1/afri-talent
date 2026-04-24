import { ReactNode } from "react";
import Link from "next/link";

interface EmptyStateProps {
  /** Title describing what is empty. */
  title: string;
  /** One or two sentence explanation + nudge. */
  description?: string;
  /** Optional inline SVG icon. */
  icon?: ReactNode;
  /** Primary call-to-action. */
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Secondary call-to-action (e.g. "Learn more"). */
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Identifier for automated tests. */
  testId?: string;
  className?: string;
}

/**
 * Premium-tier empty state. Use whenever a list, table, or results set has no data.
 * - Never render a raw "No data" string.
 * - Always offer at least a primary action so the user knows how to fill the state.
 */
export function EmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  testId,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId ?? "empty-state"}
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-12 text-center ${className}`}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm text-gray-600">{description}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row">
          {primaryAction &&
            (primaryAction.href ? (
              <Link
                href={primaryAction.href}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {primaryAction.label}
              </button>
            ))}
          {secondaryAction &&
            (secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {secondaryAction.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
