import { JobListSkeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <div className="h-10 w-64 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mt-3 h-5 w-96 max-w-full animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
      <JobListSkeleton count={6} />
    </div>
  );
}
