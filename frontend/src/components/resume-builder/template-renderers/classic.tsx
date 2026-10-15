"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

export function ClassicTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  const t = useCandidateT();
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-fg">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-serif text-fg">
      <header className="border-b border-line-strong pb-3">
        <h1 className="text-2xl font-semibold">{data.fullName || t("rb.doc.yourName")}</h1>
        <p className="mt-1 text-sm text-fg-secondary">{data.targetRole || t("rb.doc.targetRole")}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {[data.email, data.phone, data.location].filter(Boolean).join(" • ")}
        </p>
      </header>
      {data.summary && (
        <Section title={t("rb.doc.summary")}>
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title={t("rb.doc.skills")}>
          <p className="text-sm">{data.skills.join(" • ")}</p>
        </Section>
      )}
      {data.workHistory.filter((w) => w.company || w.title).length > 0 && (
        <Section title={t("rb.doc.experience")}>
          {data.workHistory
            .filter((w) => w.company || w.title)
            .map((w, i) => (
              <div key={i} className="mb-3">
                <p className="text-sm font-semibold">
                  {w.title}
                  {w.company && <span className="font-normal text-fg-secondary">, {w.company}</span>}
                </p>
                {w.period && <p className="text-xs text-fg-muted">{w.period}</p>}
                {w.description && <p className="mt-1 text-sm leading-relaxed">{w.description}</p>}
              </div>
            ))}
        </Section>
      )}
      {data.educationHistory.filter((e) => e.institution || e.degree).length > 0 && (
        <Section title={t("rb.doc.education")}>
          {data.educationHistory
            .filter((e) => e.institution || e.degree)
            .map((e, i) => (
              <div key={i} className="mb-1.5 text-sm">
                <span className="font-medium">{e.degree}</span>
                {e.institution && <span className="text-fg-secondary">, {e.institution}</span>}
                {e.period && <span className="text-fg-muted"> — {e.period}</span>}
              </div>
            ))}
        </Section>
      )}
      {data.certifications.length > 0 && (
        <Section title={t("rb.doc.certifications")}>
          <p className="text-sm">{data.certifications.join(" • ")}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-secondary">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
