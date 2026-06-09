"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ATSScoreDisplay } from "@/components/ui/ats-score-display";
import { rubricSwatch } from "@/components/resume-builder/types";
import type { AtsRubricResponse } from "@/lib/api";
import type { FriendlyError } from "@/lib/friendly-error";

interface RubricScorePanelProps {
  rubric: AtsRubricResponse | null;
  loading: boolean;
  error: FriendlyError | null;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onScore: () => void;
}

export function RubricScorePanel({
  rubric,
  loading,
  error,
  jobDescription,
  onJobDescriptionChange,
  onScore,
}: RubricScorePanelProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ATS rubric score</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Optionally paste a job description for a targeted, weighted score.
            </p>
          </div>
          <Badge variant="info">Premium</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={jobDescription}
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Paste a job description here for a targeted, weighted rubric score (optional)"
        />
        <Button
          onClick={onScore}
          disabled={loading}
          className="w-full"
          data-testid="resume-rubric-trigger"
        >
          {loading ? "Scoring..." : "Score with ATS rubric"}
        </Button>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            data-testid="resume-rubric-error"
            className={`rounded-md border p-3 text-sm ${
              error.tone === "error"
                ? "bg-red-50 border-red-200 text-red-800"
                : error.tone === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <p className="font-medium">{error.title}</p>
            <p className="mt-0.5">{error.description}</p>
          </div>
        )}

        {loading && <LoadingState lines={4} />}

        {rubric && !loading && (
          <div className="space-y-4 pt-2" data-testid="resume-rubric-score">
            <div className="flex items-center gap-4">
              <ATSScoreDisplay score={rubric.atsScore} size="lg" />
              <div className="text-sm text-gray-500">
                {rubric.source === "ai" ? "AI-powered rubric" : "Heuristic rubric"}
                {rubric.matchScore !== null && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                    Match {rubric.matchScore}/100
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {rubric.criteria.map((c) => {
                const tone = rubricSwatch(c.score);
                return (
                  <div
                    key={c.key}
                    data-testid={`resume-rubric-criterion-${c.key}`}
                    className={`rounded-md border border-gray-200 p-3 ${tone.bg}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm font-medium ${tone.text}`}>{c.label}</p>
                      <p className="text-xs text-gray-600">
                        {c.score}/100 · weight {c.weight}
                      </p>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-white/60">
                      <div
                        className={`h-2 rounded-full ${tone.bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                      />
                    </div>
                    {c.notes.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-xs text-gray-700">
                        {c.notes.slice(0, 5).map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {c.missing && c.missing.length > 0 && (
                      <p className="mt-2 text-xs text-red-700">
                        Missing: {c.missing.slice(0, 12).join(", ")}
                        {c.missing.length > 12 && ` +${c.missing.length - 12} more`}
                      </p>
                    )}
                    {c.present && c.present.length > 0 && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Found: {c.present.slice(0, 12).join(", ")}
                        {c.present.length > 12 && ` +${c.present.length - 12} more`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {rubric.suggestions.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-900">
                  Suggestions
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-900">
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
