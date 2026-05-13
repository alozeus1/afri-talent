"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";

export function MinimalTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-gray-900">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-mono text-[13px] text-gray-900">
      <h1 className="text-xl font-semibold">{data.fullName || "Your Name"}</h1>
      <p className="mt-0.5 text-gray-700">{data.targetRole || "Target role"}</p>
      <p className="mt-0.5 text-xs text-gray-500">
        {[data.email, data.phone, data.location].filter(Boolean).join(" / ")}
      </p>
      <hr className="my-3 border-gray-200" />
      {data.summary && (
        <Row label="summary">
          <p className="leading-relaxed">{data.summary}</p>
        </Row>
      )}
      {data.skills.length > 0 && <Row label="skills">{data.skills.join(", ")}</Row>}
      {data.workHistory
        .filter((w) => w.company || w.title)
        .map((w, i) => (
          <Row key={`w-${i}`} label={i === 0 ? "experience" : ""}>
            <p>
              <strong>{w.title}</strong>
              {w.company && ` — ${w.company}`}
              {w.period && <span className="text-gray-500"> ({w.period})</span>}
            </p>
            {w.description && <p className="mt-0.5 text-gray-700">{w.description}</p>}
          </Row>
        ))}
      {data.educationHistory
        .filter((e) => e.institution || e.degree)
        .map((e, i) => (
          <Row key={`e-${i}`} label={i === 0 ? "education" : ""}>
            <p>
              <strong>{e.degree}</strong>
              {e.institution && ` — ${e.institution}`}
              {e.period && <span className="text-gray-500"> ({e.period})</span>}
            </p>
          </Row>
        ))}
      {data.certifications.length > 0 && (
        <Row label="certifications">{data.certifications.join(", ")}</Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[80px_1fr] gap-3">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
      <div>{children}</div>
    </div>
  );
}
