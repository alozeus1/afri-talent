"use client";

// Route-level error boundary: transient backend failures render a retryable
// error state (with the site chrome intact) instead of the public 404 page.

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ResourceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
        We couldn&apos;t load this resource right now. Please try again in a moment.
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/resources">
          <Button variant="outline">Back to Resources</Button>
        </Link>
      </div>
    </div>
  );
}
