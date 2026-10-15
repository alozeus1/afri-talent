"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { AccountRestrictionStatus } from "@/lib/api";
import { adminConsole, ConsoleRole, ConsoleUser, Pagination } from "@/lib/admin-console-api";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  ConfirmDialog,
  ConfirmRequest,
  Drawer,
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
} from "@/components/admin/console-ui";
import { UserDetailDrawer } from "@/components/admin/user-detail-drawer";
import { MessageComposer } from "@/components/admin/message-composer";

const ROLES: ConsoleRole[] = ["CANDIDATE", "EMPLOYER", "ADMIN"];
const STATUSES: AccountRestrictionStatus[] = ["ACTIVE", "LIMITED", "SUSPENDED", "BANNED"];

type Filters = {
  search: string;
  role: ConsoleRole | "";
  status: AccountRestrictionStatus | "";
  emailVerified: "true" | "false" | "";
  sort: "newest" | "oldest" | "name";
  page: number;
};

function readInitialFilters(): Filters {
  const base: Filters = { search: "", role: "", status: "", emailVerified: "", sort: "newest", page: 1 };
  if (typeof window === "undefined") return base;
  const q = new URLSearchParams(window.location.search);
  const role = q.get("role");
  const status = q.get("status");
  return {
    ...base,
    search: q.get("search") ?? "",
    role: ROLES.includes(role as ConsoleRole) ? (role as ConsoleRole) : "",
    status: STATUSES.includes(status as AccountRestrictionStatus) ? (status as AccountRestrictionStatus) : "",
  };
}

export default function AdminUsersPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const { user: me } = useAuth();
  const [filters, setFilters] = useState<Filters | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [users, setUsers] = useState<ConsoleUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const initial = readInitialFilters();
    setFilters(initial);
    setSearchInput(initial.search);
    const userId = new URLSearchParams(window.location.search).get("user");
    if (userId) setSelectedId(userId);
  }, []);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminConsole.users({ ...f, limit: 25 });
      setUsers(data.users);
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

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!filters) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        actions={
          checked.size > 0 ? (
            <Button onClick={() => setBulkOpen(true)}>{t("users.messageSelected", { count: checked.size })}</Button>
          ) : null
        }
      />

      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

      <form onSubmit={onSearch} className="surface-panel mb-4 grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2">
          <label htmlFor="users-search" className={labelClass}>{t("common.search")}</label>
          <input
            id="users-search"
            type="search"
            className={fieldClass}
            placeholder={t("users.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => searchInput.trim() !== filters.search && update({ search: searchInput.trim() })}
          />
        </div>
        <div>
          <label htmlFor="users-role" className={labelClass}>{t("users.filterRole")}</label>
          <select id="users-role" className={fieldClass} value={filters.role} onChange={(e) => update({ role: e.target.value as Filters["role"] })}>
            <option value="">{t("common.all")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="users-status" className={labelClass}>{t("users.filterStatus")}</label>
          <select id="users-status" className={fieldClass} value={filters.status} onChange={(e) => update({ status: e.target.value as Filters["status"] })}>
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="users-verified" className={labelClass}>{t("users.filterVerified")}</label>
          <select id="users-verified" className={fieldClass} value={filters.emailVerified} onChange={(e) => update({ emailVerified: e.target.value as Filters["emailVerified"] })}>
            <option value="">{t("common.all")}</option>
            <option value="true">{t("users.verified")}</option>
            <option value="false">{t("users.unverified")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="users-sort" className={labelClass}>{t("users.sort")}</label>
          <select id="users-sort" className={fieldClass} value={filters.sort} onChange={(e) => update({ sort: e.target.value as Filters["sort"] })}>
            <option value="newest">{t("users.sortNewest")}</option>
            <option value="oldest">{t("users.sortOldest")}</option>
            <option value="name">{t("users.sortName")}</option>
          </select>
        </div>
      </form>

      {loading && users.length === 0 ? (
        <Spinner />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th className="w-10"><span className="sr-only">{t("users.select")}</span></Th>
              <Th>{t("users.colUser")}</Th>
              <Th>{t("users.colRole")}</Th>
              <Th>{t("users.colStatus")}</Th>
              <Th className="hidden md:table-cell">{t("users.colActivity")}</Th>
              <Th className="hidden md:table-cell">{t("users.colJoined")}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-soft)]">
            {users.length === 0 ? (
              <tr><Td colSpan={6} className="py-10 text-center"><span className={muted}>{t("common.noResults")}</span></Td></tr>
            ) : (
              users.map((u) => (
                <tr
                  key={u.id}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  onClick={() => setSelectedId(u.id)}
                >
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`${t("users.select")}: ${u.email}`}
                      checked={checked.has(u.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 dark:bg-zinc-900"
                    />
                  </Td>
                  <Td>
                    <p className={`font-medium ${strong}`}>{u.name}</p>
                    <p className={`text-xs ${muted}`}>{u.email}</p>
                    {u.employer && <p className="text-xs text-emerald-700 dark:text-emerald-400">{u.employer.companyName}</p>}
                  </Td>
                  <Td>
                    <Pill tone={u.role === "ADMIN" ? "violet" : u.role === "EMPLOYER" ? "blue" : "green"}>{t(`role.${u.role}`)}</Pill>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <Pill tone={restrictionTone[u.accountRestrictionStatus]}>{t(`status.${u.accountRestrictionStatus}`)}</Pill>
                      {u.accountRestrictedUntil && (
                        <span className={`text-xs ${muted}`}>{t("users.until", { date: fmt.date(u.accountRestrictedUntil) })}</span>
                      )}
                      {!u.emailVerified && <span className="text-xs text-amber-700 dark:text-amber-300">{t("users.unverified")}</span>}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className={`text-xs ${muted}`}>{t("users.applicationsCount", { count: u._count.applications })}</span>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className={`text-xs ${muted}`}>{fmt.date(u.createdAt)}</span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}

      <PaginationBar pagination={pagination} onPage={(page) => setFilters((f) => (f ? { ...f, page } : f))} />

      <UserDetailDrawer
        userId={selectedId}
        currentAdminId={me?.id ?? ""}
        onClose={() => setSelectedId(null)}
        onChanged={() => filters && void load(filters)}
        onConfirm={setConfirm}
      />

      <Drawer open={bulkOpen} title={t("users.messageSelected", { count: checked.size })} onClose={() => setBulkOpen(false)}>
        <p className={`mb-4 text-sm ${muted}`}>{t("broadcast.bannedExcluded")}</p>
        <MessageComposer
          submitLabel={t("broadcast.send")}
          onSend={async (input) => {
            const result = await adminConsole.broadcast({ ...input, segment: { userIds: Array.from(checked) } });
            return { email: result.email };
          }}
          onSent={(msg) => {
            setNotice(msg);
            setBulkOpen(false);
            setChecked(new Set());
          }}
        />
      </Drawer>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
