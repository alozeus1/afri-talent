"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { adminConsole, ConsoleJob, ConsoleJobStatus, JobAction, Pagination } from "@/lib/admin-console-api";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import { useAdminHref } from "@/components/admin/admin-shell";
import {
  ConfirmDialog,
  ConfirmRequest,
  Notice,
  PageHeader,
  PaginationBar,
  Pill,
  Spinner,
  TableShell,
  Td,
  Th,
  fieldClass,
  jobStatusTone,
  labelClass,
  muted,
  strong,
} from "@/components/admin/console-ui";

const STATUSES: ConsoleJobStatus[] = ["PENDING_REVIEW", "PUBLISHED", "DRAFT", "CLOSED", "REJECTED", "REMOVED"];

type Filters = {
  search: string;
  status: ConsoleJobStatus | "";
  featured: "true" | "false" | "";
  employerId: string;
  page: number;
};

function actionsFor(job: ConsoleJob): JobAction[] {
  switch (job.status) {
    case "PENDING_REVIEW":
      return ["approve", "reject", "remove"];
    case "PUBLISHED":
      return [job.isFeatured ? "unfeature" : "feature", "close", "remove"];
    case "CLOSED":
    case "REJECTED":
    case "REMOVED":
      return ["reopen"];
    case "DRAFT":
    default:
      return ["approve", "remove"];
  }
}

const DANGER: JobAction[] = ["reject", "remove", "close"];

export default function AdminJobsPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [jobs, setJobs] = useState<ConsoleJob[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get("status");
    setFilters({
      search: q.get("search") ?? "",
      status: STATUSES.includes(status as ConsoleJobStatus) ? (status as ConsoleJobStatus) : "",
      featured: "",
      employerId: q.get("employerId") ?? "",
      page: 1,
    });
    setSearchInput(q.get("search") ?? "");
  }, []);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminConsole.jobs({ ...f, limit: 25 });
      setJobs(data.jobs);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (filters) void load(filters);
  }, [filters, load]);

  const update = (patch: Partial<Filters>) => setFilters((f) => (f ? { ...f, page: 1, ...patch } : f));

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ search: searchInput.trim() });
  };

  const act = (job: ConsoleJob, action: JobAction) =>
    setConfirm({
      title: t("confirm.title", { action: t(`jobAction.${action}`), target: job.title }),
      confirmLabel: t(`jobAction.${action}`),
      danger: DANGER.includes(action),
      onConfirm: async ({ reason }) => {
        await adminConsole.jobAction(job.id, { action, reason });
        setNotice(t("action.applied", { action: t(`jobAction.${action}`) }));
        if (filters) await load(filters);
      },
    });

  if (!filters) return <Spinner />;

  return (
    <div>
      <PageHeader title={t("jobs.title")} subtitle={t("jobs.subtitle")} />
      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

      <form onSubmit={onSearch} className="surface-panel mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="jobs-search" className={labelClass}>{t("common.search")}</label>
          <input
            id="jobs-search"
            type="search"
            className={fieldClass}
            placeholder={t("jobs.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => searchInput.trim() !== filters.search && update({ search: searchInput.trim() })}
          />
        </div>
        <div>
          <label htmlFor="jobs-status" className={labelClass}>{t("jobs.filterStatus")}</label>
          <select id="jobs-status" className={fieldClass} value={filters.status} onChange={(e) => update({ status: e.target.value as Filters["status"] })}>
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`jobStatus.${s}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="jobs-featured" className={labelClass}>{t("jobs.filterFeatured")}</label>
          <select id="jobs-featured" className={fieldClass} value={filters.featured} onChange={(e) => update({ featured: e.target.value as Filters["featured"] })}>
            <option value="">{t("common.all")}</option>
            <option value="true">{t("jobs.featuredOnly")}</option>
            <option value="false">{t("jobs.notFeatured")}</option>
          </select>
        </div>
      </form>

      {loading && jobs.length === 0 ? (
        <Spinner />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>{t("jobs.colJob")}</Th>
              <Th>{t("jobs.colStatus")}</Th>
              <Th className="hidden md:table-cell">{t("jobs.colSource")}</Th>
              <Th className="hidden lg:table-cell">{t("jobs.colApplications")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-soft)]">
            {jobs.length === 0 ? (
              <tr><Td colSpan={5} className="py-10 text-center"><span className={muted}>{t("common.noResults")}</span></Td></tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <Td>
                    <Link href={href(`/jobs/${job.slug}`)} className={`font-medium hover:underline ${strong}`} target="_blank">
                      {job.title}
                    </Link>
                    <p className={`text-xs ${muted}`}>
                      {job.employer?.companyName ?? job.sourceName ?? "—"} · {job.location} · {fmt.date(job.createdAt)}
                    </p>
                    {job.moderationReason && <p className="mt-1 text-xs text-warning">{job.moderationReason}</p>}
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Pill tone={jobStatusTone[job.status]}>{t(`jobStatus.${job.status}`)}</Pill>
                      {job.isFeatured && <Pill tone="violet">★ {t("jobs.featured")}</Pill>}
                      {job.isExpired && <Pill tone="zinc">{t("jobs.expired")}</Pill>}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="text-sm">{job.jobSource === "EMPLOYER_POSTED" ? t("jobs.employerPosted") : t("jobs.aggregated")}</span>
                    {job.sourceName && job.jobSource !== "EMPLOYER_POSTED" && <p className={`text-xs ${muted}`}>{job.sourceName}</p>}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <span className="tabular-nums">{job._count.applications}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {actionsFor(job).map((action) => (
                        <Button
                          key={action}
                          size="sm"
                          variant={action === "approve" || action === "reopen" ? "primary" : DANGER.includes(action) ? "outline" : "secondary"}
                          onClick={() => act(job, action)}
                        >
                          {t(`jobAction.${action}`)}
                        </Button>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <PaginationBar pagination={pagination} onPage={(page) => setFilters((f) => (f ? { ...f, page } : f))} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
