"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function ClassicTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed text-gray-900">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-serif text-gray-900">
      <header className="border-b border-gray-300 pb-3">
        <h1 className="text-2xl font-semibold">{data.fullName || "Your Name"}</h1>
        <p className="mt-1 text-sm text-gray-700">{data.targetRole || "Target role"}</p>
        <p className="mt-1 text-xs text-gray-500">
          {[data.email, data.phone, data.location].filter(Boolean).join(" • ")}
        </p>
      </header>
      {data.summary && (
        <Section title="Summary">
          <p className="text-sm leading-relaxed">{data.summary}</p>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section title="Skills">
          <p className="text-sm">{data.skills.join(" • ")}</p>
        </Section>
      )}
      {data.workHistory.filter((w) => w.company || w.title).length > 0 && (
        <Section title="Experience">
          {data.workHistory
            .filter((w) => w.company || w.title)
            .map((w, i) => (
              <div key={i} className="mb-3">
                <p className="text-sm font-semibold">
                  {w.title}
                  {w.company && <span className="font-normal text-gray-700">, {w.company}</span>}
                </p>
                {w.period && <p className="text-xs text-gray-500">{w.period}</p>}
                {w.description && <p className="mt-1 text-sm leading-relaxed">{w.description}</p>}
              </div>
            ))}
        </Section>
      )}
      {data.educationHistory.filter((e) => e.institution || e.degree).length > 0 && (
        <Section title="Education">
          {data.educationHistory
            .filter((e) => e.institution || e.degree)
            .map((e, i) => (
              <div key={i} className="mb-1.5 text-sm">
                <span className="font-medium">{e.degree}</span>
                {e.institution && <span className="text-gray-700">, {e.institution}</span>}
                {e.period && <span className="text-gray-500"> — {e.period}</span>}
              </div>
            ))}
        </Section>
      )}
      {data.certifications.length > 0 && (
        <Section title="Certifications">
          <p className="text-sm">{data.certifications.join(" • ")}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-600">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
