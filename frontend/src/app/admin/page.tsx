"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadErrorCard } from "@/components/ui/load-error-card";
import { useAdminHref } from "@/components/admin/admin-shell";
import {
  ConfirmDialog,
  ConfirmRequest,
  Notice,
  PageHeader,
  Panel,
  Pill,
  Spinner,
  StatCard,
  jobStatusTone,
  muted,
  restrictionTone,
  strong,
} from "@/components/admin/console-ui";
import { adminConsole, ConsoleJob, ConsoleJobStatus, ConsoleOverview } from "@/lib/admin-console-api";
import type { AccountRestrictionStatus } from "@/lib/api";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";

const STATUS_ORDER: AccountRestrictionStatus[] = ["ACTIVE", "LIMITED", "SUSPENDED", "BANNED"];
const JOB_ORDER: ConsoleJobStatus[] = ["PUBLISHED", "PENDING_REVIEW", "DRAFT", "CLOSED", "REJECTED", "REMOVED"];

const barColor: Record<string, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
  blue: "bg-info",
  zinc: "bg-line-strong",
  violet: "bg-violet-500",
};

function Breakdown({
  rows,
}: {
  rows: Array<{ label: string; value: number; tone: string }>;
}) {
  const total = rows.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {rows.map((r) => (
          <div key={r.label} className={barColor[r.tone]} style={{ width: `${(r.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-fg-secondary">
              <span className={`h-2 w-2 rounded-full ${barColor[r.tone]}`} aria-hidden />
              {r.label}
            </span>
            <span className={`tabular-nums font-medium ${strong}`}>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplicationsChart({ data, formatDate }: { data: ConsoleOverview["applications"]["perDay"]; formatDate: (d: string) => string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={data.map((d) => `${d.date}: ${d.count}`).join(", ")}>
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="rounded-t-md bg-gradient-to-t from-primary to-success transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-surface-inverse px-1.5 py-0.5 text-[11px] text-fg-inverse group-hover:block">
              {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className={`mt-2 flex justify-between text-[11px] ${muted}`}>
        <span>{formatDate(data[0]?.date ?? "")}</span>
        <span>{formatDate(data[data.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const [overview, setOverview] = useState<ConsoleOverview | null>(null);
  const [pending, setPending] = useState<ConsoleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ov, jobs] = await Promise.all([
        adminConsole.overview(),
        adminConsole.jobs({ status: "PENDING_REVIEW", limit: 5 }),
      ]);
      setOverview(ov);
      setPending(jobs.jobs);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewJob = (job: ConsoleJob, action: "approve" | "reject") =>
    setConfirm({
      title: t("confirm.title", { action: t(`jobAction.${action}`), target: job.title }),
      confirmLabel: t(`jobAction.${action}`),
      danger: action === "reject",
      onConfirm: async ({ reason }) => {
        await adminConsole.jobAction(job.id, { action, reason });
        setNotice(t("action.applied", { action: t(`jobAction.${action}`) }));
        await load();
      },
    });

  if (loading && !overview) return <Spinner />;
  if (loadError || !overview) {
    return <LoadErrorCard error={loadError} subject="admin overview" onRetry={() => void load()} />;
  }

  const roles = overview.users.byRole;
  const queues: Array<{ key: Parameters<typeof t>[0]; value: number | null; href: string; tone: "warning" | "danger" | "info" }> = [
    { key: "overview.pendingJobs", value: overview.queues.pendingJobs, href: "/admin/jobs?status=PENDING_REVIEW", tone: "warning" },
    { key: "overview.openReports", value: overview.queues.openAbuseReports, href: "/admin/trust", tone: "danger" },
    { key: "overview.verificationBacklog", value: overview.queues.verificationBacklog, href: "/admin/trust", tone: "info" },
    { key: "overview.unverifiedEmployers", value: overview.queues.unverifiedEmployers, href: "/admin/companies?verificationLevel=UNVERIFIED", tone: "info" },
    { key: "overview.reviewsPending", value: overview.queues.reviewsPending, href: "/admin/reviews", tone: "warning" },
    { key: "overview.supportTickets", value: overview.queues.supportTicketsOpen, href: "/admin/support", tone: "info" },
  ];

  return (
    <div>
      <PageHeader
        title={t("overview.title")}
        subtitle={t("overview.subtitle")}
        actions={
          <span className={`text-xs ${muted}`}>{t("overview.updated", { time: fmt.dateTime(overview.generatedAt) })}</span>
        }
      />

      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
      {!overview.emailDeliveryConfigured && <Notice tone="info">{t("overview.emailOff")}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("overview.totalUsers")}
          value={fmt.number(overview.users.total)}
          hint={t("overview.newThisWeek", { count: overview.users.newLast7d })}
          tone="brand"
        />
        <StatCard
          label={`${t("overview.candidates")} · ${t("overview.employers")}`}
          value={`${fmt.number(roles.CANDIDATE ?? 0)} · ${fmt.number(roles.EMPLOYER ?? 0)}`}
          hint={`${t("overview.admins")}: ${roles.ADMIN ?? 0}`}
          tone="info"
        />
        <StatCard
          label={t("overview.jobsTotal")}
          value={fmt.number(overview.jobs.total)}
          hint={t("overview.featuredJobs", { count: overview.jobs.featured })}
        />
        <StatCard
          label={t("overview.applications14d")}
          value={fmt.number(overview.applications.last14d)}
          tone="warning"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("overview.applicationsPerDay")}</h2>
          <ApplicationsChart data={overview.applications.perDay} formatDate={(d) => (d ? fmt.date(d) : "")} />
        </Panel>
        <Panel>
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("overview.queues")}</h2>
          <ul className="divide-y divide-[var(--border-soft)]">
            {queues.map((q) => (
              <li key={q.key}>
                <Link href={href(q.href)} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80">
                  <span className="text-fg-secondary">{t(q.key)}</span>
                  {q.value === null ? (
                    <Pill tone="zinc">{t("overview.notConnected")}</Pill>
                  ) : (
                    <Pill tone={q.value === 0 ? "green" : q.tone === "danger" ? "red" : q.tone === "warning" ? "amber" : "blue"}>
                      {q.value}
                    </Pill>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("overview.usersByStatus")}</h2>
          <Breakdown
            rows={STATUS_ORDER.map((s) => ({
              label: t(`status.${s}`),
              value: overview.users.byStatus[s] ?? 0,
              tone: restrictionTone[s] === "red" && s === "BANNED" ? "zinc" : restrictionTone[s],
            }))}
          />
        </Panel>
        <Panel>
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("overview.jobsByStatus")}</h2>
          <Breakdown
            rows={JOB_ORDER.map((s) => ({ label: t(`jobStatus.${s}`), value: overview.jobs.byStatus[s] ?? 0, tone: jobStatusTone[s] }))}
          />
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`text-sm font-semibold ${strong}`}>{t("overview.pendingJobs")}</h2>
          <Link href={href("/admin/jobs?status=PENDING_REVIEW")} className="text-sm font-medium text-primary-text hover:underline">
            {t("nav.jobs")} →
          </Link>
        </div>
        {pending.length === 0 ? (
          <p className={`py-6 text-center text-sm ${muted}`}>{t("common.noResults")}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-soft)]">
            {pending.map((job) => (
              <li key={job.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className={`truncate font-medium ${strong}`}>{job.title}</p>
                  <p className={`text-xs ${muted}`}>
                    {job.employer?.companyName ?? job.sourceName ?? "—"} · {job.location} · {fmt.date(job.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => reviewJob(job, "approve")}>{t("jobAction.approve")}</Button>
                  <Button size="sm" variant="outline" onClick={() => reviewJob(job, "reject")}>{t("jobAction.reject")}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
