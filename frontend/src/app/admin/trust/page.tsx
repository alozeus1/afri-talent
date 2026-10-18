"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import {
  AdminAbuseReport,
  AdminTrustCase,
  AdminTrustCaseAction,
  AdminTrustDashboard,
  AdminVerificationQueueItem,
  adminTrust,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  Field,
  FilterChips,
  Notice,
  PageHeader,
  Pill,
  SkeletonList,
  StatCard,
  fieldClass,
  labelClass,
  linkClass,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

const ACTION_TYPES = ["NOTE", "APPROVE", "REJECT", "HOLD", "LIMIT", "SUSPEND", "REINSTATE", "ESCALATE"] as const;
type ActionType = (typeof ACTION_TYPES)[number];
const CASE_STATUSES = ["OPEN", "IN_REVIEW", "ACTIONED", "DISMISSED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const REPORT_STATUSES = ["TRIAGED", "RESOLVED", "DISMISSED"] as const;

type ArtifactForm = { reasonCode: string; reviewerNotes: string };
type CaseForm = {
  actionType: ActionType;
  reasonCode: string;
  notes: string;
  status: (typeof CASE_STATUSES)[number];
  priority: (typeof PRIORITIES)[number];
};
type ReportForm = { status: (typeof REPORT_STATUSES)[number]; reasonCode: string; notes: string; actionType: "" | ActionType };

type VerificationStatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO";
type SubjectFilter = "ALL" | "EMPLOYER" | "CANDIDATE";
type RiskFilter = "ALL" | "ACTIVE";
type ReportFilter = "ALL" | "ACTIVE" | "OPEN" | "TRIAGED" | "RESOLVED" | "DISMISSED";
type Queue = "verification" | "risk" | "reports";

const DEFAULT_ARTIFACT: ArtifactForm = { reasonCode: "verification_review", reviewerNotes: "" };
const DEFAULT_CASE: CaseForm = { actionType: "NOTE", reasonCode: "trust_review", notes: "", status: "IN_REVIEW", priority: "MEDIUM" };
const DEFAULT_REPORT: ReportForm = { status: "TRIAGED", reasonCode: "report_triaged", notes: "", actionType: "" };

function ActionHistory({ actions, emptyText }: { actions: AdminTrustCaseAction[] | undefined; emptyText: string }) {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  if (!actions?.length) return <p className={`text-sm ${muted}`}>{emptyText}</p>;
  return (
    <ol className="relative space-y-3 border-s border-line ps-4">
      {actions.map((action) => (
        <li key={action.id} className="relative text-sm">
          <span className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue">{label("modAction", action.actionType)}</Pill>
            {action.reasonCode && <code className={`text-xs ${muted}`}>{action.reasonCode}</code>}
          </div>
          <p className="mt-1 text-fg-secondary">{action.notes || t("common.noNotes")}</p>
          <p className={`mt-1 text-xs ${muted}`}>
            {action.actor?.name || t("detail.system")} · {fmt.dateTime(action.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function QueueCard({ header, aside, children }: { header: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <li className="surface-panel space-y-4 rounded-2xl p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">{header}</div>
        {aside && <div className="shrink-0 rounded-xl border border-line bg-surface-sunken px-4 py-2 text-sm">{aside}</div>}
      </div>
      {children}
    </li>
  );
}

export default function AdminTrustPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();

  const [dashboard, setDashboard] = useState<AdminTrustDashboard | null>(null);
  const [verificationQueue, setVerificationQueue] = useState<AdminVerificationQueueItem[]>([]);
  const [riskQueue, setRiskQueue] = useState<AdminTrustCase[]>([]);
  const [reports, setReports] = useState<AdminAbuseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [artifactForms, setArtifactForms] = useState<Record<string, ArtifactForm>>({});
  const [caseForms, setCaseForms] = useState<Record<string, CaseForm>>({});
  const [reportForms, setReportForms] = useState<Record<string, ReportForm>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>("verification");
  const [verificationStatusFilter, setVerificationStatusFilter] = useState<VerificationStatusFilter>("PENDING");
  const [verificationSubjectFilter, setVerificationSubjectFilter] = useState<SubjectFilter>("ALL");
  const [riskStatusFilter, setRiskStatusFilter] = useState<RiskFilter>("ACTIVE");
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportFilter>("ACTIVE");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, verificationData, riskData, reportsData] = await Promise.all([
        adminTrust.dashboard(),
        adminTrust.verificationQueue({ status: verificationStatusFilter, subject: verificationSubjectFilter }),
        adminTrust.riskQueue({ status: riskStatusFilter }),
        adminTrust.reports({ status: reportStatusFilter }),
      ]);
      setDashboard(dashboardData);
      setVerificationQueue(verificationData.queue);
      setRiskQueue(riskData.queue);
      setReports(reportsData.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [verificationStatusFilter, verificationSubjectFilter, riskStatusFilter, reportStatusFilter, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const artifactForm = (id: string) => artifactForms[id] ?? DEFAULT_ARTIFACT;
  const caseForm = (id: string) => caseForms[id] ?? DEFAULT_CASE;
  const reportForm = (id: string) => reportForms[id] ?? DEFAULT_REPORT;
  const patchArtifact = (id: string, p: Partial<ArtifactForm>) => setArtifactForms((c) => ({ ...c, [id]: { ...artifactForm(id), ...p } }));
  const patchCase = (id: string, p: Partial<CaseForm>) => setCaseForms((c) => ({ ...c, [id]: { ...caseForm(id), ...p } }));
  const patchReport = (id: string, p: Partial<ReportForm>) => setReportForms((c) => ({ ...c, [id]: { ...reportForm(id), ...p } }));

  const run = async (id: string, action: () => Promise<unknown>, successText: string) => {
    setBusyId(id);
    setActionError(null);
    setSuccess(null);
    try {
      await action();
      await loadAll();
      setSuccess(successText);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusyId(null);
    }
  };

  const reviewArtifact = (artifactId: string, status: "APPROVED" | "REJECTED" | "NEEDS_MORE_INFO") => {
    const form = artifactForm(artifactId);
    void run(
      artifactId,
      () => adminTrust.reviewArtifact(artifactId, { status, reasonCode: form.reasonCode, reviewerNotes: form.reviewerNotes || undefined }),
      t("trust.artifactReviewed", { id: artifactId.slice(0, 8) }),
    );
  };

  const submitCase = (event: FormEvent, trustCase: AdminTrustCase) => {
    event.preventDefault();
    const form = caseForm(trustCase.id);
    void run(
      trustCase.id,
      () =>
        adminTrust.caseAction(trustCase.id, {
          actionType: form.actionType,
          reasonCode: form.reasonCode,
          notes: form.notes || undefined,
          status: form.status,
          priority: form.priority,
        }),
      t("trust.caseUpdated", { id: trustCase.id.slice(0, 8) }),
    );
  };

  const submitReport = (event: FormEvent, report: AdminAbuseReport) => {
    event.preventDefault();
    const form = reportForm(report.id);
    void run(
      report.id,
      () =>
        adminTrust.reportAction(report.id, {
          status: form.status,
          reasonCode: form.reasonCode,
          notes: form.notes || undefined,
          actionType: form.actionType || undefined,
        }),
      t("trust.reportUpdated", { id: report.id.slice(0, 8) }),
    );
  };

  if (loading && !dashboard) {
    return (
      <div>
        <PageHeader title={t("trust.title")} subtitle={t("trust.subtitle")} />
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div>
        <PageHeader title={t("trust.title")} subtitle={t("trust.subtitle")} />
        <ErrorState message={error} onRetry={() => void loadAll()} />
      </div>
    );
  }

  const queues: Array<{ value: Queue; label: string; count: number }> = [
    { value: "verification", label: t("trust.queueVerification"), count: verificationQueue.length },
    { value: "risk", label: t("trust.queueRisk"), count: riskQueue.length },
    { value: "reports", label: t("trust.queueReports"), count: reports.length },
  ];

  return (
    <div>
      <PageHeader title={t("trust.title")} subtitle={t("trust.subtitle")} />

      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}
      {actionError && <Notice tone="error" onDismiss={() => setActionError(null)}>{actionError}</Notice>}
      {success && <Notice tone="success" onDismiss={() => setSuccess(null)}>{success}</Notice>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t("trust.statArtifacts")} value={fmt.number(dashboard.pendingVerificationArtifacts)} tone="info" />
        <StatCard label={t("trust.statCases")} value={fmt.number(dashboard.openRiskCases)} tone="warning" />
        <StatCard label={t("trust.statReports")} value={fmt.number(dashboard.openReports)} tone="warning" />
        <StatCard label={t("trust.statLimited")} value={fmt.number(dashboard.limitedAccounts)} tone="neutral" />
        <StatCard label={t("trust.statSuspended")} value={fmt.number(dashboard.suspendedAccounts)} tone="danger" />
        <StatCard label={t("trust.statHeldJobs")} value={fmt.number(dashboard.heldJobs)} tone="brand" />
      </div>

      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FilterChips label={t("trust.queueLabel")} options={queues} value={queue} onChange={setQueue} />

        {queue === "verification" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.status")}>
              {(id) => (
                <select id={id} className={fieldClass} value={verificationStatusFilter}
                  onChange={(e) => setVerificationStatusFilter(e.target.value as VerificationStatusFilter)}>
                  {(["PENDING", "ALL", "APPROVED", "REJECTED", "NEEDS_MORE_INFO"] as const).map((s) => (
                    <option key={s} value={s}>{s === "ALL" ? t("common.all") : label("artifactStatus", s)}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("trust.subject")}>
              {(id) => (
                <select id={id} className={fieldClass} value={verificationSubjectFilter}
                  onChange={(e) => setVerificationSubjectFilter(e.target.value as SubjectFilter)}>
                  <option value="ALL">{t("common.all")}</option>
                  <option value="EMPLOYER">{t("role.EMPLOYER")}</option>
                  <option value="CANDIDATE">{t("role.CANDIDATE")}</option>
                </select>
              )}
            </Field>
          </div>
        )}
        {queue === "risk" && (
          <Field label={t("trust.scope")}>
            {(id) => (
              <select id={id} className={fieldClass} value={riskStatusFilter} onChange={(e) => setRiskStatusFilter(e.target.value as RiskFilter)}>
                <option value="ACTIVE">{t("trust.scopeActive")}</option>
                <option value="ALL">{t("common.all")}</option>
              </select>
            )}
          </Field>
        )}
        {queue === "reports" && (
          <Field label={t("trust.scope")}>
            {(id) => (
              <select id={id} className={fieldClass} value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value as ReportFilter)}>
                <option value="ACTIVE">{t("trust.scopeActive")}</option>
                <option value="ALL">{t("common.all")}</option>
                {(["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"] as const).map((s) => (
                  <option key={s} value={s}>{label("reportStatus", s)}</option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>

      <p className={`mb-4 text-sm ${muted}`}>{t(`trust.help.${queue}`)}</p>

      {loading ? (
        <SkeletonList rows={3} />
      ) : queue === "verification" ? (
        verificationQueue.length === 0 ? (
          <EmptyState title={t("trust.emptyVerification")} />
        ) : (
          <ul className="space-y-4">
            {verificationQueue.map((artifact) => {
              const form = artifactForm(artifact.id);
              const busy = busyId === artifact.id;
              return (
                <QueueCard
                  key={artifact.id}
                  header={
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-base font-semibold ${strong}`}>{label("artifactType", artifact.type)}</h2>
                        <Pill tone={statusTone(artifact.status)}>{label("artifactStatus", artifact.status)}</Pill>
                      </div>
                      <p className={`mt-1 text-sm ${muted}`}>
                        {t("trust.submitted", {
                          subject: artifact.employer?.companyName || artifact.user?.name || t("common.unknown"),
                          date: fmt.date(artifact.submittedAt),
                        })}
                      </p>
                      {artifact.fileName && <p className={`mt-1 text-sm ${muted}`}>{t("trust.file", { name: artifact.fileName })}</p>}
                      {artifact.externalUrl && (
                        <a href={artifact.externalUrl} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-block text-sm ${linkClass}`}>
                          {t("trust.openUrl")}
                        </a>
                      )}
                    </>
                  }
                  aside={
                    <>
                      <p className={labelClass}>{t("trust.reviewer")}</p>
                      <p className={strong}>{artifact.reviewer?.name || t("common.unassigned")}</p>
                    </>
                  }
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-3">
                      <Field label={t("common.reasonCode")}>
                        {(id) => <input id={id} className={`${fieldClass} font-mono`} value={form.reasonCode} onChange={(e) => patchArtifact(artifact.id, { reasonCode: e.target.value })} />}
                      </Field>
                      <Field label={t("trust.reviewerNotes")}>
                        {(id) => <textarea id={id} rows={3} className={fieldClass} value={form.reviewerNotes} onChange={(e) => patchArtifact(artifact.id, { reviewerNotes: e.target.value })} />}
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" isLoading={busy} onClick={() => reviewArtifact(artifact.id, "APPROVED")}>{t("common.approve")}</Button>
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => reviewArtifact(artifact.id, "NEEDS_MORE_INFO")}>{t("trust.needMoreInfo")}</Button>
                        <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => reviewArtifact(artifact.id, "REJECTED")}>{t("common.reject")}</Button>
                      </div>
                    </div>
                    <div>
                      <p className={labelClass}>{t("common.actionHistory")}</p>
                      <ActionHistory actions={artifact.trustCase?.actions} emptyText={t("common.noActions")} />
                    </div>
                  </div>
                </QueueCard>
              );
            })}
          </ul>
        )
      ) : queue === "risk" ? (
        riskQueue.length === 0 ? (
          <EmptyState title={t("trust.emptyRisk")} />
        ) : (
          <ul className="space-y-4">
            {riskQueue.map((trustCase) => {
              const form = caseForm(trustCase.id);
              const subject =
                trustCase.job?.title ||
                trustCase.employerTrustProfile?.employer.companyName ||
                trustCase.candidateTrustProfile?.user.name ||
                (trustCase.report?.reason ? label("reportReason", trustCase.report.reason) : null) ||
                trustCase.title;
              return (
                <QueueCard
                  key={trustCase.id}
                  header={
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-base font-semibold ${strong}`}>{trustCase.title}</h2>
                        <Pill tone={statusTone(trustCase.priority)}>{label("risk", trustCase.priority)}</Pill>
                        <Pill tone={statusTone(trustCase.status)}>{label("caseStatus", trustCase.status)}</Pill>
                      </div>
                      <p className={`mt-1 text-sm ${muted}`}>{label("entityType", trustCase.entityType)} · {subject}</p>
                      {trustCase.summary && <p className="mt-2 text-sm text-fg-secondary">{trustCase.summary}</p>}
                    </>
                  }
                  aside={
                    <>
                      <p className={labelClass}>{t("trust.assignedAdmin")}</p>
                      <p className={strong}>{trustCase.assignedAdmin?.name || t("common.unassigned")}</p>
                    </>
                  }
                >
                  <form onSubmit={(e) => submitCase(e, trustCase)} className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("trust.action")}>
                        {(id) => (
                          <select id={id} className={fieldClass} value={form.actionType} onChange={(e) => patchCase(trustCase.id, { actionType: e.target.value as ActionType })}>
                            {ACTION_TYPES.map((a) => <option key={a} value={a}>{label("modAction", a)}</option>)}
                          </select>
                        )}
                      </Field>
                      <Field label={t("trust.caseStatus")}>
                        {(id) => (
                          <select id={id} className={fieldClass} value={form.status} onChange={(e) => patchCase(trustCase.id, { status: e.target.value as CaseForm["status"] })}>
                            {CASE_STATUSES.map((s) => <option key={s} value={s}>{label("caseStatus", s)}</option>)}
                          </select>
                        )}
                      </Field>
                      <Field label={t("common.priority")}>
                        {(id) => (
                          <select id={id} className={fieldClass} value={form.priority} onChange={(e) => patchCase(trustCase.id, { priority: e.target.value as CaseForm["priority"] })}>
                            {PRIORITIES.map((p) => <option key={p} value={p}>{label("risk", p)}</option>)}
                          </select>
                        )}
                      </Field>
                      <Field label={t("common.reasonCode")}>
                        {(id) => <input id={id} className={`${fieldClass} font-mono`} value={form.reasonCode} onChange={(e) => patchCase(trustCase.id, { reasonCode: e.target.value })} />}
                      </Field>
                      <Field label={t("trust.internalNotes")} className="sm:col-span-2">
                        {(id) => <textarea id={id} rows={3} className={fieldClass} value={form.notes} onChange={(e) => patchCase(trustCase.id, { notes: e.target.value })} />}
                      </Field>
                      <div className="sm:col-span-2">
                        <Button type="submit" isLoading={busyId === trustCase.id}>{t("trust.applyAction")}</Button>
                      </div>
                    </div>
                    <div>
                      <p className={labelClass}>{t("common.actionHistory")}</p>
                      <ActionHistory actions={trustCase.actions} emptyText={t("common.noActions")} />
                    </div>
                  </form>
                </QueueCard>
              );
            })}
          </ul>
        )
      ) : reports.length === 0 ? (
        <EmptyState title={t("trust.emptyReports")} />
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => {
            const form = reportForm(report.id);
            return (
              <QueueCard
                key={report.id}
                header={
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`text-base font-semibold ${strong}`}>{label("reportReason", report.reason)}</h2>
                      <Pill tone={statusTone(report.status)}>{label("reportStatus", report.status)}</Pill>
                    </div>
                    <p className={`mt-1 text-sm ${muted}`}>
                      {t("trust.reportParties", {
                        reporter: report.reporter.name,
                        reported: report.reportedUser?.name || report.employer?.companyName || t("common.unknown"),
                      })}
                    </p>
                    {report.details && <p className="mt-2 text-sm text-fg-secondary">{report.details}</p>}
                  </>
                }
                aside={
                  <>
                    <p className={labelClass}>{t("trust.assignedAdmin")}</p>
                    <p className={strong}>{report.assignedAdmin?.name || t("common.unassigned")}</p>
                  </>
                }
              >
                <form onSubmit={(e) => submitReport(e, report)} className="grid gap-5 lg:grid-cols-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("trust.reportStatus")}>
                      {(id) => (
                        <select id={id} className={fieldClass} value={form.status} onChange={(e) => patchReport(report.id, { status: e.target.value as ReportForm["status"] })}>
                          {REPORT_STATUSES.map((s) => <option key={s} value={s}>{label("reportStatus", s)}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label={t("trust.linkedAction")}>
                      {(id) => (
                        <select id={id} className={fieldClass} value={form.actionType} onChange={(e) => patchReport(report.id, { actionType: e.target.value as ReportForm["actionType"] })}>
                          <option value="">{t("trust.noLinkedAction")}</option>
                          {ACTION_TYPES.map((a) => <option key={a} value={a}>{label("modAction", a)}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label={t("common.reasonCode")} className="sm:col-span-2">
                      {(id) => <input id={id} className={`${fieldClass} font-mono`} value={form.reasonCode} onChange={(e) => patchReport(report.id, { reasonCode: e.target.value })} />}
                    </Field>
                    <Field label={t("trust.resolutionNotes")} className="sm:col-span-2">
                      {(id) => <textarea id={id} rows={3} className={fieldClass} value={form.notes} onChange={(e) => patchReport(report.id, { notes: e.target.value })} />}
                    </Field>
                    <div className="sm:col-span-2">
                      <Button type="submit" isLoading={busyId === report.id}>{t("trust.updateReport")}</Button>
                    </div>
                  </div>
                  <div>
                    <p className={labelClass}>{t("trust.caseHistory")}</p>
                    <ActionHistory actions={report.trustCase?.actions} emptyText={t("trust.noCaseHistory")} />
                  </div>
                </form>
              </QueueCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
