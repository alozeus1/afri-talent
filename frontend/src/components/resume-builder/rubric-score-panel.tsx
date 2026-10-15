"use client";

import { useId, type ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ATSScoreDisplay } from "@/components/ui/ats-score-display";
import { candidateFieldClass, candidateLabelClass } from "@/components/candidate/candidate-ui";
import { rubricSwatch } from "@/components/resume-builder/types";
import { useCandidateT } from "@/lib/i18n/candidate-messages";
import { FREE_MODE } from "@/lib/free-mode";
import type { AtsRubricResponse } from "@/lib/api";

/** Already-translated error copy. */
export interface RubricPanelError {
  title: string;
  description: string;
  tone: "info" | "warning" | "error";
}

interface RubricScorePanelProps {
  rubric: AtsRubricResponse | null;
  loading: boolean;
  error: RubricPanelError | null;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onScore: () => void;
}

const errorTone = {
  error: "border-danger-line bg-danger-soft",
  warning: "border-warning-line bg-warning-soft",
  info: "border-info-line bg-info-soft",
};

export function RubricScorePanel({
  rubric,
  loading,
  error,
  jobDescription,
  onJobDescriptionChange,
  onScore,
}: RubricScorePanelProps): ReactNode {
  const t = useCandidateT();
  const id = useId();

  const list = (items: string[]) =>
    items.slice(0, 12).join(", ") + (items.length > 12 ? ` ${t("rb.rubric.more", { count: items.length - 12 })}` : "");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">{t("rb.rubric.title")}</h2>
            <p className="mt-0.5 text-sm text-fg-muted">{t("rb.rubric.subtitle")}</p>
          </div>
          <Badge variant={FREE_MODE ? "success" : "info"}>{FREE_MODE ? t("ui.includedFree") : t("ui.premium")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor={`${id}-jd`} className={candidateLabelClass}>
            {t("rb.rubric.jdLabel")}
          </label>
          <textarea
            id={`${id}-jd`}
            value={jobDescription}
            onChange={(e) => onJobDescriptionChange(e.target.value)}
            rows={4}
            className={`${candidateFieldClass} resize-y`}
            placeholder={t("rb.rubric.jdPlaceholder")}
          />
        </div>
        <Button onClick={onScore} disabled={loading} className="w-full" data-testid="resume-rubric-trigger">
          {loading ? t("rb.rubric.scoring") : t("rb.rubric.score")}
        </Button>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-rubric-error"
            className={`rounded-xl border p-3 text-sm ${errorTone[error.tone]}`}
          >
            <p className="font-medium text-fg">{error.title}</p>
            <p className="mt-0.5 text-fg-secondary">{error.description}</p>
          </div>
        )}

        {loading && <LoadingState lines={4} />}

        {rubric && !loading && (
          <div className="space-y-4 pt-2" data-testid="resume-rubric-score">
            <div className="flex flex-wrap items-center gap-4">
              <ATSScoreDisplay score={rubric.atsScore} size="lg" />
              <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                {rubric.source === "ai" ? t("rb.rubric.ai") : t("rb.rubric.heuristic")}
                {rubric.matchScore !== null && <Badge variant="info">{t("rb.rubric.match", { score: rubric.matchScore })}</Badge>}
              </div>
            </div>

            <div className="space-y-2">
              {rubric.criteria.map((c) => {
                const tone = rubricSwatch(c.score);
                return (
                  <div key={c.key} data-testid={`resume-rubric-criterion-${c.key}`} className={`rounded-xl border border-line p-3 ${tone.bg}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm font-medium ${tone.text}`}>{c.label}</p>
                      <p className="text-xs tabular-nums text-fg-secondary">
                        {t("rb.rubric.weight", { score: c.score, weight: c.weight })}
                      </p>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-surface-muted" aria-hidden="true">
                      <div
                        className={`h-2 rounded-full ${tone.bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                      />
                    </div>
                    {c.notes.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-xs text-fg-secondary">
                        {c.notes.slice(0, 5).map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {c.missing && c.missing.length > 0 && (
                      <p className="mt-2 text-xs text-danger">{t("rb.rubric.missing", { items: list(c.missing) })}</p>
                    )}
                    {c.present && c.present.length > 0 && (
                      <p className="mt-1 text-xs text-success">{t("rb.rubric.found", { items: list(c.present) })}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {rubric.suggestions.length > 0 && (
              <div className="rounded-xl border border-info-line bg-info-soft p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-info">{t("rb.rubric.suggestions")}</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-fg-secondary">
                  {rubric.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
