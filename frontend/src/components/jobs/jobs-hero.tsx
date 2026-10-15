"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

/**
 * Compact page header for job search: a title (plus a one-line subtitle on
 * wider screens) and a small "how ranking works" disclosure, so the search
 * bar and the first results sit above the fold, including on phones.
 */
export function JobsHero() {
  const t = useT();
  const tp = usePublicT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mb-4 flex items-start justify-between gap-3 md:mb-6 md:items-center">
      <div className="min-w-0 md:flex md:items-baseline md:gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg md:shrink-0 md:text-3xl">
          {t("jobs.hero.compactTitle")}
        </h1>
        <p className="mt-1 hidden truncate text-sm text-fg-secondary md:block">{t("jobs.subtitle")}</p>
      </div>
      <div ref={wrapperRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-semibold text-fg-secondary shadow-xs transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("jobs.hero.rankingInfo")}</span>
          <span className="sr-only sm:hidden">{t("jobs.hero.rankingInfo")}</span>
        </button>
        {open && (
          <div
            id={panelId}
            role="note"
            className="absolute end-0 top-full z-30 mt-2 w-72 rounded-xl border border-line bg-surface-raised p-4 text-sm leading-6 text-fg-secondary shadow-overlay"
          >
            {tp("discover.results.rankingNote")}
          </div>
        )}
      </div>
    </div>
  );
}
