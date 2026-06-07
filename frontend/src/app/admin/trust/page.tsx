"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  AdminAbuseReport,
  AdminTrustCase,
  AdminTrustDashboard,
  AdminVerificationQueueItem,
  adminTrust,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/trust/trust-badge";
import { humanizeTrustValue } from "@/lib/trust-labels";
import { localizePath, useLocale } from "@/lib/i18n/client";

type ArtifactFormState = Record<
  string,
  {
    reasonCode: string;
    reviewerNotes: string;
  }
>;

type CaseFormState = Record<
  string,
  {
    actionType: "NOTE" | "APPROVE" | "REJECT" | "HOLD" | "LIMIT" | "SUSPEND" | "REINSTATE" | "ESCALATE";
    reasonCode: string;
    notes: string;
    status: "OPEN" | "IN_REVIEW" | "ACTIONED" | "DISMISSED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }
>;

type ReportFormState = Record<
  string,
  {
    status: "TRIAGED" | "RESOLVED" | "DISMISSED";
    reasonCode: string;
    notes: string;
    actionType: "" | "NOTE" | "APPROVE" | "REJECT" | "HOLD" | "LIMIT" | "SUSPEND" | "REINSTATE" | "ESCALATE";
  }
>;

export default function AdminTrustPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [dashboard, setDashboard] = useState<AdminTrustDashboard | null>(null);
  const [verificationQueue, setVerificationQueue] = useState<AdminVerificationQueueItem[]>([]);
  const [riskQueue, setRiskQueue] = useState<AdminTrustCase[]>([]);
  const [reports, setReports] = useState<AdminAbuseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [artifactForms, setArtifactForms] = useState<ArtifactFormState>({});
  const [caseForms, setCaseForms] = useState<CaseFormState>({});
  const [reportForms, setReportForms] = useState<ReportFormState>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [verificationStatusFilter, setVerificationStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO">("PENDING");
  const [verificationSubjectFilter, setVerificationSubjectFilter] = useState<"ALL" | "EMPLOYER" | "CANDIDATE">("ALL");
  const [riskStatusFilter, setRiskStatusFilter] = useState<"ALL" | "ACTIVE">("ACTIVE");
  const [reportStatusFilter, setReportStatusFilter] = useState<"ALL" | "ACTIVE" | "OPEN" | "TRIAGED" | "RESOLVED" | "DISMISSED">("ACTIVE");

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push(localizePath("/login", locale));
    }
  }, [isLoading, locale, router, user]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, verificationStatusFilter, verificationSubjectFilter, riskStatusFilter, reportStatusFilter]);

  const actionHistoryPreview = useMemo(
    () => riskQueue.slice(0, 3).reduce((count, current) => count + current.actions.length, 0),
    [riskQueue],
  );

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, verificationData, riskData, reportsData] = await Promise.all([
        adminTrust.dashboard(),
        adminTrust.verificationQueue({
          status: verificationStatusFilter,
          subject: verificationSubjectFilter,
        }),
        adminTrust.riskQueue({ status: riskStatusFilter }),
        adminTrust.reports({ status: reportStatusFilter }),
      ]);
      setDashboard(dashboardData);
      setVerificationQueue(verificationData.queue);
      setRiskQueue(riskData.queue);
      setReports(reportsData.reports);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load trust operations data.");
    } finally {
      setLoading(false);
    }
  };

  const getArtifactForm = (artifactId: string) =>
    artifactForms[artifactId] || {
      reasonCode: "verification_review",
      reviewerNotes: "",
    };

  const getCaseForm = (caseId: string) =>
    caseForms[caseId] || {
      actionType: "NOTE",
      reasonCode: "trust_review",
      notes: "",
      status: "IN_REVIEW",
      priority: "MEDIUM",
    };

  const getReportForm = (reportId: string) =>
    reportForms[reportId] || {
      status: "TRIAGED",
      reasonCode: "report_triaged",
      notes: "",
      actionType: "",
    };

  const updateArtifactForm = (artifactId: string, updates: Partial<ArtifactFormState[string]>) => {
    setArtifactForms((current) => ({
      ...current,
      [artifactId]: {
        ...getArtifactForm(artifactId),
        ...updates,
      },
    }));
  };

  const updateCaseForm = (caseId: string, updates: Partial<CaseFormState[string]>) => {
    setCaseForms((current) => ({
      ...current,
      [caseId]: {
        ...getCaseForm(caseId),
        ...updates,
      },
    }));
  };

  const updateReportForm = (reportId: string, updates: Partial<ReportFormState[string]>) => {
    setReportForms((current) => ({
      ...current,
      [reportId]: {
        ...getReportForm(reportId),
        ...updates,
      },
    }));
  };

  const handleArtifactAction = async (
    artifactId: string,
    status: "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO",
  ) => {
    const form = getArtifactForm(artifactId);
    setBusyId(artifactId);
    setError(null);
    setSuccess(null);

    try {
      await adminTrust.reviewArtifact(artifactId, {
        status,
        reasonCode: form.reasonCode,
        reviewerNotes: form.reviewerNotes || undefined,
      });
      await loadAll();
      setSuccess(`Artifact ${artifactId.slice(0, 8)} reviewed.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to review verification artifact.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCaseAction = async (event: FormEvent, trustCase: AdminTrustCase) => {
    event.preventDefault();
    const form = getCaseForm(trustCase.id);
    setBusyId(trustCase.id);
    setError(null);
    setSuccess(null);

    try {
      await adminTrust.caseAction(trustCase.id, {
        actionType: form.actionType,
        reasonCode: form.reasonCode,
        notes: form.notes || undefined,
        status: form.status,
        priority: form.priority,
      });
      await loadAll();
      setSuccess(`Trust case ${trustCase.id.slice(0, 8)} updated.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update trust case.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReportAction = async (event: FormEvent, report: AdminAbuseReport) => {
    event.preventDefault();
    const form = getReportForm(report.id);
    setBusyId(report.id);
    setError(null);
    setSuccess(null);

    try {
      await adminTrust.reportAction(report.id, {
        status: form.status,
        reasonCode: form.reasonCode,
        notes: form.notes || undefined,
        actionType: form.actionType || undefined,
      });
      await loadAll();
      setSuccess(`Report ${report.id.slice(0, 8)} updated.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update report.");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">We couldn&apos;t load trust operations</p>
          <p className="mt-1">{error ?? "Try again in a moment."}</p>
          <Button size="sm" className="mt-4" onClick={loadAll}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-red-50 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 mb-3">
          Admin Trust Operations
        </p>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Verification, fraud risk, and abuse moderation</h1>
        <p className="max-w-3xl text-lg text-gray-600">
          Review identity evidence, manage scam and impersonation cases, and keep a complete action history with reason codes for every moderation decision.
        </p>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pending artifacts</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{dashboard.pendingVerificationArtifacts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Open cases</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{dashboard.openRiskCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Open reports</p>
            <p className="mt-3 text-3xl font-bold text-gray-900">{dashboard.openReports}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Limited accounts</p>
            <p className="mt-3 text-3xl font-bold text-amber-700">{dashboard.limitedAccounts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Suspended accounts</p>
            <p className="mt-3 text-3xl font-bold text-red-700">{dashboard.suspendedAccounts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Held jobs</p>
            <p className="mt-3 text-3xl font-bold text-blue-700">{dashboard.heldJobs}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Trust operations summary</h2>
            <p className="text-sm text-gray-600 mt-1">
              {verificationQueue.length} artifact review item(s), {riskQueue.length} risk case(s), {reports.length} abuse report(s), and {actionHistoryPreview} recent action log entries in view.
            </p>
          </div>
          <Link href={localizePath("/admin", locale)}>
            <Button variant="outline">Back to admin dashboard</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Verification review queue</h2>
                <p className="text-sm text-gray-600">Review employer and candidate evidence before granting badges or trust upgrades.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="verificationStatusFilter" className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                    Status
                  </label>
                  <select
                    id="verificationStatusFilter"
                    value={verificationStatusFilter}
                    onChange={(event) => setVerificationStatusFilter(event.target.value as typeof verificationStatusFilter)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                  >
                    {["PENDING", "ALL", "APPROVED", "REJECTED", "NEEDS_MORE_INFO"].map((status) => (
                      <option key={status} value={status}>{humanizeTrustValue(status)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="verificationSubjectFilter" className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                    Subject
                  </label>
                  <select
                    id="verificationSubjectFilter"
                    value={verificationSubjectFilter}
                    onChange={(event) => setVerificationSubjectFilter(event.target.value as typeof verificationSubjectFilter)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                  >
                    {["ALL", "EMPLOYER", "CANDIDATE"].map((subject) => (
                      <option key={subject} value={subject}>{humanizeTrustValue(subject)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {verificationQueue.length === 0 ? (
              <p className="text-sm text-gray-600">No verification items match the current filters.</p>
            ) : (
              verificationQueue.map((artifact) => {
                const form = getArtifactForm(artifact.id);
                return (
                  <div key={artifact.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">{humanizeTrustValue(artifact.type)}</p>
                          <TrustBadge label={humanizeTrustValue(artifact.status)} variant={artifact.status === "APPROVED" ? "success" : artifact.status === "REJECTED" ? "danger" : "warning"} />
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {artifact.employer?.companyName || artifact.user?.name || "Unknown subject"} • submitted {new Date(artifact.submittedAt).toLocaleDateString()}
                        </p>
                        {artifact.fileName && (
                          <p className="mt-2 text-sm text-gray-500">File: {artifact.fileName}</p>
                        )}
                        {artifact.externalUrl && (
                          <a href={artifact.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-sm text-emerald-700 hover:text-emerald-800">
                            Open supporting URL
                          </a>
                        )}
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-gray-600">
                        <p className="font-semibold text-gray-900">Current reviewer</p>
                        <p className="mt-1">{artifact.reviewer?.name || "Unassigned"}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-3">
                        <Input
                          label="Reason code"
                          value={form.reasonCode}
                          onChange={(event) => updateArtifactForm(artifact.id, { reasonCode: event.target.value })}
                        />
                        <div>
                          <label htmlFor={`artifact-notes-${artifact.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Reviewer notes
                          </label>
                          <textarea
                            id={`artifact-notes-${artifact.id}`}
                            value={form.reviewerNotes}
                            onChange={(event) => updateArtifactForm(artifact.id, { reviewerNotes: event.target.value })}
                            rows={4}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" disabled={busyId === artifact.id} onClick={() => handleArtifactAction(artifact.id, "APPROVED")}>
                            Approve
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busyId === artifact.id} onClick={() => handleArtifactAction(artifact.id, "NEEDS_MORE_INFO")}>
                            Need more info
                          </Button>
                          <Button type="button" size="sm" variant="danger" disabled={busyId === artifact.id} onClick={() => handleArtifactAction(artifact.id, "REJECTED")}>
                            Reject
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Action history</p>
                        {artifact.trustCase?.actions.length ? (
                          artifact.trustCase.actions.map((action) => (
                            <div key={action.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <TrustBadge label={humanizeTrustValue(action.actionType)} variant="info" />
                                {action.reasonCode && (
                                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{action.reasonCode}</span>
                                )}
                              </div>
                              <p className="mt-2">{action.notes || "No notes provided."}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                {action.actor?.name || "System"} • {new Date(action.createdAt).toLocaleString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No actions recorded yet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Fraud and risk queue</h2>
                <p className="text-sm text-gray-600">Escalate, hold, limit, suspend, or reinstate accounts with full action history.</p>
              </div>
              <div>
                <label htmlFor="riskStatusFilter" className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                  Queue scope
                </label>
                <select
                  id="riskStatusFilter"
                  value={riskStatusFilter}
                  onChange={(event) => setRiskStatusFilter(event.target.value as typeof riskStatusFilter)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                >
                  {["ACTIVE", "ALL"].map((status) => (
                    <option key={status} value={status}>{humanizeTrustValue(status)}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {riskQueue.length === 0 ? (
              <p className="text-sm text-gray-600">No trust cases match the current filter.</p>
            ) : (
              riskQueue.map((trustCase) => {
                const form = getCaseForm(trustCase.id);
                const subject =
                  trustCase.job?.title ||
                  trustCase.employerTrustProfile?.employer.companyName ||
                  trustCase.candidateTrustProfile?.user.name ||
                  trustCase.report?.reason ||
                  trustCase.title;

                return (
                  <div key={trustCase.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">{trustCase.title}</p>
                          <TrustBadge label={trustCase.priority} riskLevel={trustCase.priority} />
                          <TrustBadge label={humanizeTrustValue(trustCase.status)} variant={trustCase.status === "DISMISSED" ? "default" : trustCase.status === "ACTIONED" ? "success" : "warning"} />
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {humanizeTrustValue(trustCase.entityType)} • {subject}
                        </p>
                        {trustCase.summary && (
                          <p className="mt-3 text-sm text-gray-500">{trustCase.summary}</p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-gray-600">
                        <p className="font-semibold text-gray-900">Assigned admin</p>
                        <p className="mt-1">{trustCase.assignedAdmin?.name || "Unassigned"}</p>
                      </div>
                    </div>

                    <form onSubmit={(event) => handleCaseAction(event, trustCase)} className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`case-action-${trustCase.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Action
                          </label>
                          <select
                            id={`case-action-${trustCase.id}`}
                            value={form.actionType}
                            onChange={(event) => updateCaseForm(trustCase.id, { actionType: event.target.value as CaseFormState[string]["actionType"] })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                          >
                            {["NOTE", "APPROVE", "REJECT", "HOLD", "LIMIT", "SUSPEND", "REINSTATE", "ESCALATE"].map((actionType) => (
                              <option key={actionType} value={actionType}>{humanizeTrustValue(actionType)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`case-status-${trustCase.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Case status
                          </label>
                          <select
                            id={`case-status-${trustCase.id}`}
                            value={form.status}
                            onChange={(event) => updateCaseForm(trustCase.id, { status: event.target.value as CaseFormState[string]["status"] })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                          >
                            {["OPEN", "IN_REVIEW", "ACTIONED", "DISMISSED"].map((status) => (
                              <option key={status} value={status}>{humanizeTrustValue(status)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`case-priority-${trustCase.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Priority
                          </label>
                          <select
                            id={`case-priority-${trustCase.id}`}
                            value={form.priority}
                            onChange={(event) => updateCaseForm(trustCase.id, { priority: event.target.value as CaseFormState[string]["priority"] })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                          >
                            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => (
                              <option key={priority} value={priority}>{humanizeTrustValue(priority)}</option>
                            ))}
                          </select>
                        </div>
                        <Input
                          label="Reason code"
                          value={form.reasonCode}
                          onChange={(event) => updateCaseForm(trustCase.id, { reasonCode: event.target.value })}
                        />
                        <div className="sm:col-span-2">
                          <label htmlFor={`case-notes-${trustCase.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Internal notes
                          </label>
                          <textarea
                            id={`case-notes-${trustCase.id}`}
                            value={form.notes}
                            onChange={(event) => updateCaseForm(trustCase.id, { notes: event.target.value })}
                            rows={4}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Button type="submit" disabled={busyId === trustCase.id}>
                            {busyId === trustCase.id ? "Applying..." : "Apply moderation action"}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Action history</p>
                        {trustCase.actions.length ? (
                          trustCase.actions.map((action) => (
                            <div key={action.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <TrustBadge label={humanizeTrustValue(action.actionType)} variant="info" />
                                {action.reasonCode && (
                                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{action.reasonCode}</span>
                                )}
                              </div>
                              <p className="mt-2">{action.notes || "No notes provided."}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                {action.actor?.name || "System"} • {new Date(action.createdAt).toLocaleString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No moderation actions recorded yet.</p>
                        )}
                      </div>
                    </form>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Abuse reports queue</h2>
                <p className="text-sm text-gray-600">Triage user reports and link them to moderation actions when needed.</p>
              </div>
              <div>
                <label htmlFor="reportStatusFilter" className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 mb-1">
                  Report scope
                </label>
                <select
                  id="reportStatusFilter"
                  value={reportStatusFilter}
                  onChange={(event) => setReportStatusFilter(event.target.value as typeof reportStatusFilter)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                >
                  {["ACTIVE", "ALL", "OPEN", "TRIAGED", "RESOLVED", "DISMISSED"].map((status) => (
                    <option key={status} value={status}>{humanizeTrustValue(status)}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {reports.length === 0 ? (
              <p className="text-sm text-gray-600">No abuse reports match the current filter.</p>
            ) : (
              reports.map((report) => {
                const form = getReportForm(report.id);
                return (
                  <div key={report.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">{humanizeTrustValue(report.reason)}</p>
                          <TrustBadge label={humanizeTrustValue(report.status)} variant={report.status === "RESOLVED" ? "success" : report.status === "DISMISSED" ? "default" : "warning"} />
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          Reporter: {report.reporter.name} • Reported user: {report.reportedUser?.name || report.employer?.companyName || "Unknown"}
                        </p>
                        {report.details && (
                          <p className="mt-3 text-sm text-gray-500">{report.details}</p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-gray-600">
                        <p className="font-semibold text-gray-900">Assigned admin</p>
                        <p className="mt-1">{report.assignedAdmin?.name || "Unassigned"}</p>
                      </div>
                    </div>

                    <form onSubmit={(event) => handleReportAction(event, report)} className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`report-status-${report.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Report status
                          </label>
                          <select
                            id={`report-status-${report.id}`}
                            value={form.status}
                            onChange={(event) => updateReportForm(report.id, { status: event.target.value as ReportFormState[string]["status"] })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                          >
                            {["TRIAGED", "RESOLVED", "DISMISSED"].map((status) => (
                              <option key={status} value={status}>{humanizeTrustValue(status)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`report-action-${report.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Linked moderation action
                          </label>
                          <select
                            id={`report-action-${report.id}`}
                            value={form.actionType}
                            onChange={(event) => updateReportForm(report.id, { actionType: event.target.value as ReportFormState[string]["actionType"] })}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm"
                          >
                            <option value="">No linked action</option>
                            {["NOTE", "APPROVE", "REJECT", "HOLD", "LIMIT", "SUSPEND", "REINSTATE", "ESCALATE"].map((actionType) => (
                              <option key={actionType} value={actionType}>{humanizeTrustValue(actionType)}</option>
                            ))}
                          </select>
                        </div>
                        <Input
                          label="Reason code"
                          value={form.reasonCode}
                          onChange={(event) => updateReportForm(report.id, { reasonCode: event.target.value })}
                        />
                        <div className="sm:col-span-2">
                          <label htmlFor={`report-notes-${report.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                            Resolution notes
                          </label>
                          <textarea
                            id={`report-notes-${report.id}`}
                            value={form.notes}
                            onChange={(event) => updateReportForm(report.id, { notes: event.target.value })}
                            rows={4}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Button type="submit" disabled={busyId === report.id}>
                            {busyId === report.id ? "Saving..." : "Update report"}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-900">Connected case history</p>
                        {report.trustCase?.actions.length ? (
                          report.trustCase.actions.map((action) => (
                            <div key={action.id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                              <div className="flex flex-wrap items-center gap-2">
                                <TrustBadge label={humanizeTrustValue(action.actionType)} variant="info" />
                                {action.reasonCode && (
                                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{action.reasonCode}</span>
                                )}
                              </div>
                              <p className="mt-2">{action.notes || "No notes provided."}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                {action.actor?.name || "System"} • {new Date(action.createdAt).toLocaleString()}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No linked case history yet.</p>
                        )}
                      </div>
                    </form>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
