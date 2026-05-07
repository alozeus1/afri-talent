import { JobsBrowseExperience } from "@/components/jobs/jobs-browse-experience";
import { JobsHero } from "@/components/jobs/jobs-hero";
import {
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
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const pagination = data?.pagination ?? {
    page: filters.page,
    limit: filters.limit,
    total: jobs.length,
    totalPages: 1,
  };

  const trustedResults = jobs.filter((job) => job.discovery?.trustedJob).length;
  const freshResults = jobs.filter((job) => {
    const label = job.discovery?.freshnessLabel;
    return label === "FRESH" || label === "RECENT";
  }).length;

  return (
    <div className="page-frame py-10 md:py-14">
      <JobsHero />

      <JobsBrowseExperience
        filters={filters}
        jobs={jobs}
        pagination={pagination}
        error={error}
        resultMetrics={
          data
            ? {
                totalResults: pagination.total,
                visibleResults: jobs.length,
                trustedResults,
                freshResults,
              }
            : undefined
        }
      />
    </div>
  );
}
