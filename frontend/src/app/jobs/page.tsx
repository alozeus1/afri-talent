import { JobsBrowseExperience } from "@/components/jobs/jobs-browse-experience";
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
      <div className="relative overflow-hidden rounded-[2.5rem] border border-[var(--border-soft)] bg-[linear-gradient(135deg,rgba(12,24,36,0.96),rgba(10,92,94,0.88),rgba(245,158,11,0.72))] px-6 py-12 text-white shadow-[0_30px_110px_rgba(11,20,32,0.2)] md:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_75%_25%,rgba(255,255,255,0.1),transparent_20%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-white/68">High-signal job discovery</p>
            <h1 className="font-display mt-4 text-4xl font-bold leading-tight md:text-5xl">Find the roles where your credibility and readiness compound.</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-white/78">
              Explore remote and international roles ranked by relevance, recency, trust cues, salary transparency, and mobility fit.
            </p>
          </div>
          <div className="surface-panel gloss-card flex flex-col justify-between rounded-[1.75rem] p-5 text-gray-900 dark:text-white">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Ranking signals</p>
              <p className="mt-3 font-display text-2xl font-bold">Trust, freshness, semantic intent, and cross-border readiness.</p>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
              AfriTalent prioritizes roles that feel more credible and more actionable, not just more plentiful.
            </p>
          </div>
        </div>
      </div>

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
