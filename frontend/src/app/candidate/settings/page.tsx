"use client";

// Candidate account settings — Privacy & Data (GDPR self-service).
// Exposes the existing backend endpoints GET /api/profile/export and
// POST /api/profile/delete-request (Workstream E compliance wrap-up).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { profile, ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DELETE_CONFIRM_PHRASE = "DELETE";
const DELETION_WINDOW_DAYS = 30;

export default function CandidateSettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Data export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);

  // Account deletion state
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const [alreadyRequested, setAlreadyRequested] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
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
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Failed to export your data");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await profile.requestAccountDeletion();
      setDeletionRequestedAt(result.requestedAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // Backend rejects with 400 when a deletion is already scheduled.
        setAlreadyRequested(true);
      } else {
        setDeleteError(err instanceof Error ? err.message : "Failed to request account deletion");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account settings</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500 dark:text-gray-400">
          Manage your personal data and account.
        </p>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Privacy &amp; Data
        </h2>

        <div className="space-y-4">
          {/* Data export */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Download my data</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get a copy of the data we store about you — your profile, resume status, and
                application history — as a JSON file.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Button onClick={handleExport} disabled={exporting} size="sm">
                  {exporting ? "Preparing export…" : "Download my data"}
                </Button>
                {exportedAt && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
                    Export downloaded ({new Date(exportedAt).toLocaleString()})
                  </span>
                )}
              </div>
              {exportError && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" role="alert">
                  {exportError}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Account deletion */}
          <Card className="border-red-200 dark:border-red-900">
            <CardContent className="p-5">
              <h3 className="font-semibold text-red-700 dark:text-red-400">Delete my account</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Requesting deletion schedules your account for permanent removal after a{" "}
                <strong>{DELETION_WINDOW_DAYS}-day grace period</strong>. During that window you can
                contact support to cancel the request. After it, your profile, resumes,
                applications, and account data are permanently deleted and cannot be recovered.
              </p>

              {deletionRequestedAt ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" role="status">
                  Deletion requested on {new Date(deletionRequestedAt).toLocaleString()}. Your
                  account will be permanently deleted within {DELETION_WINDOW_DAYS} days. Contact
                  support if you change your mind.
                </p>
              ) : alreadyRequested ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" role="status">
                  Your account is already scheduled for deletion. Contact support if you want to
                  cancel the request.
                </p>
              ) : (
                <div className="mt-3">
                  <label
                    htmlFor="delete-confirm"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Type <span className="font-mono font-semibold">{DELETE_CONFIRM_PHRASE}</span> to
                    confirm
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      id="delete-confirm"
                      type="text"
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      autoComplete="off"
                      className="w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={handleDeleteRequest}
                      disabled={confirmInput !== DELETE_CONFIRM_PHRASE || deleting}
                    >
                      {deleting ? "Submitting request…" : "Request account deletion"}
                    </Button>
                  </div>
                  {deleteError && (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" role="alert">
                      {deleteError}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
