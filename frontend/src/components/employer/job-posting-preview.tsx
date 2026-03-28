"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrustBadge } from "@/components/trust/trust-badge";
import { EmployerJobPreview } from "@/lib/api";

interface EmployerJobPostingPreviewProps {
  preview: EmployerJobPreview | null;
  loading?: boolean;
}

function qualityVariant(score: number) {
  if (score >= 80) return "success" as const;
  if (score >= 60) return "info" as const;
  return "warning" as const;
}

export function EmployerJobPostingPreview({
  preview,
  loading = false,
}: EmployerJobPostingPreviewProps) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Credibility preview
        </p>
        <h2 className="mt-2 text-lg font-semibold text-gray-900">Job quality before publish</h2>
        <p className="mt-2 text-sm text-gray-600">
          See how trustworthy and moderation-ready this draft looks before it reaches candidates.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" />
          </div>
        ) : !preview ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Fill in the role basics to unlock your quality score, moderation guidance, and credibility tips.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-3xl bg-slate-950 px-5 py-5 text-white">
              <div className="flex flex-wrap items-center gap-2">
                <TrustBadge
                  label={`${preview.qualityLabel} quality`}
                  variant={qualityVariant(preview.qualityScore)}
                />
                <TrustBadge
                  label={`${preview.moderationRiskLevel} moderation risk`}
                  riskLevel={preview.moderationRiskLevel}
                  variant="info"
                />
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span className="text-4xl font-bold">{preview.qualityScore}</span>
                <span className="pb-1 text-sm text-slate-300">out of 100</span>
              </div>
              <p className="mt-3 text-sm text-slate-300">{preview.guidance}</p>
            </div>

            <div className="grid gap-2">
              {preview.checklist.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-sm ${
                    item.done ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.done ? "Ready" : "Needs work"}</span>
                </div>
              ))}
            </div>

            {preview.strengths.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-900">What is already helping</p>
                <ul className="mt-2 space-y-2 text-sm text-gray-600">
                  {preview.strengths.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.tips.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-900">Fix these before publish</p>
                <ul className="mt-2 space-y-2 text-sm text-gray-600">
                  {preview.tips.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.flags.length > 0 && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                <p className="text-sm font-semibold text-rose-900">Moderation flags detected</p>
                <ul className="mt-2 space-y-2 text-sm text-rose-800">
                  {preview.flags.map((flag) => (
                    <li key={flag}>• {flag}</li>
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
