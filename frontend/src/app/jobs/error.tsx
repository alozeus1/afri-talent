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
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <p className="font-semibold">Jobs are temporarily unavailable.</p>
        <p className="mt-1 text-sm">
          We hit an unexpected issue while loading search results. Please retry once your connection is stable.
        </p>
      </div>
      <div className="mt-4">
        <RetryButton />
      </div>
    </div>
  );
}
