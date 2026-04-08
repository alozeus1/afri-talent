import { JobResultsSkeletonGrid } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div className="page-frame py-10 md:py-14">
      <div className="mb-8 rounded-[2.5rem] bg-[linear-gradient(135deg,rgba(12,24,36,0.96),rgba(10,92,94,0.88),rgba(245,158,11,0.72))] px-6 py-12 text-white shadow-[0_30px_110px_rgba(11,20,32,0.2)] md:px-10">
        <div className="h-4 w-40 animate-pulse rounded bg-white/20" />
        <div className="mt-5 h-10 w-96 max-w-full animate-pulse rounded bg-white/18" />
        <div className="mt-4 h-5 w-[32rem] max-w-full animate-pulse rounded bg-white/12" />
      </div>

      <div className="surface-panel-strong mb-8 rounded-[2rem] p-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="h-4 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="mt-3 h-8 w-[30rem] max-w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-32 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      </div>

      <div aria-busy="true" aria-live="polite">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        </div>
        <JobResultsSkeletonGrid count={6} />
      </div>
    </div>
  );
}
