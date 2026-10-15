"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, applications, Job, quickApply, QuickApplyEligibility, QuickApplyPreview } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";
import { localizePath, useLocale } from "@/lib/i18n/client";

const COVER_LETTER_MAX = 5000;

function isAlreadyApplied(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 409 || err.code === "ALREADY_APPLIED")) return true;
  return err instanceof Error && err.message.toLowerCase().includes("already applied");
}

interface QuickApplyModalProps {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickApplyModal({ job, isOpen, onClose, onSuccess }: QuickApplyModalProps) {
  const [eligibility, setEligibility] = useState<QuickApplyEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [success, setSuccess] = useState(false);
  const [consented, setConsented] = useState(false);
  const [preview, setPreview] = useState<QuickApplyPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const locale = useLocale();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const isOnPlatformApply = job.discovery?.deliveryModel === "ON_PLATFORM" || job.jobSource === "EMPLOYER_POSTED";
  const externalApplyUrl = job.applicationUrl || job.sourceUrl || null;

  useEffect(() => {
    if (isOpen) {
      if (!isOnPlatformApply) {
        setLoading(false);
        setEligibility(null);
        setError(null);
        setSuccess(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSuccess(false);
      setEligibility(null);
      setConsented(false);
      setPreview(null);
      setCoverLetter("");

      let cancelled = false;
      quickApply
        .checkEligibility(job.id)
        .then(async (data) => {
          if (cancelled) return;
          setEligibility(data);
          if (!data.eligible) return;
          // Draft the letter up front so the candidate reviews exactly what
          // the employer will receive before consenting.
          setPreviewLoading(true);
          try {
            const drafted = await quickApply.preview(job.id);
            if (cancelled) return;
            setPreview(drafted);
            setCoverLetter(drafted.coverLetter);
          } catch (err) {
            if (cancelled) return;
            if (isAlreadyApplied(err)) {
              onSuccess();
              return;
            }
            setError(toFriendlyError(err));
          } finally {
            if (!cancelled) setPreviewLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(toFriendlyError(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    // onSuccess is intentionally excluded: callers pass an inline closure and
    // re-running the draft on every parent render would refetch the letter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isOnPlatformApply, job.id]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  const handleApply = async () => {
    if (!consented) {
      setError({
        title: "Please confirm before submitting",
        description:
          "Tick the consent box so we know you have reviewed this application.",
        tone: "info",
      });
      return;
    }
    const reviewedLetter = coverLetter.trim();
    if (!reviewedLetter) {
      setError({
        title: "Add a short cover letter",
        description: "Employers respond better to applications with a few lines about why you fit the role.",
        tone: "info",
      });
      return;
    }
    setApplying(true);
    setError(null);

    try {
      await quickApply.apply(job.id, { confirm: true, coverLetter: reviewedLetter });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      if (isAlreadyApplied(err)) {
        onSuccess();
        return;
      }
      setError(toFriendlyError(err));
    } finally {
      setApplying(false);
    }
  };

  const handleExternalApply = async () => {
    if (!externalApplyUrl) return;
    setApplying(true);
    setError(null);
    try {
      await applications.apply({ jobId: job.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!message.toLowerCase().includes("already applied")) {
        setError(toFriendlyError(err));
        setApplying(false);
        return;
      }
    }
    window.open(externalApplyUrl, "_blank", "noopener,noreferrer");
    setApplying(false);
    onSuccess();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-apply-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 id="quick-apply-title" className="sr-only">Quick Apply to {job.title}</h2>
        <Card className="shadow-xl">
          <CardContent className="p-6">
            {/* Close button */}
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close Quick Apply"
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-fg-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Loading */}
            {isOnPlatformApply && loading && (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
                <p className="text-fg-secondary">Checking eligibility...</p>
              </div>
            )}

            {!isOnPlatformApply && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h4m0 0v4m0-4L10 14m-4 6h12a2 2 0 002-2V9a2 2 0 00-2-2h-3m-4 0H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-fg">External Application</h3>
                    <p className="text-sm text-fg-secondary">{job.title}</p>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-indigo-900">
                    This role uses a verified external employer or ATS application path. AfriTalent will not pretend the application was delivered from inside the platform.
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => void handleExternalApply()}
                    disabled={!externalApplyUrl || applying}
                  >
                    {applying ? "Opening..." : "Continue to Employer Site"}
                  </Button>
                  {error && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p className="font-medium">{error.title}</p>
                      <p className="mt-0.5">{error.description}</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {isOnPlatformApply && !loading && error && !eligibility && (
              <div className="py-6">
                <div
                  role="alert"
                  aria-live="assertive"
                  data-testid="quick-apply-error"
                  className={`p-4 rounded-lg mb-4 border text-sm ${
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
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex flex-col items-center py-8">
                <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-primary-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-fg mb-1">Application Sent!</h3>
                <p className="text-sm text-fg-secondary text-center">
                  {preview?.resume
                    ? "Your profile, resume and cover letter have been sent to the employer."
                    : "Your profile and cover letter have been sent to the employer."}
                </p>
              </div>
            )}

            {/* Eligible */}
            {isOnPlatformApply && !loading && !success && eligibility?.eligible && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-fg">Quick Apply</h3>
                    <p className="text-sm text-fg-secondary">{job.title}</p>
                  </div>
                </div>

                {/* Profile completeness */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-fg-secondary">Profile completeness</span>
                    <span className="font-medium text-fg">{eligibility.profileCompleteness}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all"
                      style={{ width: `${eligibility.profileCompleteness}%` }}
                    />
                  </div>
                </div>

                {previewLoading && (
                  <div className="flex items-center gap-3 rounded-lg border border-line p-4 mb-4" data-testid="quick-apply-preview-loading">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
                    <p className="text-sm text-fg-secondary">Drafting your cover letter...</p>
                  </div>
                )}

                {!previewLoading && preview && (
                  <>
                    {preview.resume ? (
                      <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4" data-testid="quick-apply-resume">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Resume attached</p>
                          <p className="truncate text-sm font-medium text-emerald-900">{preview.resume.name}</p>
                        </div>
                        <Link
                          href={localizePath("/candidate/resumes", locale)}
                          className="shrink-0 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
                        >
                          Change
                        </Link>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-900" data-testid="quick-apply-no-resume">
                        <p className="font-medium">No resume attached</p>
                        <p className="mt-0.5">
                          Applications with a resume get far more replies.{" "}
                          <Link href={localizePath("/candidate/resumes", locale)} className="font-medium underline">
                            Upload one
                          </Link>{" "}
                          or{" "}
                          <Link href={localizePath("/candidate/resume-builder", locale)} className="font-medium underline">
                            build one in minutes
                          </Link>
                          . You can still apply now with your profile and cover letter.
                        </p>
                      </div>
                    )}

                    <div className="mb-4">
                      <div className="mb-1 flex items-baseline justify-between">
                        <label htmlFor="quick-apply-cover-letter" className="text-sm font-medium text-fg">
                          Cover letter
                        </label>
                        <span className="text-xs text-fg-muted">
                          {coverLetter.length}/{COVER_LETTER_MAX}
                        </span>
                      </div>
                      <p className="mb-2 text-xs text-fg-muted">
                        We drafted this from your profile. Edit it so it sounds like you; the employer sees exactly this text.
                      </p>
                      <textarea
                        id="quick-apply-cover-letter"
                        data-testid="quick-apply-cover-letter"
                        className="w-full min-h-[200px] rounded-lg border border-line-strong px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={coverLetter}
                        maxLength={COVER_LETTER_MAX}
                        onChange={(e) => setCoverLetter(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {error && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    data-testid="quick-apply-inline-error"
                    className={`p-3 rounded-lg mb-4 border text-sm ${
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

                <label
                  htmlFor="quick-apply-consent"
                  className="flex items-start gap-3 p-3 mb-4 border border-line rounded-lg cursor-pointer hover:bg-surface-sunken transition-colors"
                >
                  <input
                    id="quick-apply-consent"
                    type="checkbox"
                    data-testid="quick-apply-consent-checkbox"
                    checked={consented}
                    onChange={(e) => setConsented(e.target.checked)}
                    className="mt-0.5 h-4 w-4 text-primary-text border-line-strong rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-fg-secondary">
                    I&apos;ve reviewed my cover letter{preview?.resume ? " and the resume being attached" : ""}, and I want AfriTalent to send this application on my behalf.
                  </span>
                </label>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleApply}
                  disabled={applying || !consented || previewLoading || !preview || !coverLetter.trim()}
                  data-testid="quick-apply-submit"
                >
                  {applying ? "Submitting..." : "Submit application"}
                </Button>
              </div>
            )}

            {/* Not Eligible */}
            {isOnPlatformApply && !loading && !success && eligibility && !eligibility.eligible && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-fg">Not Eligible Yet</h3>
                    <p className="text-sm text-fg-secondary">{job.title}</p>
                  </div>
                </div>

                {eligibility.reason && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-amber-800">{eligibility.reason}</p>
                  </div>
                )}

                {/* Profile completeness */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-fg-secondary">Profile completeness</span>
                    <span className="font-medium text-fg">{eligibility.profileCompleteness}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        eligibility.profileCompleteness >= 80 ? "bg-emerald-600" : "bg-amber-500"
                      }`}
                      style={{ width: `${eligibility.profileCompleteness}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  {eligibility.profileCompleteness < 80 && (
                    <Link
                      href="/candidate/profile"
                      className="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg hover:bg-surface-muted transition-colors"
                    >
                      <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-fg">Complete your profile</p>
                        <p className="text-xs text-fg-muted">Add missing details to your profile</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                  {!eligibility.hasActiveResume && (
                    <Link
                      href="/candidate/resumes"
                      className="flex items-center gap-3 p-3 bg-surface-sunken rounded-lg hover:bg-surface-muted transition-colors"
                    >
                      <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-fg">Upload a resume</p>
                        <p className="text-xs text-fg-muted">Add an active resume for Quick Apply</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                </div>

                <Button variant="outline" className="w-full" onClick={onClose}>
                  Close
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
