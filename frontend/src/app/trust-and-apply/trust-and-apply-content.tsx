"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { richText } from "@/lib/i18n/rich-text";

const TRACKS: Array<{ badge: string; name: PublicMessageKey; summary: PublicMessageKey; proof: PublicMessageKey }> = [
  { badge: "ATS_API", name: "guides.tna.track.api", summary: "guides.tna.track.apiSummary", proof: "guides.tna.track.apiProof" },
  { badge: "EMAIL_DRAFT", name: "guides.tna.track.email", summary: "guides.tna.track.emailSummary", proof: "guides.tna.track.emailProof" },
  { badge: "OPERATOR_HANDOFF", name: "guides.tna.track.operator", summary: "guides.tna.track.operatorSummary", proof: "guides.tna.track.operatorProof" },
  { badge: "ASSISTED_REDIRECT", name: "guides.tna.track.redirect", summary: "guides.tna.track.redirectSummary", proof: "guides.tna.track.redirectProof" },
];

const LIMITS: PublicMessageKey[] = ["guides.tna.limit1", "guides.tna.limit2", "guides.tna.limit3"];

const linkClass = "font-medium text-primary-text underline-offset-2 hover:underline";

/** Body of /trust-and-apply, rendered in the visitor's language. */
export function TrustAndApplyContent() {
  const tp = usePublicT();
  const locale = useLocale();
  const rich = (key: PublicMessageKey) =>
    richText(tp(key), {
      em: (chunk) => <em>{chunk}</em>,
      mail: (email) => (
        <a className={linkClass} href={`mailto:${email}`} dir="ltr">
          {email}
        </a>
      ),
      privacy: (chunk) => (
        <Link href={localizePath("/privacy-policy", locale)} className={linkClass}>
          {chunk}
        </Link>
      ),
      terms: (chunk) => (
        <Link href={localizePath("/terms-of-service", locale)} className={linkClass}>
          {chunk}
        </Link>
      ),
    });

  return (
    <article className="page-frame max-w-3xl py-12 md:py-16">
      <Link href={localizePath("/", locale)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tp("legal.backHome")}
      </Link>

      <header className="mt-8 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-text">{tp("guides.tna.eyebrow")}</p>
        <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-fg md:text-4xl">{tp("guides.tna.title")}</h1>
        <p className="mt-4 text-base leading-7 text-fg-secondary">{tp("guides.tna.subtitle")}</p>
      </header>

      <div className="mt-10 space-y-10 leading-7 text-fg-secondary">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-fg">{tp("guides.tna.whatTitle")}</h2>
          <p className="mb-3">{rich("guides.tna.what1")}</p>
          <p>{tp("guides.tna.what2")}</p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-fg">{tp("guides.tna.tracksTitle")}</h2>
          <ul className="space-y-4">
            {TRACKS.map((track) => (
              <li key={track.badge} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold text-fg">{tp(track.name)}</h3>
                  <code className="rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs text-fg-muted" dir="ltr">
                    {track.badge}
                  </code>
                </div>
                <p className="mb-3">{tp(track.summary)}</p>
                <p className="text-sm text-fg-muted">
                  <span className="font-semibold text-fg-secondary">{tp("guides.tna.proofKeep")}</span> {tp(track.proof)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-fg">{tp("guides.tna.limitsTitle")}</h2>
          <ul className="list-disc space-y-2 ps-5 marker:text-fg-muted">
            {LIMITS.map((limit) => (
              <li key={limit}>{rich(limit)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-fg">{tp("guides.tna.optOutTitle")}</h2>
          <p className="mb-3">{rich("guides.tna.optOut1")}</p>
          <p>{rich("guides.tna.optOut2")}</p>
        </section>

        <p className="border-t border-line pt-6 text-sm text-fg-muted">{rich("guides.tna.footer")}</p>
      </div>
    </article>
  );
}
