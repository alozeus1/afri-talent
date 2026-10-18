"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, applications, Job } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useNetworkProfile } from "@/lib/network-profile";
import FeedbackToast from "@/components/ui/feedback-toast";
import { usePublicT } from "@/lib/i18n/public-messages";

const QuickApplyModal = dynamic(
  () => import("@/components/jobs/quick-apply-modal").then((mod) => mod.QuickApplyModal),
  {
    loading: () => null,
  },
);

interface JobApplyPanelProps {
  job: Job;
}

/** A duplicate submit means the candidate already applied: treat it as success. */
function isAlreadyAppliedError(error: unknown): boolean {
  if (error instanceof ApiError && error.status === 409) return true;
  const message = error instanceof Error ? error.message : "";
  return message.toLowerCase().includes("already applied");
}

function formatAppliedDate(value: string | null, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function JobApplyPanel({ job }: JobApplyPanelProps) {
  const locale = useLocale();
  const tp = usePublicT();
  const router = useRouter();
  const { user } = useAuth();
  const { online, isLowBandwidth } = useNetworkProfile();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [emailVerifyNeeded, setEmailVerifyNeeded] = useState(false);
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);
  const isOnPlatformApply = job.discovery?.deliveryModel === "ON_PLATFORM" || job.jobSource === "EMPLOYER_POSTED";
  const externalApplyUrl = job.applicationUrl || job.sourceUrl || null;
  const isCandidate = user?.role === "CANDIDATE";

  // Restore the applied state on revisit/reload so candidates never see
  // "Apply Now" for a job they already applied to.
  useEffect(() => {
    if (!isCandidate) return;
    let cancelled = false;
    applications
      .my()
      .then((mine) => {
        if (cancelled) return;
        const existing = mine.find((application) => application.job?.id === job.id);
        if (existing) {
          setApplied(true);
          setAppliedAt(existing.createdAt ?? null);
        }
      })
      .catch(() => {
        // Non-fatal: the panel still works, and a duplicate submit is treated as success.
      });
    return () => {
      cancelled = true;
    };
  }, [isCandidate, job.id]);

  const markApplied = () => {
    setApplied(true);
    setAppliedAt((prev) => prev ?? new Date().toISOString());
    setToastVisible(true);
  };

  const handleApply = async () => {
    if (!online) {
      setApplyError(tp("discover.apply.offlineError"));
      return;
    }

    if (!user) {
      const redirectPath = localizePath(`/jobs/${job.slug}`, locale);
      router.push(`${localizePath("/login", locale)}?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    if (user.role !== "CANDIDATE") {
      setApplyError(tp("discover.apply.candidatesOnly"));
      return;
    }

    setApplyError(null);

    if (!isOnPlatformApply) {
      if (!externalApplyUrl) {
        setApplyError(tp("discover.apply.noLink"));
        return;
      }

      setApplying(true);
      try {
        await applications.apply({ jobId: job.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("EMAIL_VERIFICATION_REQUIRED") || message.toLowerCase().includes("verify your email")) {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("verifyReturnTo", window.location.href);
          }
          setEmailVerifyNeeded(true);
          setApplying(false);
          return;
        }
        if (!isAlreadyAppliedError(error)) {
          setApplyError(message || tp("discover.apply.recordFailed"));
          setApplying(false);
          return;
        }
      }
      window.open(externalApplyUrl, "_blank", "noopener,noreferrer");
      markApplied();
      setApplying(false);
      return;
    }

    // On-platform jobs always go through the reviewed Quick Apply flow:
    // resume being attached + editable cover letter + explicit consent.
    setQuickApplyOpen(true);
  };

  return (
    <>
      <Card className="sticky top-24">
        <CardContent className="p-6">
          <h2 className="mb-4 font-semibold text-fg">{tp("discover.apply.title")}</h2>

          <div className="mb-4 rounded-2xl border border-info-line bg-info-soft px-4 py-4">
            <p className="text-sm font-semibold text-info">{tp("discover.apply.safeTitle")}</p>
            <p className="mt-2 text-sm text-fg-secondary">
              {isOnPlatformApply ? tp("discover.apply.safeOnPlatform") : tp("discover.apply.safeExternal")}
            </p>
            <Link
              href={`${localizePath("/trust/report", locale)}?targetJobId=${job.id}`}
              className="mt-3 inline-flex text-sm font-medium text-info underline-offset-2 hover:underline"
            >
              {tp("discover.apply.report")}
            </Link>
          </div>

          {!online && (
            <div role="status" className="mb-4 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-fg-secondary">
              {tp("discover.apply.offline")}
            </div>
          )}

          {isLowBandwidth && (
            <div className="mb-4 rounded-lg bg-surface-sunken p-4 text-sm text-fg-secondary">
              {tp("discover.apply.lite")}
            </div>
          )}

          {user && user.role === "EMPLOYER" ? (
            <div className="mb-4 rounded-lg border border-info-line bg-info-soft p-4 text-sm text-fg-secondary">
              <p className="font-medium text-fg">{tp("discover.apply.employerTitle")}</p>
              <p className="mt-1">{tp("discover.apply.candidatesOnly")}</p>
            </div>
          ) : user && user.role === "ADMIN" ? (
            <div className="bg-surface-sunken text-fg-secondary p-4 rounded-lg mb-4 text-sm">
              <p className="font-medium text-fg">{tp("discover.apply.adminTitle")}</p>
              <p className="mt-1">{tp("discover.apply.adminBody")}</p>
            </div>
          ) : (
            <>
              {emailVerifyNeeded && (
                <div role="alert" className="mb-4 rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-fg-secondary">
                  <p className="mb-1 font-semibold text-fg">{tp("discover.apply.verifyTitle")}</p>
                  <p className="mb-3">{tp("discover.apply.verifyBody")}</p>
                  <Link href={localizePath("/candidate", locale)} className="font-medium text-primary-text underline">
                    {tp("discover.apply.verifyResend")}
                  </Link>
                </div>
              )}
              {applyError && (
                <div role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">
                  {applyError}
                </div>
              )}
              {!user && (
                <div className="mb-4 rounded-lg bg-surface-sunken p-4 text-sm text-fg-secondary">
                  {isOnPlatformApply ? tp("discover.apply.signInOnPlatform") : tp("discover.apply.signInExternal")}
                </div>
              )}
              {!isOnPlatformApply && (
                <div className="mb-4 rounded-lg border border-info-line bg-info-soft p-4 text-sm text-fg-secondary">
                  {tp("discover.apply.externalVerified")}
                </div>
              )}
              <div className="space-y-3">
                {applied && isCandidate ? (
                  <>
                    <Button className="w-full" size="lg" disabled data-testid="job-applied-state">
                      {appliedAt ? tp("discover.apply.appliedOn", { date: formatAppliedDate(appliedAt, locale) }) : tp("discover.apply.applied")}
                    </Button>
                    <Link
                      href={localizePath("/candidate/applications", locale)}
                      className="block text-center text-sm font-medium text-primary-text underline-offset-2 hover:underline"
                    >
                      {tp("discover.apply.track")}
                    </Link>
                  </>
                ) : (
                  <Button className="w-full" size="lg" onClick={handleApply} disabled={applying || !online}>
                    {applying
                      ? tp("discover.apply.applying")
                      : isOnPlatformApply
                        ? tp("discover.apply.applyNow")
                        : tp("discover.apply.continueExternal")}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <QuickApplyModal
        job={job}
        isOpen={quickApplyOpen}
        onClose={() => setQuickApplyOpen(false)}
        onSuccess={() => {
          setQuickApplyOpen(false);
          markApplied();
        }}
      />
      <FeedbackToast
        visible={toastVisible}
        onClose={() => setToastVisible(false)}
        mode="success" 
        title={tp("discover.apply.successTitle")}
        message={isOnPlatformApply ? tp("discover.apply.successOnPlatform") : tp("discover.apply.successExternal")}
      />
    </>
  );
}
