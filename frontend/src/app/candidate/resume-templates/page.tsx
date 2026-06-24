"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { templates, type ResumeTemplate, type TemplateListResponse } from "@/lib/api";
import { TemplateCard } from "@/components/resume-template/template-card";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

export default function ResumeTemplatesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [catalog, setCatalog] = useState<TemplateListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [fillingId, setFillingId] = useState<string | null>(null);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    templates
      .list()
      .then((response) => {
        setCatalog(response);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load resume templates.");
      })
      .finally(() => setLoading(false));
  }, [user]);

  async function handleDownload(template: ResumeTemplate, format: string) {
    setDownloadingId(template.id);
    setError(null);
    try {
      const response = await templates.download(template.id, format);
      window.location.assign(response.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the template download.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleFill(template: ResumeTemplate) {
    setFillingId(template.id);
    setError(null);
    try {
      const response = await templates.fill(template.id);
      window.location.assign(response.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fill template with your data.");
    } finally {
      setFillingId(null);
    }
  }

  async function handleExportPdf(template: ResumeTemplate) {
    setExportingPdfId(template.id);
    setError(null);
    try {
      const response = await templates.exportPdf(template.id);
      window.location.assign(response.downloadUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // Backend feature flag off / chromium unavailable → friendly copy
      // instead of the raw 503 error string.
      if (/not enabled|not available/i.test(message)) {
        setError("PDF export isn't available yet on this workspace. Use \"Use with my data\" for the HTML version meanwhile.");
      } else {
        setError(message || "Could not export your resume as PDF.");
      }
    } finally {
      setExportingPdfId(null);
    }
  }

  if (authLoading || !user) return null;

  const quotaLabel =
    catalog?.quota === null
      ? "Unlimited template downloads"
      : `${catalog?.userDownloadsThisMonth ?? 0}/${catalog?.quota ?? 0} downloads used this month`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Resume templates</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Premium ATS-ready templates</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            Preview professional resume layouts and download the formats included with your plan.
          </p>
        </div>
        <Link
          href="/candidate/resume-builder"
          className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-transparent px-3.5 py-2 text-sm font-medium text-zinc-900 shadow-sm transition-all duration-200 hover:bg-zinc-100"
        >
          Back to builder
        </Link>
      </div>

      {catalog && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span className="font-semibold">{catalog.userPlan}</span> plan: {quotaLabel}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState lines={6} />
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
        <Card>
          <CardContent className="p-8">
            <h2 className="text-lg font-semibold text-gray-900">Template bundle coming online</h2>
            <p className="mt-2 text-sm text-gray-600">
              Resume templates are being curated for this workspace. You can still generate and save an ATS-ready resume from the builder.
            </p>
            <Link
              href="/candidate/resume-builder"
              className="mt-5 inline-flex items-center justify-center rounded-md border border-transparent bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-emerald-800"
            >
              Open resume builder
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
