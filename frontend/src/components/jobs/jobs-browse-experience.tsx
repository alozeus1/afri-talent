"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Job, JobListResponse } from "@/lib/api";
import { JobCard } from "@/components/jobs/job-card";
import { JobsSearchShell } from "@/components/jobs/jobs-search-shell";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import { JobResultsSkeletonGrid } from "@/components/ui/skeleton";
import { JobSearchState, buildJobsHref, hasActiveJobFilters } from "@/lib/jobs-search";

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
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.62)] px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:bg-[rgba(7,17,29,0.58)] dark:text-gray-200">
      <span className="font-display text-sm text-gray-950 dark:text-white">{value}</span>
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
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const resultsRef = useRef<HTMLElement | null>(null);
  const shouldScrollToResultsRef = useRef(false);
  const hasResults = jobs.length > 0;

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
    if (!isPending && shouldScrollToResultsRef.current) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      shouldScrollToResultsRef.current = false;
    }
  }, [isPending]);

  const clearFiltersHref = buildPathAwareJobsHref(pathname, {
    search: "",
    location: "",
    type: "",
    seniority: "",
    visaSponsorship: "",
    relocationAssistance: "",
    remote: "",
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
            <p className="font-display text-2xl font-bold text-gray-950 dark:text-white">
              {pagination.total} job{pagination.total !== 1 ? "s" : ""} found
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Search stays anchored while results refresh, so you can keep refining without losing context.
            </p>
          </div>

          {resultMetrics && !error && (
            <div className="flex flex-wrap gap-2">
              <StatPill label="showing now" value={resultMetrics.visibleResults} />
              <StatPill label="trusted cues" value={resultMetrics.trustedResults} />
              <StatPill label="recently refreshed" value={resultMetrics.freshResults} />
            </div>
          )}
        </div>

        {hasResults && !error && (
          <div className="mb-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50/75 px-4 py-4 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
            Search ranking prioritizes relevance, recent refreshes, verified employers, salary transparency, and visa or relocation fit when it matters.
          </div>
        )}

        {error ? (
          <div className="surface-panel-strong rounded-[1.75rem] border border-red-200 px-6 py-8 dark:border-red-500/20">
            <p className="font-display text-2xl font-bold text-gray-950 dark:text-white">
              We couldn&apos;t load the latest roles just now.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              The search controls above are still available. Retry in a moment, or broaden the filters if the market is refreshing.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <RetryButton />
              {hasActiveJobFilters(filters) && (
                <Link href={clearFiltersHref}>
                  <Button variant="ghost">Clear filters</Button>
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
                <JobCard key={job.id} job={job} />
              ))}
            </div>

            {isPending && (
              <div className="pointer-events-none absolute inset-0 z-10 rounded-[1.75rem] bg-[rgba(244,239,229,0.72)] p-2 backdrop-blur-[2px] dark:bg-[rgba(7,17,29,0.55)]">
                <JobResultsSkeletonGrid count={Math.min(Math.max(jobs.length, 3), 6)} />
              </div>
            )}
          </div>
        ) : isPending ? (
          <JobResultsSkeletonGrid count={Math.min(filters.limit, 6)} />
        ) : (
          <div className="surface-panel-strong rounded-[1.75rem] px-6 py-10 text-center">
            <p className="font-display text-2xl font-bold text-gray-950 dark:text-white">
              No roles matched this search yet.
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-gray-600 dark:text-gray-300">
              Try a broader title, a wider location, or clear the mobility filters to see more opportunities.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {hasActiveJobFilters(filters) ? (
                <Link href={clearFiltersHref}>
                  <Button variant="outline">Clear filters</Button>
                </Link>
              ) : (
                <RetryButton />
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
                  Previous
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled>
                Previous
              </Button>
            )}
            <span className="flex items-center justify-center px-4 text-sm text-gray-600 dark:text-gray-300">
              Page {filters.page} of {pagination.totalPages}
            </span>
            {filters.page < pagination.totalPages && !isPending ? (
              <Link href={nextHref}>
                <Button
                  variant="outline"
                  onClick={() => {
                    shouldScrollToResultsRef.current = true;
                  }}
                >
                  Next
                </Button>
              </Link>
            ) : (
              <Button variant="outline" disabled>
                Next
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}
