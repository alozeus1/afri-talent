"use client";

// Candidate account settings — Privacy & Data (GDPR self-service).
// Exposes the existing backend endpoints GET /api/profile/export and
// POST /api/profile/delete-request (Workstream E compliance wrap-up).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Download, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";
import { profile, ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CandidateBackLink,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
  candidateFieldClass,
} from "@/components/candidate/candidate-ui";

const DELETE_CONFIRM_PHRASE = "DELETE";
const DELETION_WINDOW_DAYS = 30;

export default function CandidateSettingsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [exportedAt, setExportedAt] = useState<string | null>(null);

  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const [alreadyRequested, setAlreadyRequested] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const data = await profile.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `afritalent-data-export-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportedAt(data.exportedAt);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      const result = await profile.requestAccountDeletion();
      setDeletionRequestedAt(result.requestedAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Backend rejects with 400 when a deletion is already scheduled.
        setAlreadyRequested(true);
      } else {
        setDeleteError(true);
      }
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  const [confirmBefore, confirmAfter] = t("set.delete.confirmLabel").split("{phrase}");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-12">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("nav.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader
        title={t("set.title")}
        description={t("set.subtitle")}
        actions={
          <Link href={localizePath("/candidate/preferences", locale)}>
            <Button variant="outline">
              <Bell className="h-4 w-4" aria-hidden="true" />
              {t("set.notifications")}
            </Button>
          </Link>
        }
      />

      <h2 className="mb-3 text-lg font-semibold text-fg">{t("set.privacy")}</h2>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text"
              >
                <Download className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-fg">{t("set.export.title")}</h3>
                <p className="mt-1 text-sm text-fg-secondary">{t("set.export.body")}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={handleExport} disabled={exporting} size="sm">
                    {exporting ? t("set.export.preparing") : t("set.export.title")}
                  </Button>
                  {exportedAt && (
                    <span className="text-sm font-medium text-success" role="status">
                      {t("set.export.done", { date: fmt.dateTime(exportedAt) })}
                    </span>
                  )}
                </div>
                {exportError && <CandidateNotice className="mt-3">{t("set.export.failed")}</CandidateNotice>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-danger-line">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger"
              >
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-danger">{t("set.delete.title")}</h3>
                <p className="mt-1 text-sm text-fg-secondary">{t("set.delete.body", { days: DELETION_WINDOW_DAYS })}</p>

                {deletionRequestedAt ? (
                  <CandidateNotice tone="warning" className="mt-4">
                    {t("set.delete.requested", { date: fmt.dateTime(deletionRequestedAt), days: DELETION_WINDOW_DAYS })}
                  </CandidateNotice>
                ) : alreadyRequested ? (
                  <CandidateNotice tone="warning" className="mt-4">
                    {t("set.delete.already")}
                  </CandidateNotice>
                ) : (
                  <div className="mt-4">
                    <label htmlFor="delete-confirm" className="block text-sm font-medium text-fg-secondary">
                      {confirmBefore}
                      <span className="font-mono font-semibold text-fg">{DELETE_CONFIRM_PHRASE}</span>
                      {confirmAfter}
                    </label>
                    <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        id="delete-confirm"
                        type="text"
                        dir="ltr"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        autoComplete="off"
                        className={`${candidateFieldClass} sm:w-48`}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={handleDeleteRequest}
                        disabled={confirmInput !== DELETE_CONFIRM_PHRASE || deleting}
                      >
                        {deleting ? t("set.delete.submitting") : t("set.delete.request")}
                      </Button>
                    </div>
                    {deleteError && <CandidateNotice className="mt-3">{t("set.delete.failed")}</CandidateNotice>}
                  </div>
                )}
                <Link
                  href={localizePath("/contact", locale)}
                  className="mt-4 inline-block text-sm font-medium text-primary-text hover:underline"
                >
                  {t("set.support")}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
