"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { usePublicT } from "@/lib/i18n/public-messages";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const tp = usePublicT();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-canvas text-fg antialiased">
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-semibold">{tp("site.error.title")}</h1>
            <p className="text-sm text-fg-secondary">
              {tp("site.error.body")}
            </p>
            <button
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
              onClick={() => reset()}
              type="button"
            >
              {tp("site.error.retry")}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
