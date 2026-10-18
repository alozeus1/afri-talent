"use client";

import { Button } from "@/components/ui/button";
import { toFriendlyError } from "@/lib/friendly-error";
import { useT } from "@/lib/i18n/client";

interface LoadErrorCardProps {
  /** The raw error from the failed load; mapped through toFriendlyError. */
  error: unknown;
  onRetry: () => void;
  /** What failed to load, e.g. "your applicants". Prefixes the description. */
  subject?: string;
  className?: string;
}

/**
 * Shared "this failed to load" state for dashboards and lists, so a failed
 * request is never shown as a misleading empty state.
 */
export function LoadErrorCard({ error, onRetry, subject, className = "" }: LoadErrorCardProps) {
  const t = useT();
  const friendly = toFriendlyError(error);
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200 ${className}`}
    >
      <p className="font-semibold">{subject ? t("common.ui.couldNotLoad", { subject }) : friendly.title}</p>
      <p className="mt-1 text-sm">{subject ? `${friendly.title}. ${friendly.description}` : friendly.description}</p>
      <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        {t("common.ui.tryAgain")}
      </Button>
    </div>
  );
}
