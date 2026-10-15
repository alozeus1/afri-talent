"use client";

import { useEffect } from "react";
import { RetryButton } from "@/components/ui/retry-button";
import { usePublicT } from "@/lib/i18n/public-messages";

interface JobsErrorProps {
  error: Error & { digest?: string };
}

export default function JobsError({ error }: JobsErrorProps) {
  const tp = usePublicT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-frame py-10 md:py-14">
      <div className="surface-panel-strong max-w-4xl rounded-[2rem] border border-danger-line p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-danger">{tp("site.error.jobsEyebrow")}</p>
        <p className="font-display mt-4 text-3xl font-bold text-fg">
          {tp("site.error.jobsTitle")}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-secondary">
          {tp("site.error.jobsBody")}
        </p>
      </div>
      <div className="mt-4">
        <RetryButton label={tp("site.error.retry")} />
      </div>
    </div>
  );
}
