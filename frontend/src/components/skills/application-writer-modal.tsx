"use client";

import { useEffect, useRef, useState } from "react";
import { skills } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toFriendlyError, type FriendlyError } from "@/lib/friendly-error";

interface ApplicationWriterModalProps {
  jobId: string;
  jobTitle: string;
  jobCompany: string;
  onClose: () => void;
  onSuccess: (applicationId: string) => void;
}

type Tone = "professional" | "conversational" | "executive";

export function ApplicationWriterModal({
  jobId,
  jobTitle,
  jobCompany,
  onClose,
  onSuccess,
}: ApplicationWriterModalProps) {
  const [step, setStep] = useState<"idle" | "generating" | "review" | "submitting" | "done">("idle");
  const [coverLetter, setCoverLetter] = useState("");
  const [source, setSource] = useState<"ai" | "template" | null>(null);
  const [tone, setTone] = useState<Tone>("professional");
  const [error, setError] = useState<FriendlyError | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
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
  }, [onClose]);

  async function handleGenerate() {
    setStep("generating");
    setError(null);
    try {
      const result = await skills.generateCoverLetter({ jobId, tone });
      setCoverLetter(result.coverLetter);
      setSource(result.source);
      setStep("review");
    } catch (err) {
      setError(toFriendlyError(err));
      setStep("idle");
    }
  }

  async function handleSubmit() {
    setStep("submitting");
    setError(null);
    try {
      const result = await skills.submitApplication({ jobId, coverLetter });
      setStep("done");
      onSuccess(result.application.id);
    } catch (err) {
      setError(toFriendlyError(err));
      setStep("review");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-writer-title"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 id="application-writer-title" className="text-lg font-semibold text-gray-900">Apply with AI</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {jobTitle} at {jobCompany}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close Application Writer"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="application-writer-error"
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

          {step === "done" && (
            <div className="text-center py-8">
              <p className="text-lg font-semibold text-green-700">Application Submitted!</p>
              <p className="text-sm text-gray-500 mt-1">
                Your application to {jobCompany} has been sent.
              </p>
              <Button onClick={onClose} className="mt-4">
                Close
              </Button>
            </div>
          )}

          {step === "idle" && (
            <div className="py-4 space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Claude will generate a personalised cover letter using your saved resume and this job description.
                You can review and edit it before submitting.
              </p>
              <div role="radiogroup" aria-label="Cover letter tone">
                <p className="block text-xs font-medium text-gray-600 mb-2">Tone</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["professional", "conversational", "executive"] as Tone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={tone === t}
                      onClick={() => setTone(t)}
                      className={`rounded-md border px-3 py-2 text-xs capitalize transition-colors ${
                        tone === t
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <Button onClick={handleGenerate} data-testid="generate-cover-letter-btn">
                  Generate Cover Letter
                </Button>
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Writing your cover letter with Claude...</p>
            </div>
          )}

          {(step === "review" || step === "submitting") && (
            <>
              {source && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {source === "ai" ? "Generated by Claude" : "Template (AI unavailable)"}
                  </span>
                </div>
              )}
              <div>
                <label htmlFor="application-writer-textarea" className="block text-sm font-medium text-gray-700 mb-2">
                  Cover Letter <span className="text-gray-400 font-normal">(editable)</span>
                </label>
                <textarea
                  id="application-writer-textarea"
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  rows={12}
                  data-testid="cover-letter-textarea"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={step === "submitting"}
                  className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  Regenerate
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={step === "submitting" || !coverLetter.trim()}
                  data-testid="submit-application-btn"
                  className="flex-1"
                >
                  {step === "submitting" ? "Submitting..." : "Submit Application"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
