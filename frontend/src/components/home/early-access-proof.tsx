"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

const futureTestimonialFields = [
  "site.proof.field.name",
  "site.proof.field.role",
  "site.proof.field.country",
  "site.proof.field.permission",
  "site.proof.field.date",
] as const;

const readinessSignals = [
  "site.proof.signal.trust",
  "site.proof.signal.learning",
  "site.proof.signal.interviews",
  "site.proof.signal.workflow",
] as const;

export function EarlyAccessProof() {
  const tp = usePublicT();
  const locale = useLocale();
  return (
    <section className="section-shell py-16 bg-surface-sunken dark:bg-zinc-900/50">
      <div className="page-frame">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="surface-panel rounded-3xl border border-line bg-surface p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              {tp("site.proof.eyebrow")}
            </p>
            <h2 className="font-display mt-4 text-3xl font-bold text-fg dark:text-zinc-50 md:text-4xl">
              {tp("site.proof.title")}
            </h2>
            <p className="mt-4 text-fg-secondary dark:text-zinc-400">
              {tp("site.proof.body")}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={localizePath("/register", locale)}>
                <Button className="w-full sm:w-auto">{tp("site.proof.join")}</Button>
              </Link>
              <Link href={localizePath("/resources", locale)}>
                <Button variant="outline" className="w-full sm:w-auto">
                  {tp("site.proof.feedback")}
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-panel interactive-card rounded-2xl border border-line bg-surface p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-display text-xl font-bold text-fg dark:text-zinc-50">
                {tp("site.proof.realNow")}
              </h3>
              <ul className="mt-4 space-y-3">
                {readinessSignals.map((signal) => (
                  <li key={signal} className="flex gap-3 text-sm leading-6 text-fg-secondary dark:text-zinc-400">
                    <span aria-hidden="true" className="mt-2 h-2 w-2 flex-none rounded-full bg-emerald-500" />
                    <span>{tp(signal)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-panel interactive-card rounded-2xl border border-line bg-surface p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="font-display text-xl font-bold text-fg dark:text-zinc-50">
                {tp("site.proof.schemaTitle")}
              </h3>
              <p className="mt-3 text-sm leading-6 text-fg-secondary dark:text-zinc-400">
                {tp("site.proof.schemaBody")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {futureTestimonialFields.map((field) => (
                  <span
                    key={field}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    {tp(field)}
                  </span>
                ))}
              </div>
              <Link
                href={localizePath("/employer", locale)}
                className="mt-5 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {tp("site.proof.pilot")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
