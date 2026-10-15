"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResumeTemplate } from "@/lib/api";
import { Lock, Download, Eye, FileDown } from "lucide-react";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateT } from "@/lib/i18n/candidate-messages";
import { useRouter } from "next/navigation";

interface TemplateCardProps {
  template: ResumeTemplate;
  canDownload: boolean;
  userPlan: string;
  onDownload: (template: ResumeTemplate, format: string) => void;
  onFill?: (template: ResumeTemplate) => void;
  onExportPdf?: (template: ResumeTemplate) => void;
  isDownloading?: boolean;
  isFilling?: boolean;
  isExportingPdf?: boolean;
}

export function TemplateCard({
  template,
  canDownload,
  userPlan,
  onDownload,
  onFill,
  onExportPdf,
  isDownloading,
  isFilling,
  isExportingPdf,
}: TemplateCardProps) {
  const t = useCandidateT();
  const htmlFile = template.files.find((f) => f.format === "HTML");
  const pdfFile = template.files.find((f) => f.format === "PDF");
  const primaryFile = htmlFile || pdfFile || template.files[0];
  const router = useRouter();
  const locale = useLocale();
  // Free launch: templates are never shown as locked.
  const isLocked = !FREE_MODE && template.isLocked;
  const isProfessional = FREE_MODE || userPlan === "PROFESSIONAL";

  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow hover:shadow-raised">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-surface-muted">
        {template.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={template.thumbnailUrl}
            alt={t("tpl.card.previewAlt", { name: template.name })}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-fg-muted">
            <Eye className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="rounded-full bg-surface p-3">
              <Lock className="h-6 w-6 text-fg-secondary" aria-label={t("tpl.card.locked")} />
            </div>
          </div>
        )}
        <div className="absolute bottom-2 start-2 flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="default" className="bg-surface/90 text-xs backdrop-blur-sm">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-semibold text-fg">{template.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{template.description}</p>
        </div>

        {template.bestFor.length > 0 && (
          <p className="text-xs text-fg-muted">{t("tpl.card.bestFor", { items: template.bestFor.join(", ") })}</p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {isLocked ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => router.push(localizePath("/pricing", locale))}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              {t("tpl.card.unlock", { plan: enumLabel(t, "plan", template.minPlan) })}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                disabled={!canDownload || isDownloading}
                onClick={() => primaryFile && onDownload(template, primaryFile.format)}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {isDownloading ? t("tpl.card.downloading") : t("tpl.card.download")}
              </Button>
              {isProfessional && onFill && (
                <Button variant="outline" size="sm" className="w-full" disabled={isFilling} onClick={() => onFill(template)}>
                  {isFilling ? t("tpl.card.filling") : t("tpl.card.fill")}
                </Button>
              )}
              {isProfessional && onExportPdf && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isExportingPdf}
                  onClick={() => onExportPdf(template)}
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  {isExportingPdf ? t("tpl.card.preparingPdf") : t("tpl.card.exportPdf")}
                </Button>
              )}
            </>
          )}
        </div>

        {!isLocked && !canDownload && <p className="text-xs text-warning">{t("tpl.card.limit")}</p>}
      </CardContent>
    </Card>
  );
}
