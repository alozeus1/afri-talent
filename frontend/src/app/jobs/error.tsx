"use client";

import { useEffect } from "react";
import { RetryButton } from "@/components/ui/retry-button";

interface JobsErrorProps {
  error: Error & { digest?: string };
}

export default function JobsError({ error }: JobsErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-frame py-10 md:py-14">
      <div className="surface-panel-strong max-w-4xl rounded-[2rem] border border-red-200 p-6 dark:border-red-500/20">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-red-500">Jobs search</p>
        <p className="font-display mt-4 text-3xl font-bold text-gray-950 dark:text-white">
          The jobs page hit an unexpected problem.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-600 dark:text-gray-300">
          Retry the search and keep your filters in place. If this continues, the result provider may still be refreshing in the background.
        </p>
      </div>
      <div className="mt-4">
        <RetryButton />
      </div>
    </div>
  );
}
