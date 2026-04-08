"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Job, quickApply, QuickApplyEligibility } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

      quickApply
        .checkEligibility(job.id)
        .then((data) => {
          setEligibility(data);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to check eligibility");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, isOnPlatformApply, job.id]);

  const handleApply = async () => {
    setApplying(true);
    setError(null);

    try {
      await quickApply.apply(job.id);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4">
        <Card className="shadow-xl">
          <CardContent className="p-6">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Loading */}
            {isOnPlatformApply && loading && (
              <div className="flex flex-col items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
                <p className="text-gray-600">Checking eligibility...</p>
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
                    <h3 className="text-lg font-semibold text-gray-900">External Application</h3>
                    <p className="text-sm text-gray-600">{job.title}</p>
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
                    onClick={() => {
                      if (externalApplyUrl) {
                        window.open(externalApplyUrl, "_blank", "noopener,noreferrer");
                        onSuccess();
                      }
                    }}
                    disabled={!externalApplyUrl}
                  >
                    Continue to Employer Site
                  </Button>
                  <Button variant="outline" className="w-full" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {isOnPlatformApply && !loading && error && !eligibility && (
              <div className="py-6">
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
                  {error}
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
                  <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Application Sent!</h3>
                <p className="text-sm text-gray-600 text-center">
                  Your profile and resume have been sent to the employer.
                </p>
              </div>
            )}

            {/* Eligible */}
            {isOnPlatformApply && !loading && !success && eligibility?.eligible && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Quick Apply</h3>
                    <p className="text-sm text-gray-600">{job.title}</p>
                  </div>
                </div>

                {/* Profile completeness */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Profile completeness</span>
                    <span className="font-medium text-gray-900">{eligibility.profileCompleteness}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-emerald-600 h-2 rounded-full transition-all"
                      style={{ width: `${eligibility.profileCompleteness}%` }}
                    />
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-emerald-800">
                    Your profile and active resume will be sent to the employer.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleApply}
                  disabled={applying}
                >
                  {applying ? "Submitting..." : "Apply Now"}
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
                    <h3 className="text-lg font-semibold text-gray-900">Not Eligible Yet</h3>
                    <p className="text-sm text-gray-600">{job.title}</p>
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
                    <span className="text-gray-600">Profile completeness</span>
                    <span className="font-medium text-gray-900">{eligibility.profileCompleteness}%</span>
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
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Complete your profile</p>
                        <p className="text-xs text-gray-500">Add missing details to your profile</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  )}
                  {!eligibility.hasActiveResume && (
                    <Link
                      href="/candidate/resumes"
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Upload a resume</p>
                        <p className="text-xs text-gray-500">Add an active resume for Quick Apply</p>
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
