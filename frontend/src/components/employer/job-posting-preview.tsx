"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TrustBadge } from "@/components/trust/trust-badge";
import { EmployerJobPreview } from "@/lib/api";
import { useEmployerI18n } from "@/lib/i18n/employer-messages";
import { Eyebrow, Spinner } from "./employer-ui";

interface EmployerJobPostingPreviewProps {
  preview: EmployerJobPreview | null;
  loading?: boolean;
}

function qualityVariant(score: number) {
  if (score >= 80) return "success" as const;
  if (score >= 60) return "info" as const;
  return "warning" as const;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2 text-sm text-fg-secondary">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-muted" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmployerJobPostingPreview({
  preview,
  loading = false,
}: EmployerJobPostingPreviewProps) {
  const { t, tv, ts } = useEmployerI18n();
  return (
    <Card className="border-line bg-surface shadow-card">
      <CardHeader>
        <Eyebrow>{t("preview.eyebrow")}</Eyebrow>
        <h2 className="mt-2 text-lg font-semibold text-fg">{t("preview.title")}</h2>
        <p className="mt-2 text-sm text-fg-secondary">{t("preview.subtitle")}</p>
      </CardHeader>
      <CardContent aria-live="polite">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner label={t("preview.loading")} />
          </div>
        ) : !preview ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken px-4 py-6 text-sm text-fg-secondary">
            {t("preview.empty")}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-line bg-surface-sunken px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <TrustBadge
                  label={t("preview.qualityBadge", { label: tv("quality", preview.qualityLabel) })}
                  variant={qualityVariant(preview.qualityScore)}
                />
                <TrustBadge
                  label={t("preview.riskBadge", { level: tv("risk", preview.moderationRiskLevel) })}
                  riskLevel={preview.moderationRiskLevel}
                  variant="info"
                />
              </div>
              <div className="mt-4 flex items-end gap-3">
                <span className="text-4xl font-bold tabular-nums text-fg">{preview.qualityScore}</span>
                <span className="pb-1 text-sm text-fg-muted">{t("preview.outOf100")}</span>
              </div>
              <p className="mt-3 text-sm text-fg-secondary">{ts(preview.guidance)}</p>
            </div>

            <ul className="grid gap-2">
              {preview.checklist.map((item) => (
                <li
                  key={item.key}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm ${
                    item.done ? "border-success-line bg-success-soft" : "border-warning-line bg-warning-soft"
                  }`}
                >
                  <span className="text-fg">{ts(item.label)}</span>
                  <span className={`shrink-0 font-semibold ${item.done ? "text-success" : "text-warning"}`}>
                    {item.done ? t("preview.ready") : t("preview.needsWork")}
                  </span>
                </li>
              ))}
            </ul>

            {preview.strengths.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-fg">{t("preview.strengths")}</p>
                <BulletList items={preview.strengths.map((item) => ts(item))} />
              </div>
            )}

            {preview.tips.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-fg">{t("preview.tips")}</p>
                <BulletList items={preview.tips.map((item) => ts(item))} />
              </div>
            )}

            {preview.flags.length > 0 && (
              <div className="rounded-2xl border border-danger-line bg-danger-soft px-4 py-4">
                <p className="text-sm font-semibold text-danger">{t("preview.flags")}</p>
                {/* Flags are codes such as "off_platform_contact:<pattern>"; show one line per code. */}
                <BulletList items={[...new Set(preview.flags.map((flag) => tv("flag", flag.split(":")[0])))]} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
