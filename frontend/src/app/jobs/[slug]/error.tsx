"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/ui/retry-button";
import { usePublicT } from "@/lib/i18n/public-messages";

interface JobDetailErrorProps {
  error: Error & { digest?: string };
}

export default function JobDetailError({ error }: JobDetailErrorProps) {
  const tp = usePublicT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="rounded-2xl border border-danger-line bg-danger-soft p-5 text-danger">
        <p className="font-semibold">{tp("site.error.jobTitle")}</p>
        <p className="mt-1 text-sm">
          {tp("site.error.jobBody")}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <RetryButton label={tp("site.error.retry")} />
        <Link href="/jobs">
          <Button variant="outline">{tp("site.error.backToJobs")}</Button>
        </Link>
      </div>
    </div>
  );
}
