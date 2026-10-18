"use client";

import { useCallback, useEffect, useState, useRef, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Flag, SendHorizontal, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { messages, Message, MessageThread, trust } from "@/lib/api";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidateSpinner,
  candidateFieldClass,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

export default function ThreadDetailPage() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const router = useRouter();
  const params = useParams();
  const threadId = params.id as string;
  const { user, isLoading } = useAuth();
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [guidance, setGuidance] = useState<{ headline: string; tips: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendFailed, setSendFailed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, locale, router]);

  const loadThread = useCallback(() => {
    Promise.all([messages.thread(threadId), trust.messagingGuidance().catch(() => null)])
      .then(([threadResponse, guidanceResponse]) => {
        setThread(threadResponse.thread);
        setThreadMessages(threadResponse.messages);
        setGuidance(guidanceResponse);
      })
      .catch((err) => {
        // A missing thread keeps the "not found" state; anything else
        // (network, 5xx) is a real load failure with a retry.
        if ((err as { status?: number })?.status !== 404) {
          setLoadError(err);
        }
      })
      .finally(() => setLoading(false));
  }, [threadId]);

  const retryLoadThread = () => {
    setLoading(true);
    setLoadError(null);
    loadThread();
  };

  const userId = user?.id;
  useEffect(() => {
    if (userId && threadId) loadThread();
  }, [userId, threadId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [threadMessages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const body = newMessage.trim();
    if (!body || sending) return;

    setSending(true);
    setSendFailed(false);
    try {
      const sent = await messages.sendMessage(threadId, body);
      setThreadMessages((prev) => [...prev, sent]);
      setNewMessage("");
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  };

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return fmt.time(date);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return t("msg.yesterday", { time: fmt.time(date) });
    return fmt.dateTime(date);
  }

  const backLink = <CandidateBackLink href={localizePath("/messages", locale)}>{t("msg.back")}</CandidateBackLink>;

  if (isLoading || !user || loading) {
    return <CandidateSpinner className="py-24" />;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {backLink}
        <CandidateLoadError error={loadError} subject={t("msg.threadSubject")} onRetry={retryLoadThread} />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <EmptyState
          title={t("msg.notFound")}
          description={t("msg.notFoundBody")}
          primaryAction={{ label: t("msg.back"), href: localizePath("/messages", locale) }}
        />
      </div>
    );
  }

  const otherParticipants = thread.participants.filter((p) => p.id !== user.id);
  const participantNames = otherParticipants.map((p) => p.name).join(", ") || t("msg.unknown");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {backLink}

      {guidance && (
        <Card className="mb-4 border-info-line bg-info-soft">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-semibold text-fg">{guidance.headline}</h2>
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-fg-secondary">
                    {guidance.tips.slice(0, 2).map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link href={localizePath(`/trust/report?targetThreadId=${threadId}`, locale)} className="shrink-0">
                <Button variant="outline" size="sm">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  {t("msg.reportThread")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex h-[calc(100dvh-12rem)] min-h-[420px] flex-col">
        <CardHeader>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-fg">{participantNames}</h1>
            {thread.job && (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="info">{thread.job.title}</Badge>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-4 overflow-y-auto p-6" role="log" aria-live="polite">
          {threadMessages.length === 0 ? (
            <p className="py-8 text-center text-fg-muted">{t("msg.startEmpty")}</p>
          ) : (
            threadMessages.map((msg) => {
              const isOwn = msg.senderId === user.id;
              return (
                <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 sm:max-w-[65%] ${
                      isOwn ? "rounded-ee-md bg-primary text-primary-fg" : "rounded-es-md bg-surface-muted text-fg"
                    }`}
                  >
                    {!isOwn && <p className="mb-1 text-xs font-semibold text-primary-text">{msg.sender.name}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm" dir="auto">
                      {msg.body}
                    </p>
                    <p className={`mt-1 text-xs ${isOwn ? "text-primary-fg/80" : "text-fg-muted"}`}>
                      <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <CardFooter>
          <div className="w-full space-y-3">
            {sendFailed && <CandidateNotice>{t("msg.sendFailed")}</CandidateNotice>}
            <form onSubmit={handleSend} className="flex w-full gap-2">
              <label htmlFor="thread-message" className="sr-only">
                {t("msg.inputLabel")}
              </label>
              <input
                id="thread-message"
                placeholder={t("msg.placeholder")}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                dir="auto"
                autoComplete="off"
                className={`${candidateFieldClass} flex-1`}
              />
              <Button type="submit" disabled={sending || !newMessage.trim()} isLoading={sending}>
                {!sending && <SendHorizontal className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />}
                {t("msg.send")}
              </Button>
            </form>
            <p className="text-xs text-fg-muted">{t("msg.safety")}</p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
