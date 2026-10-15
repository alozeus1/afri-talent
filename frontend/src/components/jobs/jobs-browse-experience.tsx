"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Job, JobListResponse, savedJobs } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { JobCard } from "@/components/jobs/job-card";
import { rememberJobSearch } from "@/components/jobs/job-detail-links";
import { JobsSearchShell } from "@/components/jobs/jobs-search-shell";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import { JobResultsSkeletonGrid } from "@/components/ui/skeleton";
import {
  DEFAULT_JOB_SORT,
  JOB_SORT_OPTIONS,
  JobSearchState,
  JobSortOption,
  buildJobsHref,
  hasActiveJobFilters,
} from "@/lib/jobs-search";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

const SORT_LABELS: Record<JobSortOption, PublicMessageKey> = {
  relevance: "discover.sort.relevance",
  newest: "discover.sort.newest",
  salary: "discover.sort.salary",
};

interface JobsBrowseExperienceProps {
  filters: JobSearchState;
  jobs: Job[];
  pagination: JobListResponse["pagination"];
  error: string | null;
  resultMetrics?: {
    totalResults: number;
    visibleResults: number;
    trustedResults: number;
    freshResults: number;
  };
}

function buildPathAwareJobsHref(pathname: string, state: Partial<JobSearchState>) {
  const href = buildJobsHref(state);
  return href.startsWith("/jobs") ? href.replace("/jobs", pathname || "/jobs") : href;
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-semibold text-fg-secondary shadow-xs">
      <span className="font-display text-sm text-fg">{value}</span>
      {label}
    </span>
  );
}

export function JobsBrowseExperience({
  filters,
  jobs,
  pagination,
  error,
  resultMetrics,
}: JobsBrowseExperienceProps) {
  const tp = usePublicT();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const resultsRef = useRef<HTMLElement | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const hasResults = jobs.length > 0;
  const { user } = useAuth();
  const isCandidate = user?.role === "CANDIDATE";
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(() => new Set());

  // One saved-ids request for the whole grid (not one per card).
  useEffect(() => {
    if (!isCandidate) {
      return;
    }
    let cancelled = false;
    savedJobs
      .ids()
      .then((data) => {
        if (!cancelled) setSavedJobIds(new Set(data.jobIds));
      })
      .catch(() => {
        // Non-blocking: hearts fall back to unsaved; toggling still works.
      });
    return () => {
      cancelled = true;
    };
  }, [isCandidate]);

  const navigateToState = (nextState: JobSearchState, options?: { scrollToResults?: boolean }) => {
    const nextHref = buildPathAwareJobsHref(pathname, nextState);
    const currentHref = buildPathAwareJobsHref(pathname, filters);

    if (nextHref === currentHref) {
      return;
    }

    if (options?.scrollToResults) {
      shouldScrollToResultsRef.current = true;
    }

    startTransition(() => {
      router.replace(nextHref, { scroll: false });
    });
  };

  useEffect(() => {
    rememberJobSearch(buildPathAwareJobsHref(pathname, filters));
  }, [pathname, filters]);

  useEffect(() => {
    if (!isPending && shouldScrollToResultsRef.current) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shouldScrollToResultsRef.current = false;
    }
  }, [isPending]);

  const clearFiltersHref = buildPathAwareJobsHref(pathname, {
    search: "",
    location: "",
    type: "",
    jobField: "",
    workplaceType: "",
    seniority: "",
    visaSponsorship: "",
    relocationAssistance: "",
    hiresFromAfrica: "",
    remote: "",
    sortBy: filters.sortBy,
    page: 1,
    limit: filters.limit,
  });

  const previousHref = buildPathAwareJobsHref(pathname, { ...filters, page: filters.page - 1 });
  const nextHref = buildPathAwareJobsHref(pathname, { ...filters, page: filters.page + 1 });

  return (
    <>
      <JobsSearchShell
        filters={filters}
        resultMetrics={resultMetrics}
        isPending={isPending}
        onNavigate={navigateToState}
      />

      <section
        ref={resultsRef}
        aria-live="polite"
        aria-busy={isPending}
        className="rounded-[2rem]"
        id="jobs-results"
      >
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="font-display text-2xl font-bold text-fg">
              {tp(pagination.total === 1 ? "discover.results.countOne" : "discover.results.count", { count: pagination.total })}
            </p>
            <p className="text-sm text-fg-secondary">{tp("discover.results.anchored")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-fg-secondary">
              <span>{tp("discover.sort.label")}</span>
              <select
                value={filters.sortBy || DEFAULT_JOB_SORT}
                onChange={(event) =>
                  navigateToState(
                    { ...filters, sortBy: event.target.value as JobSortOption, page: 1 },
                    { scrollToResults: false },
                  )
                }
                className="rounded-full border border-line-strong bg-surface-raised px-3 py-1.5 text-sm text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={tp("discover.sort.aria")}
              >
                {JOB_SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {tp(SORT_LABELS[option])}
                  </option>
                ))}
              </select>
            </label>
          {resultMetrics && !error && (
            <div className="flex flex-wrap gap-2">
              <StatPill label={tp("discover.results.showing")} value={resultMetrics.visibleResults} />
              <StatPill label={tp("discover.results.trusted")} value={resultMetrics.trustedResults} />
              <StatPill label={tp("discover.results.fresh")} value={resultMetrics.freshResults} />
            </div>
          )}
          </div>
        </div>

        {hasResults && !error && (
          <div className="mb-6 rounded-[1.5rem] border border-success-line bg-success-soft px-4 py-4 text-sm text-fg-secondary">
            {tp("discover.results.rankingNote")}
          </div>
        )}

        {error ? (
          <div role="alert" className="surface-panel-strong rounded-[1.75rem] border border-danger-line px-6 py-8">
            <p className="font-display text-2xl font-bold text-fg">{tp("discover.results.errorTitle")}</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-secondary">{tp("discover.results.errorBody")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <RetryButton label={tp("site.error.retry")} />
              {hasActiveJobFilters(filters) && (
                <Link href={clearFiltersHref}>
                  <Button variant="ghost">{tp("discover.filters.clear")}</Button>
                </Link>
              )}
            </div>
          </div>
        ) : hasResults ? (
          <div className="relative">
            <div
              className={`grid gap-6 transition-opacity duration-200 md:grid-cols-2 lg:grid-cols-3 ${
                isPending ? "opacity-35" : "opacity-100"
              }`}
            >
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} initialSaved={isCandidate && savedJobIds.has(job.id)} />
              ))}
            </div>

            {isPending && (
              <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.75rem] bg-canvas/70 p-2 backdrop-blur-[2px]">
                <JobResultsSkeletonGrid count={Math.min(Math.max(jobs.length, 3), 6)} />
              </div>
            )}
          </div>
        ) : isPending ? (
          <JobResultsSkeletonGrid count={Math.min(filters.limit, 6)} />
        ) : (
          <div className="surface-panel-strong rounded-[1.75rem] px-6 py-10 text-center">
            <p className="font-display text-2xl font-bold text-fg">{tp("discover.results.emptyTitle")}</p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-fg-secondary">{tp("discover.results.emptyBody")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {hasActiveJobFilters(filters) ? (
                <Link href={clearFiltersHref}>
                  <Button variant="outline">{tp("discover.filters.clear")}</Button>
                </Link>
              ) : (
                <RetryButton label={tp("site.error.retry")} />
              )}
            </div>
          </div>
        )}

        {pagination.totalPages > 1 && !error && hasResults && (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            {filters.page > 1 && !isPending ? (
              <Link href={previousHref}>
                <Button
                  variant="outline"
                  onClick={() => {
                    shouldScrollToResultsRef.current = true;
                  }}
                >
                  {tp("discover.page.previous")}
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled>
                {tp("discover.page.previous")}
              </Button>
            )}
            <span className="flex items-center justify-center px-4 text-sm text-fg-secondary">
              {tp("discover.page.of", { page: filters.page, total: pagination.totalPages })}
            </span>
            {filters.page < pagination.totalPages && !isPending ? (
              <Link href={nextHref}>
                <Button
                  variant="outline"
                  onClick={() => {
                    shouldScrollToResultsRef.current = true;
                  }}
                >
                  {tp("discover.page.next")}
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled>
                {tp("discover.page.next")}
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
