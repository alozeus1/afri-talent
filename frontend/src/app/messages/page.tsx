"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flag, Inbox, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { messages, MessageThread, trust } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CandidateLoadError, CandidatePageHeader, CandidateSpinner } from "@/components/candidate/candidate-ui";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateFormatters, useCandidateT } from "@/lib/i18n/candidate-messages";

export default function MessagesPage() {
  const locale = useLocale();
  const t = useCandidateT();
  const fmt = useCandidateFormatters();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [guidance, setGuidance] = useState<{ headline: string; tips: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(localizePath("/login", locale));
    }
  }, [user, isLoading, locale, router]);

  const loadThreads = useCallback(() => {
    Promise.all([messages.threads(), trust.messagingGuidance().catch(() => null)])
      .then(([threadData, guidanceData]) => {
        setThreads(threadData.threads);
        setGuidance(guidanceData);
      })
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, []);

  const retryLoadThreads = () => {
    setLoading(true);
    setLoadError(null);
    loadThreads();
  };

  const userId = user?.id;
  useEffect(() => {
    if (userId) loadThreads();
  }, [userId, loadThreads]);

  if (isLoading || !user) {
    return <CandidateSpinner className="py-24" />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <CandidatePageHeader title={t("msg.title")} description={t("msg.subtitle")} />

      {guidance && (
        <Card className="mb-8 border-info-line bg-info-soft">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-semibold text-fg">{guidance.headline}</h2>
                  <ul className="mt-3 grid list-disc gap-2 ps-5 text-sm text-fg-secondary md:grid-cols-2">
                    {guidance.tips.slice(0, 8).map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link href={localizePath("/trust/report", locale)} className="shrink-0">
                <Button variant="outline" size="sm">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  {t("msg.report")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-fg">{t("msg.all")}</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CandidateSpinner className="py-8" />
          ) : loadError ? (
            <CandidateLoadError error={loadError} subject={t("msg.subject")} onRetry={retryLoadThreads} />
          ) : threads.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent"
              icon={<Inbox className="h-6 w-6" />}
              title={t("msg.empty")}
              description={t("msg.emptyBody")}
            />
          ) : (
            <ul className="-mx-6 divide-y divide-line">
              {threads.map((thread) => {
                const otherParticipants = thread.participants.filter((p) => p.id !== user.id);
                const participantNames = otherParticipants.map((p) => p.name).join(", ") || t("msg.unknown");
                return (
                  <li key={thread.id}>
                    <Link
                      href={localizePath(`/messages/${thread.id}`, locale)}
                      className="block px-6 py-4 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-fg">{participantNames}</span>
                            {thread.job && <Badge variant="info">{thread.job.title}</Badge>}
                          </div>
                          {thread.lastMessage ? (
                            <p className="truncate text-sm text-fg-secondary">
                              {thread.lastMessage.sender.id === user.id && (
                                <span className="text-fg-muted">{t("msg.you")} </span>
                              )}
                              {thread.lastMessage.body}
                            </p>
                          ) : (
                            <p className="text-sm italic text-fg-muted">{t("msg.empty")}</p>
                          )}
                        </div>
                        <time dateTime={thread.updatedAt} className="shrink-0 whitespace-nowrap text-xs text-fg-muted">
                          {fmt.relative(thread.updatedAt)}
                        </time>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
