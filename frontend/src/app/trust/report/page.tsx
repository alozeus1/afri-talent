"use client";

import Link from "next/link";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AbuseReportInput, trust } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustStatusBanner } from "@/components/trust/trust-status-banner";
import { TrustSupportCard } from "@/components/trust/trust-support-card";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

const REASON_LABELS: Record<AbuseReportInput["reason"], PublicMessageKey> = {
  SCAM: "guides.report.reason.SCAM",
  FAKE_JOB: "guides.report.reason.FAKE_JOB",
  IMPERSONATION: "guides.report.reason.IMPERSONATION",
  SPAM: "guides.report.reason.SPAM",
  OFF_PLATFORM_CONTACT: "guides.report.reason.OFF_PLATFORM_CONTACT",
  ADVANCE_FEE_REQUEST: "guides.report.reason.ADVANCE_FEE_REQUEST",
  HARASSMENT: "guides.report.reason.HARASSMENT",
  FAKE_PROFILE: "guides.report.reason.FAKE_PROFILE",
  MISLEADING_SALARY: "guides.report.reason.MISLEADING_SALARY",
  OTHER: "guides.report.reason.OTHER",
};
const reportReasons = Object.keys(REASON_LABELS) as AbuseReportInput["reason"][];

const FIELD_CLASS =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg placeholder:text-fg-muted shadow-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus";

function ReportAbusePageContent() {
  const locale = useLocale();
  const tp = usePublicT();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [reason, setReason] = useState<AbuseReportInput["reason"]>(
    (searchParams.get("reason") as AbuseReportInput["reason"]) || "SCAM",
  );
  const [details, setDetails] = useState(searchParams.get("details") || "");
  const [reportedUserId, setReportedUserId] = useState(searchParams.get("reportedUserId") || "");
  const [employerId, setEmployerId] = useState(searchParams.get("employerId") || "");
  const [targetJobId, setTargetJobId] = useState(searchParams.get("targetJobId") || "");
  const [targetApplicationId, setTargetApplicationId] = useState(searchParams.get("targetApplicationId") || "");
  const [targetThreadId, setTargetThreadId] = useState(searchParams.get("targetThreadId") || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ reportId: string; caseId: string; message: string } | null>(null);

  const activeTargets = useMemo(
    () =>
      [
        { label: tp("guides.report.target.user"), value: reportedUserId },
        { label: tp("guides.report.target.employer"), value: employerId },
        { label: tp("guides.report.target.job"), value: targetJobId },
        { label: tp("guides.report.target.application"), value: targetApplicationId },
        { label: tp("guides.report.target.conversation"), value: targetThreadId },
      ].filter((target) => Boolean(target.value)),
    [employerId, reportedUserId, targetApplicationId, targetJobId, targetThreadId, tp],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setError(tp("guides.report.signInError"));
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await trust.reportAbuse({
        reason,
        details: details.trim() || undefined,
        reportedUserId: reportedUserId.trim() || undefined,
        employerId: employerId.trim() || undefined,
        targetJobId: targetJobId.trim() || undefined,
        targetApplicationId: targetApplicationId.trim() || undefined,
        targetThreadId: targetThreadId.trim() || undefined,
      });
      setSuccess(result);
      setDetails("");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : tp("guides.report.submitError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 shadow-xs">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-amber-500/10" aria-hidden="true" />
        <div className="relative">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-danger">{tp("guides.report.eyebrow")}</p>
          <h1 className="font-display mb-4 text-4xl font-bold tracking-tight text-fg">{tp("guides.report.title")}</h1>
          <p className="max-w-3xl text-lg text-fg-secondary">{tp("guides.report.subtitle")}</p>
        </div>
      </section>

      {!user && (
        <TrustStatusBanner
          tone="warning"
          title={tp("guides.report.signInTitle")}
          body={tp("guides.report.signInBody")}
          actions={
            <Link href={`${localizePath("/login", locale)}?redirect=${encodeURIComponent(localizePath("/trust/report", locale))}`}>
              <Button>{tp("guides.report.signIn")}</Button>
            </Link>
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-fg">{tp("guides.report.formTitle")}</h2>
            <p className="text-sm text-fg-secondary">{tp("guides.report.formBody")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <TrustStatusBanner
                  tone="danger"
                  title={tp("guides.report.errorTitle")}
                  body={error}
                />
              )}

              {success && (
                <TrustStatusBanner
                  tone="success"
                  title={tp("guides.report.successTitle")}
                  body={tp("guides.report.successBody", { message: success.message, reportId: success.reportId, caseId: success.caseId })}
                />
              )}

              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-fg-secondary mb-1">
                  {tp("guides.report.reason")}
                </label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value as AbuseReportInput["reason"])}
                  className={FIELD_CLASS}
                >
                  {reportReasons.map((value) => (
                    <option key={value} value={value}>
                      {tp(REASON_LABELS[value])}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="report-user"
                label={tp("guides.report.userId")}
                value={reportedUserId}
                onChange={(event) => setReportedUserId(event.target.value)}
                placeholder={tp("guides.report.userIdHint")}
              />
              <Input
                id="report-employer"
                label={tp("guides.report.employerId")}
                value={employerId}
                onChange={(event) => setEmployerId(event.target.value)}
                placeholder={tp("guides.report.employerIdHint")}
              />
              <Input
                id="report-job"
                label={tp("guides.report.jobId")}
                value={targetJobId}
                onChange={(event) => setTargetJobId(event.target.value)}
                placeholder={tp("guides.report.jobIdHint")}
              />
              <Input
                id="report-application"
                label={tp("guides.report.applicationId")}
                value={targetApplicationId}
                onChange={(event) => setTargetApplicationId(event.target.value)}
                placeholder={tp("guides.report.applicationIdHint")}
              />
              <Input
                id="report-thread"
                label={tp("guides.report.threadId")}
                value={targetThreadId}
                onChange={(event) => setTargetThreadId(event.target.value)}
                placeholder={tp("guides.report.threadIdHint")}
              />

              <div>
                <label htmlFor="details" className="block text-sm font-medium text-fg-secondary mb-1">
                  {tp("guides.report.details")}
                </label>
                <textarea
                  id="details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={8}
                  placeholder={tp("guides.report.detailsHint")}
                  className={FIELD_CLASS}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? tp("guides.report.submitting") : tp("discover.report.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-fg">{tp("guides.report.targetsTitle")}</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTargets.length ? (
                activeTargets.map((target) => (
                  <div key={`${target.label}-${target.value}`} className="rounded-2xl border border-line bg-surface-sunken px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
                      {target.label}
                    </p>
                    <p className="mt-2 break-all text-sm font-medium text-fg">{target.value}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-fg-secondary">{tp("guides.report.noTargets")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-fg">{tp("guides.report.nextTitle")}</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-fg-secondary">
              <p className="rounded-2xl border border-line bg-surface-sunken px-4 py-3">{tp("guides.report.next1")}</p>
              <p className="rounded-2xl border border-line bg-surface-sunken px-4 py-3">{tp("guides.report.next2")}</p>
              <p className="rounded-2xl border border-line bg-surface-sunken px-4 py-3">{tp("guides.report.next3")}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title={tp("guides.report.urgentTitle")}
        description={tp("guides.report.urgentBody")}
      />
    </div>
  );
}

export default function ReportAbusePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="h-48 animate-pulse rounded-3xl bg-surface-muted" />
        </div>
      }
    >
      <ReportAbusePageContent />
    </Suspense>
  );
}
