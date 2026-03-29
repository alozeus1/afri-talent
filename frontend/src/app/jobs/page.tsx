import Link from "next/link";
import { JobCard } from "@/components/jobs/job-card";
import { JobsSearchShell } from "@/components/jobs/jobs-search-shell";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import {
  buildJobsHref,
  hasActiveJobFilters,
  parseJobSearchState,
  toJobListParams,
} from "@/lib/jobs-search";
import { getJobsListServer } from "@/lib/server-public-api";

type JobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const filters = parseJobSearchState(await searchParams);
  const { data, error } = await getJobsListServer(toJobListParams(filters));

  const trustedResults = data?.jobs.filter((job) => job.discovery?.trustedJob).length ?? 0;
  const freshResults =
    data?.jobs.filter((job) => {
      const label = job.discovery?.freshnessLabel;
      return label === "FRESH" || label === "RECENT";
    }).length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Find Your Next Role</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Browse remote and international opportunities from top companies with a lighter, faster search experience.
        </p>
      </div>

      <JobsSearchShell
        filters={filters}
        resultMetrics={
          data
            ? {
                totalResults: data.pagination.total,
                visibleResults: data.jobs.length,
                trustedResults,
                freshResults,
              }
            : undefined
        }
      />

      {error && (
        <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p className="font-semibold">We couldn&apos;t refresh jobs right now.</p>
          <p className="mt-1 text-sm">{error}</p>
          <div className="mt-4">
            <RetryButton />
          </div>
        </div>
      )}

      {!error && data && (
        <>
          <div className="mb-4 flex flex-col gap-2 text-gray-600 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {data.pagination.total} job{data.pagination.total !== 1 ? "s" : ""} found
            </p>
            <p className="text-sm">
              Server-rendered results improve load time on slower devices and unstable networks.
            </p>
          </div>

          {data.jobs.length > 0 && (
            <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-900">
              Search ranking prioritizes relevance, recent refreshes, verified employers, salary transparency, and visa or relocation fit when it matters.
            </div>
          )}

          {data.jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-300 mb-4">No jobs found matching your criteria</p>
              {hasActiveJobFilters(filters) ? (
                <Link href="/jobs">
                  <Button variant="outline">Clear filters</Button>
                </Link>
              ) : (
                <RetryButton />
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {data.jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2">
              {filters.page > 1 ? (
                <Link href={buildJobsHref({ ...filters, page: filters.page - 1 })} prefetch={false}>
                  <Button variant="outline">Previous</Button>
                </Link>
              ) : (
                <Button variant="outline" disabled>
                  Previous
                </Button>
              )}
              <span className="flex items-center px-4 text-gray-600 dark:text-gray-300">
                Page {filters.page} of {data.pagination.totalPages}
              </span>
              {filters.page < data.pagination.totalPages ? (
                <Link href={buildJobsHref({ ...filters, page: filters.page + 1 })} prefetch={false}>
                  <Button variant="outline">Next</Button>
                </Link>
              ) : (
                <Button variant="outline" disabled>
                  Next
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
