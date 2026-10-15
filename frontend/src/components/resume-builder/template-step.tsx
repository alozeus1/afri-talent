"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TEMPLATE_IDS, type TemplateId } from "@/components/resume-builder/types";
import { useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

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
  const t = useCandidateT();
  const firstCardRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive) firstCardRef.current?.focus();
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">{t("rb.tpl.choose")}</h3>
        <p className="mt-0.5 text-xs text-fg-muted">{t("rb.tpl.hint")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TEMPLATE_IDS.map((id, i) => {
          const isSelected = id === selected;
          return (
            <button
              key={id}
              ref={i === 0 ? firstCardRef : undefined}
              type="button"
              onClick={() => onSelect(id)}
              data-testid={`resume-template-${id}`}
              data-selected={isSelected ? "true" : undefined}
              aria-pressed={isSelected}
              className={`rounded-xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                isSelected
                  ? "border-primary bg-primary-soft ring-1 ring-primary"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-raised"
              }`}
            >
              <p className="text-sm font-semibold text-fg">{t(`rb.tpl.${id}` as CandidateMessageKey)}</p>
              <p className="mt-1 text-xs text-fg-muted">{t(`rb.tpl.${id}.desc` as CandidateMessageKey)}</p>
            </button>
          );
        })}
      </div>
      <Button
        onClick={onGenerate}
        disabled={generating || !canGenerate}
        isLoading={generating}
        className="w-full"
        data-testid="resume-generate-trigger"
      >
        {!generating && <Sparkles className="h-4 w-4" aria-hidden="true" />}
        {generating ? t("rb.tpl.generating") : t("rb.tpl.generate")}
      </Button>
      {!canGenerate && <p className="text-xs text-warning">{t("rb.tpl.needMore")}</p>}
    </div>
  );
}
