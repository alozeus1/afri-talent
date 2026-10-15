"use client";

import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { richText } from "@/lib/i18n/rich-text";
import { LEGAL_DOCUMENTS, type LegalDocumentDefinition, type LegalDocumentId } from "./legal-docs";

const linkClass = "font-medium text-primary-text underline-offset-2 hover:underline";

/**
 * Renders a legal / policy page from translated message keys. The English
 * text is authoritative; other locales show a short notice saying so.
 */
export function LegalDocument({ id }: { id: LegalDocumentId }) {
  const tp = usePublicT();
  const locale = useLocale();
  const doc: LegalDocumentDefinition = LEGAL_DOCUMENTS[id];
  const updated = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(doc.updated.year, doc.updated.month - 1, 1),
  );

  const rich = (key: PublicMessageKey) =>
    richText(tp(key), {
      mail: (email) => (
        <a href={`mailto:${email}`} className={linkClass} dir="ltr">
          {email}
        </a>
      ),
      ...Object.fromEntries(
        Object.entries(doc.links ?? {}).map(([tag, href]) => [
          tag,
          (chunk: string) => (
            <Link href={localizePath(href, locale)} className={linkClass}>
              {chunk}
            </Link>
          ),
        ]),
      ),
    });

  return (
    <article className="page-frame max-w-3xl py-12 md:py-16">
      <Link
        href={localizePath("/", locale)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tp("legal.backHome")}
      </Link>

      <header className="mt-8 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-text">{tp("legal.eyebrow")}</p>
        <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-fg md:text-4xl">{tp(doc.title)}</h1>
        <p className="mt-3 text-sm text-fg-muted">{tp("legal.updated", { date: updated })}</p>
        {locale !== "en" && (
          <p className="mt-5 flex gap-2 rounded-xl border border-info-line bg-info-soft p-3 text-sm text-fg-secondary">
            <Info className="mt-0.5 h-4 w-4 flex-none text-info" aria-hidden="true" />
            {tp("legal.translationNotice")}
          </p>
        )}
        {doc.intro && <p className="mt-5 text-base leading-7 text-fg-secondary">{rich(doc.intro)}</p>}
      </header>

      <div className="mt-8 space-y-10 leading-7 text-fg-secondary">
        {doc.sections.map((section) => (
          <section key={section.heading} aria-labelledby={section.heading}>
            <h2 id={section.heading} className="mb-3 text-xl font-semibold text-fg">
              {tp(section.heading)}
            </h2>
            <div className="space-y-3">
              {section.blocks.map((block, index) => {
                if (block.kind === "p") return <p key={index}>{rich(block.key)}</p>;
                if (block.kind === "ul")
                  return (
                    <ul key={index} className="list-disc space-y-1.5 ps-5 marker:text-fg-muted">
                      {block.items.map((item) => (
                        <li key={item}>{rich(item)}</li>
                      ))}
                    </ul>
                  );
                return (
                  <div key={index} className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-surface-sunken text-fg">
                        <tr>
                          {block.head.map((cell) => (
                            <th key={cell} scope="col" className="border-b border-line px-3 py-2 text-start font-semibold">
                              {tp(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="bg-surface">
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2 align-top">
                                {typeof cell === "string" ? tp(cell) : <code className="font-mono text-fg">{cell.code}</code>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
