"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/client";

interface LoadingStateProps {
  lines?: number;
  className?: string;
}

export function LoadingState({ lines = 4, className = "" }: LoadingStateProps) {
  const t = useT();
  return (
    <div className={`space-y-3 ${className}`} aria-label={t("common.loading")}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 rounded ${i === lines - 1 ? "w-3/4" : "w-full"}`}
        />
      ))}
    </div>
  );
}

export function CardLoadingState() {
  const t = useT();
  return (
    <div className="rounded-xl border bg-surface p-6 space-y-4" aria-label={t("common.loading")}>
      <Skeleton className="h-5 w-1/3 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-4/6 rounded" />
    </div>
  );
}
