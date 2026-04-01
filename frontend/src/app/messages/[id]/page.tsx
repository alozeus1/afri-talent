"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { messages, Message, MessageThread, trust } from "@/lib/api";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { localizePath, useLocale } from "@/lib/i18n/client";

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ThreadDetailPage() {
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const threadId = params.id as string;
  const { user, isLoading } = useAuth();
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [guidance, setGuidance] = useState<{
    headline: string;
    tips: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, locale, router]);

  useEffect(() => {
    if (user && threadId) {
      Promise.all([
        messages.thread(threadId),
        trust.messagingGuidance().catch(() => null),
      ])
        .then(([threadResponse, guidanceResponse]) => {
          setThread(threadResponse.thread);
          setThreadMessages(threadResponse.messages);
          setGuidance(guidanceResponse);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user, threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const body = newMessage.trim();
    if (!body || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const sent = await messages.sendMessage(threadId, body);
      setThreadMessages((prev) => [...prev, sent]);
      setNewMessage("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">Thread not found</p>
          <Link href={localizePath("/messages", locale)}>
            <Button>Back to Messages</Button>
          </Link>
        </div>
      </div>
    );
  }

  const otherParticipants = thread.participants.filter((p) => p.id !== user.id);
  const participantNames = otherParticipants.map((p) => p.name).join(", ") || "Unknown";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-4">
        <Link
          href={localizePath("/messages", locale)}
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          ← Back to Messages
        </Link>
      </div>

      {guidance && (
        <Card className="mb-4 border-blue-200 bg-blue-50/60">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-blue-900">{guidance.headline}</h2>
                <ul className="mt-2 space-y-1 text-sm text-blue-900">
                  {guidance.tips.slice(0, 2).map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
              <Link href={localizePath(`/trust/report?targetThreadId=${threadId}`, locale)}>
                <Button variant="outline" className="border-blue-300 text-blue-900 hover:bg-blue-100">
                  Report this conversation
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-col h-[calc(100vh-12rem)]">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-gray-900 truncate">
                {participantNames}
              </h1>
              {thread.job && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="info">{thread.job.title}</Badge>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
          {threadMessages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            threadMessages.map((msg) => {
              const isOwn = msg.senderId === user.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 ${
                      isOwn
                        ? "bg-emerald-600 text-white rounded-br-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md"
                    }`}
                  >
                    {!isOwn && (
                      <p className="text-xs font-medium text-emerald-700 mb-1">
                        {msg.sender.name}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isOwn ? "text-emerald-100" : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.createdAt)}
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
            {sendError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {sendError}
              </div>
            )}
            <form onSubmit={handleSend} className="flex gap-2 w-full">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                className="flex-1"
              />
              <Button type="submit" disabled={sending || !newMessage.trim()}>
                {sending ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  "Send"
                )}
              </Button>
            </form>
            <p className="text-xs text-gray-500">
              Keep hiring conversations on-platform and never send money, deposits, or verification fees.
            </p>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
