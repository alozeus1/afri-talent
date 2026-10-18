"use client";

import Link from "next/link";
import { Briefcase, Home } from "lucide-react";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

export default function NotFound() {
  const tp = usePublicT();
  const locale = useLocale();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="max-w-lg text-center">
        <p className="font-display text-8xl font-bold tracking-tight text-primary-text">404</p>
        <h1 className="mt-6 text-3xl font-bold text-fg">{tp("site.notFound.title")}</h1>
        <p className="mt-3 text-lg text-fg-secondary">{tp("site.notFound.body")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={localizePath("/", locale)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {tp("site.notFound.home")}
          </Link>
          <Link
            href={localizePath("/jobs", locale)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-6 py-3 text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Briefcase className="h-4 w-4" aria-hidden="true" />
            {tp("site.notFound.browseJobs")}
          </Link>
        </div>
        <p className="mt-12 text-sm text-fg-muted">
          {tp("site.notFound.mistake")}{" "}
          <Link href={localizePath("/contact?topic=TECHNICAL", locale)} prefetch={false} className="font-medium text-primary-text hover:underline">
            {tp("site.notFound.contact")}
          </Link>
        </p>
      </div>
    </div>
  );
}
