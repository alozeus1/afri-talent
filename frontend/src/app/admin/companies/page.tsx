"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { AccountRestrictionStatus } from "@/lib/api";
import { adminConsole, ConsoleCompany, EmployerVerificationLevel, Pagination } from "@/lib/admin-console-api";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import { useAdminHref } from "@/components/admin/admin-shell";
import { UserDetailDrawer } from "@/components/admin/user-detail-drawer";
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
  labelClass,
  muted,
  restrictionTone,
  strong,
  verificationTone,
} from "@/components/admin/console-ui";

const LEVELS: EmployerVerificationLevel[] = [
  "UNVERIFIED",
  "EMAIL_DOMAIN_VERIFIED",
  "BUSINESS_DOC_VERIFIED",
  "MANUAL_REVIEW_APPROVED",
  "PREMIUM_TRUSTED",
];
const STATUSES: AccountRestrictionStatus[] = ["ACTIVE", "LIMITED", "SUSPENDED", "BANNED"];

type Filters = {
  search: string;
  verificationLevel: EmployerVerificationLevel | "";
  status: AccountRestrictionStatus | "";
  page: number;
};

export default function AdminCompaniesPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const { user: me } = useAuth();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [companies, setCompanies] = useState<ConsoleCompany[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [levelDraft, setLevelDraft] = useState<Record<string, EmployerVerificationLevel>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const level = q.get("verificationLevel");
    setFilters({
      search: q.get("search") ?? "",
      verificationLevel: LEVELS.includes(level as EmployerVerificationLevel) ? (level as EmployerVerificationLevel) : "",
      status: "",
      page: 1,
    });
    setSearchInput(q.get("search") ?? "");
  }, []);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminConsole.companies({ ...f, limit: 25 });
      setCompanies(data.companies);
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

  const setVerification = (company: ConsoleCompany) => {
    const level = levelDraft[company.id] ?? company.trustProfile?.verificationLevel ?? "UNVERIFIED";
    setConfirm({
      title: t("confirm.title", { action: t("companies.setVerification"), target: company.companyName }),
      description: t(`verify.${level}`),
      confirmLabel: t("companies.setVerification"),
      danger: level === "UNVERIFIED",
      onConfirm: async ({ reason }) => {
        await adminConsole.setVerification(company.id, { level, reason });
        setNotice(t("action.applied", { action: t("companies.setVerification") }));
        if (filters) await load(filters);
      },
    });
  };

  if (!filters) return <Spinner />;

  return (
    <div>
      <PageHeader title={t("companies.title")} subtitle={t("companies.subtitle")} />
      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

      <form onSubmit={onSearch} className="surface-panel mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="companies-search" className={labelClass}>{t("common.search")}</label>
          <input
            id="companies-search"
            type="search"
            className={fieldClass}
            placeholder={t("companies.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => searchInput.trim() !== filters.search && update({ search: searchInput.trim() })}
          />
        </div>
        <div>
          <label htmlFor="companies-level" className={labelClass}>{t("companies.level")}</label>
          <select
            id="companies-level"
            className={fieldClass}
            value={filters.verificationLevel}
            onChange={(e) => update({ verificationLevel: e.target.value as Filters["verificationLevel"] })}
          >
            <option value="">{t("common.all")}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{t(`verify.${l}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="companies-status" className={labelClass}>{t("users.filterStatus")}</label>
          <select
            id="companies-status"
            className={fieldClass}
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as Filters["status"] })}
          >
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </div>
      </form>

      {loading && companies.length === 0 ? (
        <Spinner />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>{t("companies.colCompany")}</Th>
              <Th>{t("companies.colOwner")}</Th>
              <Th>{t("companies.colVerification")}</Th>
              <Th className="hidden lg:table-cell">{t("companies.colJobs")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-soft)]">
            {companies.length === 0 ? (
              <tr><Td colSpan={5} className="py-10 text-center"><span className={muted}>{t("common.noResults")}</span></Td></tr>
            ) : (
              companies.map((c) => {
                const level = c.trustProfile?.verificationLevel ?? "UNVERIFIED";
                return (
                  <tr key={c.id}>
                    <Td>
                      <p className={`font-medium ${strong}`}>{c.companyName}</p>
                      <p className={`text-xs ${muted}`}>{c.location} · {fmt.date(c.createdAt)}</p>
                      {c.website && (
                        <a
                          href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-xs text-primary-text hover:underline"
                        >
                          {c.website}
                        </a>
                      )}
                    </Td>
                    <Td>
                      <p className="text-sm">{c.user.name}</p>
                      <p className={`text-xs ${muted}`}>{c.user.email}</p>
                      <div className="mt-1">
                        <Pill tone={restrictionTone[c.user.accountRestrictionStatus]}>{t(`status.${c.user.accountRestrictionStatus}`)}</Pill>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <Pill tone={verificationTone[level]}>{t(`verify.${level}`)}</Pill>
                        <span className={`text-xs ${c.trustProfile?.postingEligibility ? "text-primary-text" : "text-warning"}`}>
                          {c.trustProfile?.postingEligibility ? t("companies.postingEligible") : t("companies.postingBlocked")}
                        </span>
                      </div>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      <Link href={href(`/admin/jobs?employerId=${c.id}`)} className="text-sm text-primary-text hover:underline">
                        {c._count.jobs} · {t("companies.viewJobs")}
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex min-w-[220px] flex-col gap-2">
                        <div className="flex gap-2">
                          <label htmlFor={`level-${c.id}`} className="sr-only">{t("companies.level")}</label>
                          <select
                            id={`level-${c.id}`}
                            className={`${fieldClass} py-1.5`}
                            value={levelDraft[c.id] ?? level}
                            onChange={(e) => setLevelDraft((d) => ({ ...d, [c.id]: e.target.value as EmployerVerificationLevel }))}
                          >
                            {LEVELS.map((l) => <option key={l} value={l}>{t(`verify.${l}`)}</option>)}
                          </select>
                          <Button size="sm" onClick={() => setVerification(c)} disabled={(levelDraft[c.id] ?? level) === level}>
                            ✓
                            <span className="sr-only">{t("companies.setVerification")}</span>
                          </Button>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setOwnerId(c.user.id)}>
                          {t("companies.manageOwner")}
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      )}

      <PaginationBar pagination={pagination} onPage={(page) => setFilters((f) => (f ? { ...f, page } : f))} />

      <UserDetailDrawer
        userId={ownerId}
        currentAdminId={me?.id ?? ""}
        onClose={() => setOwnerId(null)}
        onChanged={() => filters && void load(filters)}
        onConfirm={setConfirm}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
