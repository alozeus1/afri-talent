"use client";

import type { ReactNode } from "react";
import type { ResumePreviewData } from "@/components/resume-builder/types";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

export function MinimalTemplate({ data }: { data: ResumePreviewData }): ReactNode {
  const t = useCandidateT();
  if (data.generatedRawText) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-fg">
        {data.generatedRawText}
      </pre>
    );
  }
  return (
    <div className="font-mono text-[13px] text-fg">
      <h1 className="text-xl font-semibold">{data.fullName || t("rb.doc.yourName")}</h1>
      <p className="mt-0.5 text-fg-secondary">{data.targetRole || t("rb.doc.targetRole")}</p>
      <p className="mt-0.5 text-xs text-fg-muted">
        {[data.email, data.phone, data.location].filter(Boolean).join(" / ")}
      </p>
      <hr className="my-3 border-line" />
      {data.summary && (
        <Row label={t("rb.doc.summary")}>
          <p className="leading-relaxed">{data.summary}</p>
        </Row>
      )}
      {data.skills.length > 0 && <Row label={t("rb.doc.skills")}>{data.skills.join(", ")}</Row>}
      {data.workHistory
        .filter((w) => w.company || w.title)
        .map((w, i) => (
          <Row key={`w-${i}`} label={i === 0 ? t("rb.doc.experience") : ""}>
            <p>
              <strong>{w.title}</strong>
              {w.company && ` — ${w.company}`}
              {w.period && <span className="text-fg-muted"> ({w.period})</span>}
            </p>
            {w.description && <p className="mt-0.5 text-fg-secondary">{w.description}</p>}
          </Row>
        ))}
      {data.educationHistory
        .filter((e) => e.institution || e.degree)
        .map((e, i) => (
          <Row key={`e-${i}`} label={i === 0 ? t("rb.doc.education") : ""}>
            <p>
              <strong>{e.degree}</strong>
              {e.institution && ` — ${e.institution}`}
              {e.period && <span className="text-fg-muted"> ({e.period})</span>}
            </p>
          </Row>
        ))}
      {data.certifications.length > 0 && (
        <Row label={t("rb.doc.certifications")}>{data.certifications.join(", ")}</Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 grid grid-cols-[104px_1fr] gap-3">
      <span className="break-words text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}
