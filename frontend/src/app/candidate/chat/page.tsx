"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  chat,
  ChatConsentStatus,
  ChatMessageData,
  ChatConversation,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Consent Modal ────────────────────────────────────────────────────────────

function ConsentModal({
  consentData,
  onAccept,
  loading,
}: {
  consentData: ChatConsentStatus;
  onAccept: () => void;
  loading: boolean;
}) {
  const [checks, setChecks] = useState({
    privacyNotice: false,
    termsOfUse: false,
    dataStorage: false,
  });

  const allChecked = checks.privacyNotice && checks.termsOfUse && checks.dataStorage;
  const { policies } = consentData;

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Meet Mara, Your AI Job Assistant
            </h2>
            <p className="text-gray-600">
              Before we get started, please review and accept the following agreements.
              Your privacy matters to us.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {/* Privacy Notice */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={checks.privacyNotice}
                onChange={(e) => setChecks({ ...checks, privacyNotice: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{policies.privacyNotice.title}</p>
                <p className="text-sm text-gray-600 mt-1">{policies.privacyNotice.summary}</p>
                <span className="text-xs text-gray-400 mt-1 block">Version {policies.privacyNotice.version}</span>
              </div>
            </label>

            {/* Terms of Use */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={checks.termsOfUse}
                onChange={(e) => setChecks({ ...checks, termsOfUse: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{policies.termsOfUse.title}</p>
                <p className="text-sm text-gray-600 mt-1">{policies.termsOfUse.summary}</p>
                <span className="text-xs text-gray-400 mt-1 block">Version {policies.termsOfUse.version}</span>
              </div>
            </label>

            {/* Data Storage */}
            <label className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-emerald-300 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={checks.dataStorage}
                onChange={(e) => setChecks({ ...checks, dataStorage: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="flex-1">
                <p className="font-medium text-gray-900">{policies.dataStorage.title}</p>
                <p className="text-sm text-gray-600 mt-1">{policies.dataStorage.summary}</p>
                <span className="text-xs text-gray-400 mt-1 block">Version {policies.dataStorage.version}</span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <Link href="/candidate" className="text-sm text-gray-500 hover:text-gray-700">
              Back to dashboard
            </Link>
            <Button onClick={onAccept} disabled={!allChecked || loading}>
              {loading ? "Accepting..." : "Accept & Start Chatting"}
            </Button>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            You can revoke consent at any time from the chat settings. This will delete all stored conversations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Chat Interface ───────────────────────────────────────────────────────────

function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

    const frame = requestAnimationFrame(() => {
      scrollToBottom(behavior);
      messagesEndRef.current?.scrollIntoView({ behavior });
    });

    previousMessageCountRef.current = currentCount;
    return () => cancelAnimationFrame(frame);
  }, [messages, sending, conversationId, scrollToBottom]);

  // Load conversations list
  useEffect(() => {
    chat.getHistory().then((res) => {
      if (res.conversations) setConversations(res.conversations);
    }).catch(() => {});
  }, []);

  // Load active conversation messages
  useEffect(() => {
    if (!conversationId) return;
    chat.getHistory(conversationId).then((res) => {
      if (res.messages) setMessages(res.messages);
    }).catch(() => {});
  }, [conversationId]);

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
      setMessages((prev) => [...prev.filter((m) => m.id !== userMsg.id), { ...userMsg, id: `user-${Date.now()}` }, res.message]);
      setConversationId(res.conversationId);
      setRemaining(res.remaining);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to send message";
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "ASSISTANT", content: `Sorry, I encountered an error: ${errorMsg}`, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleNewConversation() {
    try {
      const res = await chat.newConversation();
      setConversationId(res.conversation.id);
      setMessages([]);
      setConversations((prev) => [res.conversation, ...prev]);
      setShowSidebar(false);
    } catch {
      // ignore
    }
  }

  async function handleSelectConversation(id: string) {
    setMessages([]);
    setInput("");
    setConversationId(id);
    setShowSidebar(false);
  }

  async function handleRevoke() {
    if (!confirm("This will permanently delete all your chat data. Are you sure?")) return;
    setRevoking(true);
    try {
      await chat.revokeConsent();
      window.location.reload();
    } catch {
      setRevoking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <div className={`${showSidebar ? "block" : "hidden"} md:block w-64 border-r border-gray-200 dark:border-gray-800 flex-shrink-0 flex flex-col`}>
        <div className="p-3 border-b border-gray-100 dark:border-gray-800">
          <Button onClick={handleNewConversation} size="sm" className="w-full">
            + New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${
                conv.id === conversationId ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <p className="truncate font-medium">{conv.title || "New conversation"}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {new Date(conv.updatedAt).toLocaleDateString()}
                {conv._count?.messages ? ` · ${conv._count.messages} msgs` : ""}
              </p>
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No conversations yet</p>
          )}
        </div>
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Settings & Privacy
          </button>
          {showSettings && (
            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                {revoking ? "Revoking..." : "Revoke Consent & Delete Data"}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">This deletes all chat history permanently.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSidebar(!showSidebar)} className="md:hidden text-gray-500 dark:text-gray-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="text-emerald-600 font-bold text-sm">M</span>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">Mara</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">AI Job Assistant</p>
            </div>
          </div>
          {remaining !== null && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{remaining} messages remaining today</span>
          )}
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">👋</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Hi! I&apos;m Mara</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mb-6">
                Your personal AI job assistant. I know your profile, applications, and job searches.
                Ask me anything about your career journey!
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "What's the status of my applications?",
                  "How can I improve my profile?",
                  "What should I do next?",
                  "Help me prepare for interviews",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                msg.role === "USER"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className={`text-xs mt-1 ${msg.role === "USER" ? "text-emerald-200" : "text-gray-400 dark:text-gray-500"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Mara anything about your job search..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              style={{ maxHeight: "120px" }}
            />
            <Button onClick={handleSend} disabled={!input.trim() || sending} size="sm" className="shrink-0 rounded-xl px-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </Button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
            Powered by <span className="font-semibold text-gray-500 dark:text-gray-300">Maralito Labs</span> · AI responses may not always be accurate
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [consentData, setConsentData] = useState<ChatConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "CANDIDATE")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    chat.getConsent()
      .then((data) => { setConsentData(data); setConsentLoading(false); })
      .catch(() => setConsentLoading(false));
  }, [user]);

  async function handleAcceptConsent() {
    setAccepting(true);
    try {
      await chat.acceptConsent();
      const updated = await chat.getConsent();
      setConsentData(updated);
    } catch {
      // ignore
    } finally {
      setAccepting(false);
    }
  }

  if (isLoading || !user || consentLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <Skeleton className="h-[50vh] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/candidate"
          className="inline-flex items-center text-sm text-emerald-600 hover:text-emerald-700 mb-3"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Job Assistant</h1>
      </div>

      {/* Show consent or chat */}
      {!consentData?.hasFullConsent ? (
        <ConsentModal
          consentData={consentData!}
          onAccept={handleAcceptConsent}
          loading={accepting}
        />
      ) : (
        <ChatInterface />
      )}
    </div>
  );
}
