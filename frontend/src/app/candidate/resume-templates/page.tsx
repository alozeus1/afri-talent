"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutTemplate } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { templates, type ResumeTemplate, type TemplateListResponse } from "@/lib/api";
import { TemplateCard } from "@/components/resume-template/template-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { FREE_MODE } from "@/lib/free-mode";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { enumLabel, useCandidateFormatters, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

export default function ResumeTemplatesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const [catalog, setCatalog] = useState<TemplateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<CandidateMessageKey | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(localizePath("/login", locale));
  }, [authLoading, router, user, locale]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    templates
      .list()
      .then(setCatalog)
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function handleDownload(template: ResumeTemplate, format: string) {
    setDownloadingId(template.id);
    setActionError(null);
    try {
      const response = await templates.download(template.id, format);
      window.location.assign(response.downloadUrl);
    } catch {
      setActionError("tpl.err.download");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleFill(template: ResumeTemplate) {
    setFillingId(template.id);
    setActionError(null);
    try {
      const response = await templates.fill(template.id);
      window.location.assign(response.downloadUrl);
    } catch {
      setActionError("tpl.err.fill");
    } finally {
      setFillingId(null);
    }
  }

  async function handleExportPdf(template: ResumeTemplate) {
    setExportingPdfId(template.id);
    setActionError(null);
    try {
      const response = await templates.exportPdf(template.id);
      window.location.assign(response.downloadUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // Backend feature flag off / chromium unavailable → friendly copy.
      setActionError(/not enabled|not available/i.test(message) ? "tpl.err.pdfUnavailable" : "tpl.err.pdf");
    } finally {
      setExportingPdfId(null);
    }
  }

  if (authLoading || !user) return <CandidateSpinner className="py-24" />;

  const quotaLabel =
    catalog?.quota === null
      ? t("tpl.unlimited")
      : t("tpl.quota", {
          used: fmt.number(catalog?.userDownloadsThisMonth ?? 0),
          quota: fmt.number(catalog?.quota ?? 0),
        });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate/resume-builder", locale)}>{t("tpl.backToBuilder")}</CandidateBackLink>
      <CandidatePageHeader
        eyebrow={t("tpl.eyebrow")}
        title={FREE_MODE ? t("tpl.title") : t("tpl.titlePremium")}
        description={t("tpl.subtitle")}
      />

      {catalog && (
        <div className="mb-6 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm text-fg">
          {t("tpl.planLine", { plan: enumLabel(t, "plan", catalog.userPlan), quota: quotaLabel })}
        </div>
      )}

      {actionError && <CandidateNotice className="mb-6">{t(actionError)}</CandidateNotice>}

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : loadError ? (
        <CandidateLoadError error={loadError} subject={t("ui.subject.templates")} onRetry={load} />
      ) : catalog?.templates.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {catalog.templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              canDownload={catalog.canDownload}
              userPlan={catalog.userPlan}
              onDownload={handleDownload}
              onFill={catalog.userPlan === "PROFESSIONAL" ? handleFill : undefined}
              onExportPdf={catalog.userPlan === "PROFESSIONAL" ? handleExportPdf : undefined}
              isDownloading={downloadingId === template.id}
              isFilling={fillingId === template.id}
              isExportingPdf={exportingPdfId === template.id}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title={t("tpl.empty.title")}
          description={t("tpl.empty.body")}
          primaryAction={{ label: t("resumes.builder"), href: localizePath("/candidate/resume-builder", locale) }}
        />
      )}

      {!loading && catalog?.templates.length ? (
        <div className="mt-10 flex justify-center">
          <Link href={localizePath("/candidate/resume-builder", locale)}>
            <Button variant="outline">{t("resumes.builder")}</Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
