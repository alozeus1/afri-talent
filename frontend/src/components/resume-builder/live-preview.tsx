"use client";

import { useState, type ReactNode } from "react";
import { ClassicTemplate } from "@/components/resume-builder/template-renderers/classic";
import { ModernTemplate } from "@/components/resume-builder/template-renderers/modern";
import { MinimalTemplate } from "@/components/resume-builder/template-renderers/minimal";
import type { ResumePreviewData, TemplateId } from "@/components/resume-builder/types";

interface LivePreviewProps {
  data: ResumePreviewData;
  template: TemplateId;
}

export function LivePreview({ data, template }: LivePreviewProps): ReactNode {
  const [collapsedOnMobile, setCollapsedOnMobile] = useState(true);

  const body = (
    <div
      data-testid="resume-preview-pane"
      aria-live="polite"
      className="rounded-md bg-white p-6 shadow-sm"
    >
      {renderTemplate(data, template)}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">{body}</div>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setCollapsedOnMobile((v) => !v)}
          aria-expanded={!collapsedOnMobile}
          data-testid="resume-preview-toggle"
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700"
        >
          {collapsedOnMobile ? "Show preview" : "Hide preview"}
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
