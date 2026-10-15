"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { localizePath, useLocale } from "@/lib/i18n/client";

/** sessionStorage key holding the last job-search URL (path + query) the user viewed. */
export const LAST_JOB_SEARCH_KEY = "afritalent:last-job-search";

export function rememberJobSearch(href: string) {
  try {
    window.sessionStorage.setItem(LAST_JOB_SEARCH_KEY, href);
  } catch {
    // Storage unavailable (private mode, blocked) — the plain /jobs fallback still works.
  }
}

/** Only same-site relative job-search paths are trusted (no open redirects). */
export function readRememberedJobSearch(): string | null {
  try {
    const value = window.sessionStorage.getItem(LAST_JOB_SEARCH_KEY);
    if (value && value.startsWith("/") && !value.startsWith("//") && value.includes("/jobs")) {
      return value;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * True when the previous page was this site's job search, so router.back()
 * restores the user's filters and scroll position instead of a fresh list.
 */
export function cameFromJobSearch(referrer: string, origin: string): boolean {
  if (!referrer) return false;
  try {
    const url = new URL(referrer);
    return url.origin === origin && url.pathname.includes("/jobs");
  } catch {
    return false;
  }
}

export function BackToJobs({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const fallbackHref = localizePath("/jobs", locale);

  return (
    <Link
      href={fallbackHref}
      className={className}
      onClick={(event) => {
        if (cameFromJobSearch(document.referrer, window.location.origin) && window.history.length > 1) {
          event.preventDefault();
          router.back();
          return;
        }
        // Soft (client-side) navigations do not update document.referrer, so
        // fall back to the last search the jobs page remembered.
        const remembered = readRememberedJobSearch();
        if (remembered) {
          event.preventDefault();
          router.push(remembered);
        }
      }}
    >
      {children}
    </Link>
  );
}

export function CompanyLink({ companyId, children }: { companyId: string; children: ReactNode }) {
  const locale = useLocale();
  return (
    <Link href={localizePath(`/companies/${companyId}`, locale)} className="hover:underline">
      {children}
    </Link>
  );
}
