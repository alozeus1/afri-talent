"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ClassicTemplate } from "@/components/resume-builder/template-renderers/classic";
import { ModernTemplate } from "@/components/resume-builder/template-renderers/modern";
import { MinimalTemplate } from "@/components/resume-builder/template-renderers/minimal";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";
import { useCandidateT } from "@/lib/i18n/candidate-messages";

interface LivePreviewProps {
  data: ResumePreviewData;
  template: TemplateId;
}

// The resume "paper" is always light (it previews the printed page), so the
// semantic tokens are pinned to their light values inside it. Templates keep
// using tokens and stay legible in dark mode and in print.
const PAPER_TOKENS = {
  "--surface": "#ffffff",
  "--surface-muted": "#ecece8",
  "--fg": "#18181b",
  "--fg-secondary": "#3f3f46",
  "--fg-muted": "#5b5b66",
  "--line": "#e4e4e0",
  "--line-strong": "#d0d0ca",
  "--info": "#1d4ed8",
} as CSSProperties;

export function LivePreview({ data, template }: LivePreviewProps): ReactNode {
  const t = useCandidateT();
  const [collapsedOnMobile, setCollapsedOnMobile] = useState(true);

  const body = (
    <section
      style={PAPER_TOKENS}
      data-testid="resume-preview-pane"
      aria-live="polite"
      aria-label={t("rb.preview.label")}
      className="rounded-xl border border-line bg-surface p-6 text-fg shadow-raised sm:p-8 print:border-0 print:p-0 print:shadow-none"
    >
      {renderTemplate(data, template)}
    </section>
  );

  return (
    <>
      <div className="hidden lg:block print:block">{body}</div>

      <div className="lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => setCollapsedOnMobile((v) => !v)}
          aria-expanded={!collapsedOnMobile}
          data-testid="resume-preview-toggle"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-medium text-fg-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {collapsedOnMobile ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          {collapsedOnMobile ? t("rb.preview.show") : t("rb.preview.hide")}
        </button>
        {!collapsedOnMobile && <div className="mt-3">{body}</div>}
      </div>
    </>
  );
}

function renderTemplate(data: ResumePreviewData, template: TemplateId): ReactNode {
  switch (template) {
    case "modern":
      return <ModernTemplate data={data} />;
    case "minimal":
      return <MinimalTemplate data={data} />;
    case "classic":
    default:
      return <ClassicTemplate data={data} />;
  }
}
