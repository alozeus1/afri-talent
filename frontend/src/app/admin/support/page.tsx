"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AdminTicket,
  AdminTicketFilters,
  AdminTicketPerson,
  SUPPORT_TOPICS,
  SupportPriority,
  SupportStatus,
  SupportTopic,
  adminSupport,
} from "@/lib/api/support";
import { useSupportT } from "@/lib/i18n/support-messages";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import { useAdminHref } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  Field,
  FilterChips,
  Notice,
  PageHeader,
  Pill,
  PillTone,
  SkeletonList,
  Spinner,
  fieldClass,
  labelClass,
  linkClass,
  muted,
  strong,
} from "@/components/admin/console-ui";

const STATUSES: SupportStatus[] = ["OPEN", "PENDING", "RESOLVED"];
const PRIORITIES: SupportPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const STATUS_TONE: Record<SupportStatus, PillTone> = { OPEN: "amber", PENDING: "blue", RESOLVED: "green" };
const PRIORITY_TONE: Record<SupportPriority, PillTone> = { LOW: "zinc", NORMAL: "zinc", HIGH: "red", URGENT: "red" };

type UpdateField = "status" | "priority" | "topic" | "assignee" | "notes";

export default function AdminSupportPage() {
  const t = useAdminT();
  const st = useSupportT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const topicLabel = (topic: SupportTopic) => st(`contact.topic.${topic}`);

  const [status, setStatus] = useState<SupportStatus | "ALL">("OPEN");
  const [priority, setPriority] = useState<SupportPriority | "">("");
  const [topic, setTopic] = useState<SupportTopic | "">("");
  const [assigneeId, setAssigneeId] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [counts, setCounts] = useState<Record<SupportStatus, number>>({ OPEN: 0, PENDING: 0, RESOLVED: 0 });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assignees, setAssignees] = useState<AdminTicketPerson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ticket");
    if (fromUrl) {
      setSelectedId(fromUrl);
      setStatus("ALL");
    }
  }, []);

  const filters = useMemo<AdminTicketFilters>(
    () => ({
      status: status === "ALL" ? undefined : status,
      priority: priority || undefined,
      topic: topic || undefined,
      assigneeId: assigneeId || undefined,
      q: search || undefined,
      page,
    }),
    [status, priority, topic, assigneeId, search, page],
  );

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminSupport.list(filters);
      setTickets(data.tickets);
      setCounts(data.counts);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const { ticket } = await adminSupport.get(id);
        setSelected(ticket);
        setNotes(ticket.internalNotes ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("common.error"));
        setSelected(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    adminSupport
      .assignees()
      .then((data) => setAssignees(data.assignees))
      .catch(() => setAssignees([]));
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function applyUpdate(patch: Parameters<typeof adminSupport.update>[1], field: UpdateField) {
    if (!selected) return;
    setBusy(field);
    setFlash(null);
    try {
      await adminSupport.update(selected.id, patch);
      await Promise.all([loadDetail(selected.id), loadTickets()]);
      setFlash(t("support.saved", { field: t(`support.field.${field}`) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  async function sendReply(event: { preventDefault(): void }, resolve = false) {
    event.preventDefault();
    if (!selected || reply.trim().length < 2) return;
    setBusy(resolve ? "resolve" : "reply");
    setFlash(null);
    try {
      const result = await adminSupport.reply(selected.id, reply.trim(), resolve ? "RESOLVED" : undefined);
      setReply("");
      await Promise.all([loadDetail(selected.id), loadTickets()]);
      const { email, inApp } = result.delivery;
      setFlash(
        email && inApp
          ? t("support.sentEmailInApp")
          : email
            ? t("support.sentEmail")
            : inApp
              ? t("support.sentInApp")
              : t("support.sentNoDelivery"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  const applySearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(query.trim());
    setPage(1);
  };

  const roleLabel = (role: string | null) => (role ? label("role", role) : t("support.guest"));
  const tabs: Array<{ value: SupportStatus | "ALL"; label: string; count: number }> = [
    { value: "OPEN", label: t("supportStatus.OPEN"), count: counts.OPEN },
    { value: "PENDING", label: t("supportStatus.PENDING"), count: counts.PENDING },
    { value: "RESOLVED", label: t("supportStatus.RESOLVED"), count: counts.RESOLVED },
    { value: "ALL", label: t("common.all"), count: counts.OPEN + counts.PENDING + counts.RESOLVED },
  ];

  return (
    <div>
      <PageHeader
        title={t("support.title")}
        subtitle={t("support.subtitle")}
        actions={
          <Link href={href("/admin/reviews")} className={`text-sm ${linkClass}`}>
            {t("support.reviewsLink")}
          </Link>
        }
      />

      <div className="mb-4">
        <FilterChips
          label={t("support.statusLabel")}
          options={tabs}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>

      <form className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]" onSubmit={applySearch}>
        <input
          type="search"
          aria-label={t("support.searchLabel")}
          placeholder={t("support.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${fieldClass} sm:col-span-2 lg:col-span-1`}
        />
        <select
          aria-label={t("common.priority")}
          className={fieldClass}
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value as SupportPriority | "");
            setPage(1);
          }}
        >
          <option value="">{t("support.anyPriority")}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{t(`supportPriority.${p}`)}</option>
          ))}
        </select>
        <select
          aria-label={t("support.topic")}
          className={fieldClass}
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value as SupportTopic | "");
            setPage(1);
          }}
        >
          <option value="">{t("support.anyTopic")}</option>
          {SUPPORT_TOPICS.map((tp) => (
            <option key={tp} value={tp}>{topicLabel(tp)}</option>
          ))}
        </select>
        <select
          aria-label={t("support.assignee")}
          className={fieldClass}
          value={assigneeId}
          onChange={(e) => {
            setAssigneeId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("support.anyone")}</option>
          <option value="me">{t("support.assignedToMe")}</option>
          <option value="unassigned">{t("common.unassigned")}</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name || a.email}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">{t("common.search")}</Button>
      </form>

      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label={t("support.ticketsLabel")} className="space-y-3">
          {loading ? (
            <SkeletonList rows={4} />
          ) : tickets.length === 0 ? (
            <EmptyState title={t("common.noResults")} />
          ) : (
            tickets.map((ticket) => {
              const active = selectedId === ticket.id;
              const replies = ticket._count?.replies ?? 0;
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  aria-current={active ? "true" : undefined}
                  className={`block w-full rounded-2xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    active ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong hover:bg-surface-sunken"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-xs font-semibold ${strong}`}>{ticket.reference}</span>
                    <Pill tone={STATUS_TONE[ticket.status]}>{t(`supportStatus.${ticket.status}`)}</Pill>
                    {ticket.priority !== "NORMAL" && <Pill tone={PRIORITY_TONE[ticket.priority]}>{t(`supportPriority.${ticket.priority}`)}</Pill>}
                    <span className={`ms-auto text-xs ${muted}`}>{fmt.relative(ticket.createdAt)}</span>
                  </div>
                  <p className={`mt-2 font-medium ${strong}`}>{ticket.subject || topicLabel(ticket.topic)}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">{ticket.message}</p>
                  <p className={`mt-2 text-xs ${muted}`}>
                    {ticket.name} · {roleLabel(ticket.userRole)} ·{" "}
                    {ticket.assignee ? ticket.assignee.name || ticket.assignee.email : t("common.unassigned")}
                    {replies > 0 ? ` · ${t("support.replyCount", { count: replies })}` : ""}
                  </p>
                </button>
              );
            })
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("common.prev")}</Button>
              <span className={`text-sm ${muted}`}>{t("common.pageOf", { page, total: totalPages })}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{t("common.next")}</Button>
            </div>
          )}
        </section>

        <section aria-label={t("support.detailLabel")} className="surface-panel rounded-2xl p-6 lg:sticky lg:top-24 lg:self-start">
          {!selectedId ? (
            <p className={`py-16 text-center text-sm ${muted}`}>{t("support.selectPrompt")}</p>
          ) : detailLoading && !selected ? (
            <Spinner />
          ) : selected ? (
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-sm font-semibold ${strong}`}>{selected.reference}</span>
                  <Pill tone={STATUS_TONE[selected.status]}>{t(`supportStatus.${selected.status}`)}</Pill>
                  <span className={`text-xs ${muted}`}>{t("support.opened", { time: fmt.dateTime(selected.createdAt) })}</span>
                </div>
                <h2 className={`mt-2 text-xl font-semibold ${strong}`}>{selected.subject || topicLabel(selected.topic)}</h2>
                <p className="mt-1 break-words text-sm text-fg-secondary">
                  {selected.name} ·{" "}
                  <a className={linkClass} href={`mailto:${selected.email}`}>{selected.email}</a>
                  {" · "}
                  {selected.userRole ? t("support.registered", { role: roleLabel(selected.userRole) }) : t("support.guest")}
                  {selected.locale ? ` · ${selected.locale.toUpperCase()}` : ""}
                  {selected.pageUrl ? ` · ${t("support.fromPage", { url: selected.pageUrl })}` : ""}
                </p>
              </div>

              <div className="whitespace-pre-line rounded-xl bg-surface-sunken p-4 text-sm leading-6 text-fg">{selected.message}</div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("common.status")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={selected.status} disabled={busy !== null}
                      onChange={(e) => void applyUpdate({ status: e.target.value as SupportStatus }, "status")}>
                      {STATUSES.map((s) => <option key={s} value={s}>{t(`supportStatus.${s}`)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={t("common.priority")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={selected.priority} disabled={busy !== null}
                      onChange={(e) => void applyUpdate({ priority: e.target.value as SupportPriority }, "priority")}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{t(`supportPriority.${p}`)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={t("support.topic")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={selected.topic} disabled={busy !== null}
                      onChange={(e) => void applyUpdate({ topic: e.target.value as SupportTopic }, "topic")}>
                      {SUPPORT_TOPICS.map((tp) => <option key={tp} value={tp}>{topicLabel(tp)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={t("support.assignee")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={selected.assignee?.id ?? ""} disabled={busy !== null}
                      onChange={(e) => void applyUpdate({ assigneeId: e.target.value || null }, "assignee")}>
                      <option value="">{t("common.unassigned")}</option>
                      {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                    </select>
                  )}
                </Field>
              </div>

              <Field label={t("support.internalNotes")} help={t("support.internalNotesHelp")}>
                {(id) => (
                  <>
                    <textarea id={id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} maxLength={10000} />
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="outline" isLoading={busy === "notes"}
                        disabled={busy !== null || notes === (selected.internalNotes ?? "")}
                        onClick={() => void applyUpdate({ internalNotes: notes || null }, "notes")}>
                        {t("support.saveNotes")}
                      </Button>
                    </div>
                  </>
                )}
              </Field>

              {selected.replies && selected.replies.length > 0 && (
                <div className="space-y-3">
                  <h3 className={labelClass}>{t("support.replies")}</h3>
                  {selected.replies.map((r) => (
                    <div key={r.id} className="rounded-xl border-s-4 border-primary bg-primary-soft p-3">
                      <p className={`text-xs ${muted}`}>
                        {r.author?.name ?? t("role.ADMIN")} · {fmt.dateTime(r.createdAt)} · {r.emailSent ? t("support.emailed") : t("support.notEmailed")}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-fg">{r.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={(e) => void sendReply(e)} className="space-y-3">
                <Field label={t("support.replyTo", { name: selected.name })}>
                  {(id) => (
                    <textarea id={id} rows={5} value={reply} onChange={(e) => setReply(e.target.value)}
                      placeholder={t("support.replyPlaceholder")} className={fieldClass} maxLength={10000} />
                  )}
                </Field>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" isLoading={busy === "resolve"}
                    disabled={busy !== null || reply.trim().length < 2} onClick={(e) => void sendReply(e, true)}>
                    {t("support.sendResolve")}
                  </Button>
                  <Button type="submit" disabled={busy !== null || reply.trim().length < 2} isLoading={busy === "reply"}>
                    {t("support.sendReply")}
                  </Button>
                </div>
              </form>

              {flash && <p role="status" className="text-sm font-medium text-success">{flash}</p>}
            </div>
          ) : (
            <p className={`py-16 text-center text-sm ${muted}`}>{t("support.notFound")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
