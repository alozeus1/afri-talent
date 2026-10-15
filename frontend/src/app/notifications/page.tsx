"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Briefcase, CheckCheck, FileText, MessageSquare, Settings, Target } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { notifications, NotificationItem } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
  CandidateSpinner,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

type FilterTab = "ALL" | "UNREAD";
type Feedback = "RELEVANT" | "NOT_RELEVANT" | "TOO_MANY" | "WRONG_ROLE" | "WRONG_LOCATION";
const FEEDBACK: Feedback[] = ["RELEVANT", "NOT_RELEVANT", "TOO_MANY", "WRONG_ROLE", "WRONG_LOCATION"];

function NotificationIcon({ type }: { type: string }) {
  const Icon =
    type === "MESSAGE"
      ? MessageSquare
      : type === "APPLICATION"
        ? FileText
        : type === "JOB_MATCH"
          ? Target
          : type === "VERIFICATION"
            ? CheckCheck
            : type === "JOB"
              ? Briefcase
              : Bell;
  return (
    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-text">
      <Icon className="h-4 w-4" />
    </span>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<"saved" | "failed" | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { status?: string; page: number; limit: number } = { page, limit: 10 };
      if (filter === "UNREAD") params.status = "UNREAD";
      const response = await notifications.list(params);
      setItems(response.notifications);
      setTotalPages(response.pagination.totalPages);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notifications.unreadCount();
      setUnreadCount(res.count);
    } catch {
      // The badge is optional; the list still renders.
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [user, fetchNotifications, fetchUnreadCount]);

  const handleMarkRead = async (id: string) => {
    try {
      await notifications.markRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: "READ" } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Leave it unread; the user can retry.
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await notifications.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, status: "READ" })));
      setUnreadCount(0);
    } catch {
      // Leave state unchanged on failure.
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleFeedback = async (id: string, feedback: Feedback) => {
    try {
      const response = await notifications.feedback(id, feedback);
      setItems((prev) => prev.map((item) => (item.id === id ? response.notification : item)));
      setFeedbackMessage("saved");
    } catch {
      setFeedbackMessage("failed");
    }
  };

  const handleFilterChange = (tab: FilterTab) => {
    setFilter(tab);
    setPage(1);
  };

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidatePageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t("notif.title")}
            {unreadCount > 0 && <Badge variant="success">{t("notif.unread", { count: fmt.number(unreadCount) })}</Badge>}
          </span>
        }
        actions={
          <>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={markingAllRead}>
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
                {markingAllRead ? t("notif.marking") : t("notif.markAll")}
              </Button>
            )}
            {user.role === "CANDIDATE" && (
              <Link href={localizePath("/candidate/preferences", locale)}>
                <Button variant="ghost" size="sm">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  {t("notif.preferences")}
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 flex">
        <Tabs.Root value={filter} onValueChange={(val) => handleFilterChange(val as FilterTab)}>
          <Tabs.List
            className="flex items-center gap-x-1 rounded-xl border border-line bg-surface p-1 text-sm shadow-xs"
            aria-label={t("notif.filter")}
          >
            {(["ALL", "UNREAD"] as FilterTab[]).map((tab) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="rounded-lg px-6 py-2 font-medium text-fg-muted transition-all duration-150 hover:bg-surface-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:bg-surface-muted data-[state=active]:text-fg data-[state=active]:shadow-xs"
              >
                {t(`notif.tab.${tab}` as CandidateMessageKey)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </div>

      {feedbackMessage && (
        <CandidateNotice tone={feedbackMessage === "saved" ? "success" : "warning"} className="mb-6">
          {feedbackMessage === "saved" ? t("notif.feedbackSaved") : t("notif.feedbackFailed")}
        </CandidateNotice>
      )}

      {loading ? (
        <CandidateSpinner />
      ) : error ? (
        <CandidateLoadError error={error} subject={t("notif.subject")} onRetry={fetchNotifications} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title={t("notif.empty")}
          description={filter === "UNREAD" ? t("notif.emptyUnread") : t("notif.emptyAll")}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((notification) => {
            const isUnread = notification.status === "UNREAD";
            return (
              <li key={notification.id}>
                <Card className={`transition-shadow hover:shadow-card ${isUnread ? "border-s-4 border-s-primary" : ""}`}>
                  <CardContent className="flex items-start gap-4 p-4">
                    <NotificationIcon type={notification.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-sm ${isUnread ? "font-semibold text-fg" : "font-medium text-fg-secondary"}`}>
                          {notification.title}
                        </h3>
                        <time dateTime={notification.createdAt} className="shrink-0 text-xs text-fg-muted">
                          {fmt.relative(notification.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-fg-muted">{notification.body}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("notif.feedbackLabel")}>
                        {FEEDBACK.map((value) => {
                          const active = notification.metadata?.feedback === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => void handleFeedback(notification.id, value)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                active
                                  ? "border-success-line bg-success-soft text-success"
                                  : "border-line text-fg-muted hover:border-line-strong hover:text-fg-secondary"
                              }`}
                            >
                              {t(`notif.fb.${value}` as CandidateMessageKey)}
                            </button>
                          );
                        })}
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => void handleMarkRead(notification.id)}
                            className="ms-auto text-xs font-medium text-primary-text hover:underline"
                          >
                            {t("notif.markRead")}
                          </button>
                        )}
                      </div>
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary">
                        <span className="sr-only">{t("notif.unreadDot")}</span>
                      </span>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-4" aria-label={t("notif.page", { page, total: totalPages })}>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("ui.previous")}
          </Button>
          <span className="text-sm text-fg-secondary">{t("notif.page", { page, total: totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("ui.next")}
          </Button>
        </nav>
      )}
    </div>
  );
}
