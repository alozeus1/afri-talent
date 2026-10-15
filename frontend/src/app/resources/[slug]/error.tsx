"use client";

// Route-level error boundary: transient backend failures render a retryable
// error state (with the site chrome intact) instead of the public 404 page.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePublicT } from "@/lib/i18n/public-messages";

export default function ResourceError({ reset }: { error: Error; reset: () => void }) {
  const tp = usePublicT();
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
        {tp("site.error.resourceBody")}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>{tp("site.error.retry")}</Button>
        <Link href="/resources">
          <Button variant="outline">{tp("site.error.backToResources")}</Button>
        </Link>
      </div>
    </div>
  );
}
