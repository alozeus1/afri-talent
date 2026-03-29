"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";

interface JobDetailErrorProps {
  error: Error & { digest?: string };
}

export default function JobDetailError({ error }: JobDetailErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <p className="font-semibold">This job page is temporarily unavailable.</p>
        <p className="mt-1 text-sm">
          The page could not finish loading on this request. Please try again, or head back to the jobs list.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <RetryButton />
        <Link href="/jobs">
          <Button variant="outline">Back to jobs</Button>
        </Link>
      </div>
    </div>
  );
}
