"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function ModernTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-fg">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-sans text-fg">
      <header className="grid grid-cols-1 gap-2 border-b-2 border-blue-600 pb-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.fullName || "Your Name"}</h1>
          <p className="mt-0.5 text-sm font-medium text-blue-700">
            {data.targetRole || "Target role"}
          </p>
        </div>
        <div className="space-y-0.5 text-xs text-fg-secondary sm:text-right">
          {data.email && <p>{data.email}</p>}
          {data.phone && <p>{data.phone}</p>}
          {data.location && <p>{data.location}</p>}
        </div>
      </header>
      {data.summary && <Block title="Summary">{data.summary}</Block>}
      {data.skills.length > 0 && (
        <Block title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((s) => (
              <span key={s} className="rounded bg-surface-muted px-2 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        </Block>
      )}
      {data.workHistory.filter((w) => w.company || w.title).length > 0 && (
        <Block title="Experience">
          {data.workHistory
            .filter((w) => w.company || w.title)
            .map((w, i) => (
              <div key={i} className="mb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{w.title || "Role"}</p>
                  {w.period && <span className="text-xs text-fg-muted">{w.period}</span>}
                </div>
                {w.company && <p className="text-sm text-blue-700">{w.company}</p>}
                {w.description && <p className="mt-1 text-sm leading-relaxed">{w.description}</p>}
              </div>
            ))}
        </Block>
      )}
      {data.educationHistory.filter((e) => e.institution || e.degree).length > 0 && (
        <Block title="Education">
          {data.educationHistory
            .filter((e) => e.institution || e.degree)
            .map((e, i) => (
              <div key={i} className="mb-1.5 text-sm">
                <span className="font-semibold">{e.degree}</span>
                {e.institution && <span className="text-fg-secondary">, {e.institution}</span>}
                {e.period && <span className="text-fg-muted"> — {e.period}</span>}
              </div>
            ))}
        </Block>
      )}
      {data.certifications.length > 0 && (
        <Block title="Certifications">{data.certifications.join(" • ")}</Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-blue-700">{title}</h2>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );
}
