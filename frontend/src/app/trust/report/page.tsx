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
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

const reportReasons: AbuseReportInput["reason"][] = [
  "SCAM",
  "FAKE_JOB",
  "IMPERSONATION",
  "SPAM",
  "OFF_PLATFORM_CONTACT",
  "ADVANCE_FEE_REQUEST",
  "HARASSMENT",
  "FAKE_PROFILE",
  "MISLEADING_SALARY",
  "OTHER",
];

function ReportAbusePageContent() {
  const locale = useLocale();
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
        { label: "Reported user", value: reportedUserId },
        { label: "Employer", value: employerId },
        { label: "Job", value: targetJobId },
        { label: "Application", value: targetApplicationId },
        { label: "Conversation", value: targetThreadId },
      ].filter((target) => Boolean(target.value)),
    [employerId, reportedUserId, targetApplicationId, targetJobId, targetThreadId],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) {
      setError("You need to sign in before submitting a trust or abuse report.");
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
          : "Failed to submit your report.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-amber-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700 mb-3">
          Safety Report
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Report scams, impersonation, or suspicious behavior</h1>
        <p className="max-w-3xl text-lg text-gray-600">
          AfriTalent uses reports to trigger risk scoring, moderation review, and account holds when needed. Give us enough detail to investigate quickly.
        </p>
      </section>

      {!user && (
        <TrustStatusBanner
          tone="warning"
          title="Sign in to file a report"
          body="We require authentication so moderators can follow up, connect your report to platform activity, and reduce abuse of the reporting system."
          actions={
            <Link href={localizePath("/login?redirect=/trust/report", locale)}>
              <Button className="bg-amber-700 hover:bg-amber-800">Sign in</Button>
            </Link>
          }
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Submit a report</h2>
            <p className="text-sm text-gray-600">
              Use one clear reason code. Include links, payment requests, off-platform contact requests, or identity concerns in the details.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <TrustStatusBanner
                  tone="danger"
                  title="We couldn't submit this report"
                  body={error}
                />
              )}

              {success && (
                <TrustStatusBanner
                  tone="success"
                  title="Report submitted"
                  body={`${success.message} Report ID: ${success.reportId}. Case ID: ${success.caseId}.`}
                />
              )}

              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <select
                  id="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value as AbuseReportInput["reason"])}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {reportReasons.map((value) => (
                    <option key={value} value={value}>
                      {humanizeTrustValue(value)}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Reported user ID"
                value={reportedUserId}
                onChange={(event) => setReportedUserId(event.target.value)}
                placeholder="Optional if you are reporting a profile"
              />
              <Input
                label="Employer ID"
                value={employerId}
                onChange={(event) => setEmployerId(event.target.value)}
                placeholder="Optional if you are reporting a company account"
              />
              <Input
                label="Job ID"
                value={targetJobId}
                onChange={(event) => setTargetJobId(event.target.value)}
                placeholder="Optional if you are reporting a job"
              />
              <Input
                label="Application ID"
                value={targetApplicationId}
                onChange={(event) => setTargetApplicationId(event.target.value)}
                placeholder="Optional if you are reporting an application"
              />
              <Input
                label="Conversation ID"
                value={targetThreadId}
                onChange={(event) => setTargetThreadId(event.target.value)}
                placeholder="Optional if you are reporting a message thread"
              />

              <div>
                <label htmlFor="details" className="block text-sm font-medium text-gray-700 mb-1">
                  What happened?
                </label>
                <textarea
                  id="details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={8}
                  placeholder="Describe the suspicious behavior, payment request, impersonation claim, or scam pattern you saw."
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Submitting report..." : "Submit report"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Current targets</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTargets.length ? (
                activeTargets.map((target) => (
                  <div key={`${target.label}-${target.value}`} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      {target.label}
                    </p>
                    <p className="mt-2 break-all text-sm font-medium text-gray-900">{target.value}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-600">
                  No target IDs were prefilled. You can still submit a report if you provide at least one identifier above.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">What happens next</h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600">
              <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                Moderators use your report together with account behavior, verification evidence, and other trust signals before taking action.
              </p>
              <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                Screenshots are useful, but IDs, links, timestamps, and the exact off-platform request usually help moderators act faster.
              </p>
              <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                We use reports as one signal among many. A badge is never removed or granted based on a single self-assertion alone.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <TrustSupportCard
        reportHref={localizePath("/trust/report", locale)}
        title="Need urgent help instead?"
        description="If you are unsure which reason code to choose or something feels actively unsafe, contact support and include the links, IDs, or payment request involved."
      />
    </div>
  );
}

export default function ReportAbusePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
        </div>
      }
    >
      <ReportAbusePageContent />
    </Suspense>
  );
}
