import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  lines?: number;
  className?: string;
}

export function LoadingState({ lines = 4, className = "" }: LoadingStateProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-label="Loading...">
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
  return (
    <div className="rounded-xl border bg-white p-6 space-y-4" aria-label="Loading...">
      <Skeleton className="h-5 w-1/3 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-4/6 rounded" />
    </div>
  );
}
