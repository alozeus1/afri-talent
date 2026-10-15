"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
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
import { SUPPORT_MESSAGES } from "@/lib/i18n/support-messages";
import { Button } from "@/components/ui/button";

const STATUSES: SupportStatus[] = ["OPEN", "PENDING", "RESOLVED"];
const PRIORITIES: SupportPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: "Open",
  PENDING: "Awaiting customer",
  RESOLVED: "Resolved",
};

const topicLabel = (topic: SupportTopic) => SUPPORT_MESSAGES.en[`contact.topic.${topic}`] ?? topic;

const controlClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function statusTone(status: SupportStatus): string {
  if (status === "RESOLVED") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300";
  if (status === "PENDING") return "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300";
  return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
}

function priorityTone(priority: SupportPriority): string {
  if (priority === "URGENT") return "bg-red-600 text-white";
  if (priority === "HIGH") return "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300";
  if (priority === "LOW") return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminSupportPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

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
    if (!isLoading && (!user || user.role !== "ADMIN")) router.push("/login");
  }, [user, isLoading, router]);

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
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { ticket } = await adminSupport.get(id);
      setSelected(ticket);
      setNotes(ticket.internalNotes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") void loadTickets();
  }, [user, loadTickets]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    adminSupport
      .assignees()
      .then((data) => setAssignees(data.assignees))
      .catch(() => setAssignees([]));
  }, [user]);

  useEffect(() => {
    if (selectedId && user?.role === "ADMIN") void loadDetail(selectedId);
  }, [selectedId, user, loadDetail]);

  async function applyUpdate(patch: Parameters<typeof adminSupport.update>[1], label: string) {
    if (!selected) return;
    setBusy(label);
    setFlash(null);
    try {
      await adminSupport.update(selected.id, patch);
      await Promise.all([loadDetail(selected.id), loadTickets()]);
      setFlash(`${label} saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
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
      const channels = [result.delivery.email ? "email" : null, result.delivery.inApp ? "in-app" : null].filter(Boolean);
      setFlash(
        channels.length > 0
          ? `Reply sent via ${channels.join(" + ")}`
          : "Reply saved (email delivery is not configured in this environment)",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const tabs: (SupportStatus | "ALL")[] = ["OPEN", "PENDING", "RESOLVED", "ALL"];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline dark:text-emerald-400">
            ← Admin dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-zinc-950 dark:text-zinc-50">Support desk</h1>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">
            Contact-form tickets from candidates, employers and guests. Replies are emailed to the submitter.
          </p>
        </div>
        <Link href="/admin/reviews" className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Review moderation →
        </Link>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label="Ticket status" className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = status === tab;
          const count = tab === "ALL" ? counts.OPEN + counts.PENDING + counts.RESOLVED : counts[tab];
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStatus(tab);
                setPage(1);
              }}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tab === "ALL" ? "All" : STATUS_LABEL[tab]}
              <span className={`ms-2 rounded-full px-1.5 text-xs ${active ? "bg-white/20" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
          setPage(1);
        }}
      >
        <input
          type="search"
          aria-label="Search tickets"
          placeholder="Search reference, email, name or text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${controlClass} min-w-64 flex-1`}
        />
        <select aria-label="Priority" className={controlClass} value={priority} onChange={(e) => { setPriority(e.target.value as SupportPriority | ""); setPage(1); }}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <select aria-label="Topic" className={controlClass} value={topic} onChange={(e) => { setTopic(e.target.value as SupportTopic | ""); setPage(1); }}>
          <option value="">Any topic</option>
          {SUPPORT_TOPICS.map((t) => (
            <option key={t} value={t}>{topicLabel(t)}</option>
          ))}
        </select>
        <select aria-label="Assignee" className={controlClass} value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setPage(1); }}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>{a.name || a.email}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Ticket list */}
        <section aria-label="Tickets" className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" /></div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No tickets match these filters.
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                aria-current={selectedId === ticket.id}
                className={`block w-full rounded-2xl border p-4 text-start transition-colors ${
                  selectedId === ticket.id
                    ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/10"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">{ticket.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(ticket.status)}`}>{STATUS_LABEL[ticket.status]}</span>
                  {ticket.priority !== "NORMAL" && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityTone(ticket.priority)}`}>{ticket.priority}</span>
                  )}
                  <span className="ms-auto text-xs text-zinc-600 dark:text-zinc-400">{timeAgo(ticket.createdAt)}</span>
                </div>
                <p className="mt-2 font-medium text-zinc-950 dark:text-zinc-50">{ticket.subject || topicLabel(ticket.topic)}</p>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{ticket.message}</p>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {ticket.name} · {ticket.userRole ? ticket.userRole.toLowerCase() : "guest"}
                  {ticket.assignee ? ` · ${ticket.assignee.name || ticket.assignee.email}` : " · unassigned"}
                  {ticket._count && ticket._count.replies > 0 ? ` · ${ticket._count.replies} repl${ticket._count.replies === 1 ? "y" : "ies"}` : ""}
                </p>
              </button>
            ))
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </section>

        {/* Ticket detail */}
        <section aria-label="Ticket detail" className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 lg:sticky lg:top-24 lg:self-start">
          {!selectedId ? (
            <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">Select a ticket to triage and reply.</p>
          ) : detailLoading && !selected ? (
            <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-b-2 border-emerald-600" /></div>
          ) : selected ? (
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selected.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(selected.status)}`}>{STATUS_LABEL[selected.status]}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">opened {new Date(selected.createdAt).toLocaleString()}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-zinc-50">{selected.subject || topicLabel(selected.topic)}</h2>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {selected.name} &lt;<a className="text-emerald-700 hover:underline dark:text-emerald-400" href={`mailto:${selected.email}`}>{selected.email}</a>&gt;
                  {" · "}{selected.userRole ? `registered ${selected.userRole.toLowerCase()}` : "guest"}
                  {selected.locale ? ` · ${selected.locale.toUpperCase()}` : ""}
                  {selected.pageUrl ? ` · from ${selected.pageUrl}` : ""}
                </p>
              </div>

              <div className="whitespace-pre-line rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                {selected.message}
              </div>

              {/* Triage */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="mb-1 block font-medium">Status</span>
                  <select className={`${controlClass} w-full`} value={selected.status} disabled={busy !== null}
                    onChange={(e) => applyUpdate({ status: e.target.value as SupportStatus }, "Status")}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </label>
                <label className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="mb-1 block font-medium">Priority</span>
                  <select className={`${controlClass} w-full`} value={selected.priority} disabled={busy !== null}
                    onChange={(e) => applyUpdate({ priority: e.target.value as SupportPriority }, "Priority")}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
                  </select>
                </label>
                <label className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="mb-1 block font-medium">Topic</span>
                  <select className={`${controlClass} w-full`} value={selected.topic} disabled={busy !== null}
                    onChange={(e) => applyUpdate({ topic: e.target.value as SupportTopic }, "Topic")}>
                    {SUPPORT_TOPICS.map((t) => <option key={t} value={t}>{topicLabel(t)}</option>)}
                  </select>
                </label>
                <label className="text-sm text-zinc-800 dark:text-zinc-200">
                  <span className="mb-1 block font-medium">Assignee</span>
                  <select className={`${controlClass} w-full`} value={selected.assignee?.id ?? ""} disabled={busy !== null}
                    onChange={(e) => applyUpdate({ assigneeId: e.target.value || null }, "Assignee")}>
                    <option value="">Unassigned</option>
                    {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <label htmlFor="ticket-notes" className="mb-1 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Internal notes <span className="font-normal text-zinc-600 dark:text-zinc-400">(never shown to the customer)</span>
                </label>
                <textarea id="ticket-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  className={`${controlClass} w-full`} maxLength={10000} />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="outline" disabled={busy !== null || notes === (selected.internalNotes ?? "")}
                    onClick={() => applyUpdate({ internalNotes: notes || null }, "Notes")}>
                    Save notes
                  </Button>
                </div>
              </div>

              {/* Conversation */}
              {selected.replies && selected.replies.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Replies</h3>
                  {selected.replies.map((r) => (
                    <div key={r.id} className="rounded-xl border-s-4 border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-500/10">
                      <p className="text-xs text-emerald-900 dark:text-emerald-300">
                        {r.author?.name ?? "Admin"} · {new Date(r.createdAt).toLocaleString()} · {r.emailSent ? "emailed" : "not emailed"}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-zinc-800 dark:text-zinc-200">{r.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={(e) => sendReply(e)} className="space-y-3">
                <label htmlFor="ticket-reply" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Reply to {selected.name}
                </label>
                <textarea id="ticket-reply" rows={5} value={reply} onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply. It is emailed to the customer and shown in their account if they are registered."
                  className={`${controlClass} w-full placeholder:text-zinc-500 dark:placeholder:text-zinc-400`} maxLength={10000} />
                <div className="flex flex-wrap justify-end gap-3">
                  <Button type="button" variant="outline" disabled={busy !== null || reply.trim().length < 2} onClick={(e) => sendReply(e, true)}>
                    Send & resolve
                  </Button>
                  <Button type="submit" disabled={busy !== null || reply.trim().length < 2} isLoading={busy === "reply"}>
                    Send reply
                  </Button>
                </div>
              </form>

              {flash && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{flash}</p>}
            </div>
          ) : (
            <p className="py-16 text-center text-zinc-600 dark:text-zinc-400">Ticket not found.</p>
          )}
        </section>
      </div>
    </div>
  );
}
