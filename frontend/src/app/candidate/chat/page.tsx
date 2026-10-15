"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, MessageSquarePlus, SendHorizontal, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { chat, ChatConsentStatus, ChatMessageData, ChatConversation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CandidateBackLink,
  CandidateLoadError,
  CandidateNotice,
  CandidatePageHeader,
} from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

type PolicyKey = "privacyNotice" | "termsOfUse" | "dataStorage";
const POLICY_KEYS: PolicyKey[] = ["privacyNotice", "termsOfUse", "dataStorage"];
const SUGGESTIONS: CandidateMessageKey[] = [
  "chat.suggest.status",
  "chat.suggest.profile",
  "chat.suggest.next",
  "chat.suggest.interview",
];

// ── Consent ──────────────────────────────────────────────────────────────────

function ConsentPanel({
  consentData,
  onAccept,
  loading,
  failed,
}: {
  consentData: ChatConsentStatus;
  onAccept: () => void;
  loading: boolean;
  failed: boolean;
}) {
  const t = useCandidateT();
  const locale = useLocale();
  const [checks, setChecks] = useState<Record<PolicyKey, boolean>>({
    privacyNotice: false,
    termsOfUse: false,
    dataStorage: false,
  });

  const allChecked = POLICY_KEYS.every((key) => checks[key]);
  const { policies } = consentData;

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="mb-8 text-center">
            <span
              aria-hidden="true"
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary-text"
            >
              <ShieldCheck className="h-8 w-8" />
            </span>
            <h2 className="mb-2 text-2xl font-semibold text-fg">{t("chat.consent.title")}</h2>
            <p className="text-fg-secondary">{t("chat.consent.body")}</p>
          </div>

          <div className="mb-8 space-y-3">
            {POLICY_KEYS.map((key) => (
              <label
                key={key}
                aria-label={policies[key].title}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:border-line-strong has-[:checked]:border-success-line has-[:checked]:bg-success-soft"
              >
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
                />
                <div className="flex-1">
                  <p className="font-medium text-fg">{policies[key].title}</p>
                  <p className="mt-1 text-sm text-fg-secondary">{policies[key].summary}</p>
                  <span className="mt-1 block text-xs text-fg-muted">
                    {t("chat.consent.version", { version: policies[key].version })}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {failed ? <CandidateNotice className="mb-4">{t("chat.consent.failed")}</CandidateNotice> : null}

          <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
            <Link href={localizePath("/candidate", locale)} className="text-sm text-fg-muted hover:text-fg">
              {t("ai.backToDashboard")}
            </Link>
            <Button onClick={onAccept} disabled={!allChecked || loading}>
              {loading ? t("chat.consent.accepting") : t("chat.consent.accept")}
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-fg-muted">{t("chat.consent.revokeNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────

function ChatInterface() {
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [newFailed, setNewFailed] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousMessageCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const currentCount = messages.length;
    const behavior: ScrollBehavior = previousCount === 0 || currentCount < previousCount ? "auto" : "smooth";
    const frame = requestAnimationFrame(() => scrollToBottom(behavior));
    previousMessageCountRef.current = currentCount;
    return () => cancelAnimationFrame(frame);
  }, [messages, sending, conversationId, scrollToBottom]);

  useEffect(() => {
    chat
      .getHistory()
      .then((res) => {
        if (res.conversations) setConversations(res.conversations);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    chat
      .getHistory(conversationId)
      .then((res) => {
        if (res.messages) setMessages(res.messages);
      })
      .catch(() => {});
  }, [conversationId]);

  // Grow the composer with its content (up to ~5 lines).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessageData = {
      id: `temp-${Date.now()}`,
      role: "USER",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await chat.sendMessage(text, conversationId || undefined);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMsg.id),
        { ...userMsg, id: `user-${Date.now()}` },
        res.message,
      ]);
      setConversationId(res.conversationId);
      setRemaining(res.remaining);
    } catch {
      const errorId = `error-${Date.now()}`;
      setFailedIds((prev) => new Set(prev).add(errorId));
      setMessages((prev) => [
        ...prev,
        { id: errorId, role: "ASSISTANT", content: t("chat.sendFailed"), createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleNewConversation() {
    setNewFailed(false);
    try {
      const res = await chat.newConversation();
      setConversationId(res.conversation.id);
      setMessages([]);
      setConversations((prev) => [res.conversation, ...prev]);
      setShowSidebar(false);
    } catch {
      setNewFailed(true);
    }
  }

  function handleSelectConversation(id: string) {
    setMessages([]);
    setInput("");
    setConversationId(id);
    setShowSidebar(false);
  }

  async function handleRevoke() {
    if (!window.confirm(t("chat.revokeConfirm"))) return;
    setRevoking(true);
    try {
      await chat.revokeConsent();
      window.location.reload();
    } catch {
      setRevoking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="relative flex h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <aside
        aria-label={t("chat.conversations")}
        className={`${
          showSidebar ? "flex" : "hidden"
        } absolute inset-y-0 start-0 z-20 w-72 flex-col border-e border-line bg-surface shadow-raised md:static md:flex md:w-64 md:shadow-none`}
      >
        <div className="border-b border-line p-3">
          <Button onClick={handleNewConversation} size="sm" className="w-full">
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            {t("chat.newChat")}
          </Button>
          {newFailed ? <p className="mt-2 text-xs text-danger">{t("chat.newFailed")}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => handleSelectConversation(conv.id)}
              aria-current={conv.id === conversationId ? "true" : undefined}
              className={`w-full border-b border-line px-3 py-2.5 text-start text-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${
                conv.id === conversationId ? "bg-primary-soft text-primary-text" : "text-fg-secondary"
              }`}
            >
              <p className="truncate font-medium">{conv.title || t("chat.untitled")}</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {fmt.date(conv.updatedAt)}
                {conv._count?.messages ? ` · ${t("chat.msgCount", { count: conv._count.messages })}` : ""}
              </p>
            </button>
          ))}
          {conversations.length === 0 && <p className="py-8 text-center text-sm text-fg-muted">{t("chat.noConversations")}</p>}
        </div>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            aria-expanded={showSettings}
            className="text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          >
            {t("chat.settings")}
          </button>
          {showSettings && (
            <div className="mt-2 rounded-lg bg-surface-sunken p-2">
              <button type="button" onClick={handleRevoke} disabled={revoking} className="text-xs font-medium text-danger hover:underline">
                {revoking ? t("chat.revoking") : t("chat.revoke")}
              </button>
              <p className="mt-1 text-xs text-fg-muted">{t("chat.revokeNote")}</p>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              aria-expanded={showSidebar}
              aria-label={t("chat.toggleSidebar")}
              className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted md:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary-text">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">{t("chat.mara")}</p>
              <p className="text-xs text-fg-muted">{t("chat.maraRole")}</p>
            </div>
          </div>
          {remaining !== null && <span className="text-xs text-fg-muted">{t("chat.remaining", { count: remaining })}</span>}
        </div>

        <div
          ref={messagesContainerRef}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary-text">
                <Sparkles className="h-7 w-7" />
              </span>
              <h3 className="mb-1 text-lg font-semibold text-fg">{t("chat.hi")}</h3>
              <p className="mb-6 max-w-md text-sm text-fg-muted">{t("chat.intro")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setInput(t(key));
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-line bg-surface-sunken px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-success-line hover:bg-primary-soft hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => {
            const mine = msg.role === "USER";
            const failed = failedIds.has(msg.id);
            return (
              <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[75%] ${
                    mine
                      ? "rounded-ee-md bg-primary text-primary-fg"
                      : failed
                        ? "rounded-es-md border border-danger-line bg-danger-soft text-fg"
                        : "rounded-es-md bg-surface-muted text-fg"
                  }`}
                >
                  <span className="sr-only">{mine ? t("chat.you") : t("chat.mara")}: </span>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
                    {msg.content}
                  </p>
                  <p className={`mt-1 text-xs ${mine ? "text-primary-fg/80" : "text-fg-muted"}`}>{fmt.time(msg.createdAt)}</p>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-surface-muted px-4 py-3" role="status">
                <span className="sr-only">{t("chat.typing")}</span>
                <div className="flex gap-1" aria-hidden="true">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-fg-muted" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line px-4 py-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <label htmlFor="mara-input" className="sr-only">
              {t("chat.inputLabel")}
            </label>
            <textarea
              id="mara-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.placeholder")}
              rows={1}
              dir="auto"
              className="flex-1 resize-none rounded-xl border border-line-strong bg-surface-raised px-4 py-2.5 text-sm text-fg placeholder:text-fg-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-focus"
            />
            <Button type="submit" disabled={!input.trim() || sending} className="shrink-0 rounded-xl px-3.5" aria-label={t("chat.send")}>
              <SendHorizontal className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          </form>
          <p className="mt-2 text-center text-xs text-fg-muted">{t("chat.disclaimer", { brand: "Maralito Labs" })}</p>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useCandidateT();
  const { user, isLoading } = useAuth();
  const [consentData, setConsentData] = useState<ChatConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentError, setConsentError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptFailed, setAcceptFailed] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, router, locale]);

  const loadConsent = useCallback(() => {
    setConsentLoading(true);
    setConsentError(null);
    chat
      .getConsent()
      .then(setConsentData)
      .catch((err) => setConsentError(err))
      .finally(() => setConsentLoading(false));
  }, []);

  useEffect(() => {
    if (user) loadConsent();
  }, [user, loadConsent]);

  async function handleAcceptConsent() {
    setAccepting(true);
    setAcceptFailed(false);
    try {
      await chat.acceptConsent();
      setConsentData(await chat.getConsent());
    } catch {
      setAcceptFailed(true);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <CandidateBackLink href={localizePath("/candidate", locale)}>{t("ai.backToDashboard")}</CandidateBackLink>
      <CandidatePageHeader title={t("chat.title")} className="mb-6" />

      {isLoading || !user || consentLoading ? (
        <div className="rounded-2xl border border-line p-4">
          <Skeleton className="h-[50vh] w-full" />
        </div>
      ) : !consentData ? (
        <CandidateLoadError error={consentError} subject={t("chat.consent.loadSubject")} onRetry={loadConsent} />
      ) : !consentData.hasFullConsent ? (
        <ConsentPanel consentData={consentData} onAccept={handleAcceptConsent} loading={accepting} failed={acceptFailed} />
      ) : (
        <ChatInterface />
      )}
    </div>
  );
}
