"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { TEMPLATES, type TemplateId } from "@/components/resume-builder/types";

interface TemplateStepProps {
  selected: TemplateId;
  onSelect: (id: TemplateId) => void;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  isActive: boolean;
}

export function TemplateStep({
  selected,
  onSelect,
  onGenerate,
  generating,
  canGenerate,
  isActive,
}: TemplateStepProps): ReactNode {
  const firstCardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive) firstCardRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-fg-secondary">Choose a template</p>
        <p className="mt-0.5 text-xs text-fg-muted">
          Templates only change the visual layout. The same content appears in each.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TEMPLATES.map((tpl, i) => {
          const isSelected = tpl.id === selected;
          return (
            <button
              key={tpl.id}
              ref={i === 0 ? firstCardRef : undefined}
              type="button"
              onClick={() => onSelect(tpl.id)}
              data-testid={`resume-template-${tpl.id}`}
              data-selected={isSelected ? "true" : undefined}
              aria-pressed={isSelected}
              className={`rounded-lg border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <p className="text-sm font-semibold text-fg">{tpl.label}</p>
              <p className="mt-1 text-xs text-fg-muted">{tpl.description}</p>
            </button>
          );
        })}
      </div>
      <Button
        onClick={onGenerate}
        disabled={generating || !canGenerate}
        className="w-full"
        data-testid="resume-generate-trigger"
      >
        {generating ? "Generating with Claude..." : "Generate Resume"}
      </Button>
      {!canGenerate && (
        <p className="text-xs text-amber-700">
          Add at least your name, email, target role, and one skill in the earlier steps to enable
          generation.
        </p>
      )}
    </div>
  );
}
