"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { messages, MessageThread, trust } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { localizePath, useLocale } from "@/lib/i18n/client";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function MessagesPage() {
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [guidance, setGuidance] = useState<{
    headline: string;
    tips: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, locale, router]);

  useEffect(() => {
    if (user) {
      Promise.all([
        messages.threads(),
        trust.messagingGuidance().catch(() => null),
      ])
        .then(([threadData, guidanceData]) => {
          setThreads(threadData.threads);
          setGuidance(guidanceData);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Messages</h1>
        <p className="text-gray-600">Your conversations</p>
      </div>

      {guidance && (
        <Card className="mb-8 border-blue-200 bg-blue-50/60">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-blue-900">{guidance.headline}</h2>
                <ul className="mt-3 grid gap-2 text-sm text-blue-900 md:grid-cols-2">
                  {guidance.tips.slice(0, 8).map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
              <Link href={localizePath("/trust/report", locale)}>
                <span className="inline-flex min-h-10 items-center rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100">
                  Report suspicious behavior
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">All Conversations</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
              <p className="text-gray-600">No messages yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Messages from job applications will appear here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {threads.map((thread) => {
                const otherParticipants = thread.participants.filter(
                  (p) => p.id !== user.id
                );
                const participantNames =
                  otherParticipants.map((p) => p.name).join(", ") || "Unknown";

                return (
                  <Link
                    key={thread.id}
                    href={localizePath(`/messages/${thread.id}`, locale)}
                    className="block py-4 hover:bg-gray-50 -mx-6 px-6 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {participantNames}
                          </span>
                          {thread.job && (
                            <Badge variant="info">{thread.job.title}</Badge>
                          )}
                        </div>
                        {thread.lastMessage ? (
                          <p className="text-sm text-gray-600 truncate">
                            {thread.lastMessage.sender.id === user.id && (
                              <span className="text-gray-400">You: </span>
                            )}
                            {thread.lastMessage.body}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No messages yet</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                        {timeAgo(thread.updatedAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
