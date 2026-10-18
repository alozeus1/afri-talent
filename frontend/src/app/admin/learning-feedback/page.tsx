"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { learning, type LearningFeedbackItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  Notice,
  PageHeader,
  Pill,
  SkeletonList,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

type Filter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminLearningFeedbackPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();
  const [feedback, setFeedback] = useState<LearningFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [moderating, setModerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await learning.feedback.list({ status: filter === "ALL" ? undefined : filter, limit: 50 });
      setFeedback(data.feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (id: string, action: "approve" | "reject") => {
    setModerating(id);
    setActionError(null);
    try {
      await learning.feedback.moderate(id, { action });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setModerating(null);
    }
  };

  const filters: Array<{ value: Filter; label: string }> = [
    { value: "PENDING", label: t("moderation.PENDING") },
    { value: "APPROVED", label: t("moderation.APPROVED") },
    { value: "REJECTED", label: t("moderation.REJECTED") },
    { value: "ALL", label: t("common.all") },
  ];

  return (
    <div>
      <PageHeader title={t("learning.title")} subtitle={t("learning.subtitle")} />
      <div className="mb-4">
        <FilterChips label={t("learning.filterLabel")} options={filters} value={filter} onChange={setFilter} />
      </div>

      {actionError && <Notice tone="error" onDismiss={() => setActionError(null)}>{actionError}</Notice>}

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : feedback.length === 0 ? (
        <EmptyState title={t("learning.empty")} />
      ) : (
        <ul className="space-y-3">
          {feedback.map((item) => (
            <li key={item.id} className="surface-panel rounded-2xl p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-semibold text-primary-text">
                      {item.avatarUrl ? (
                        <Image src={item.avatarUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
                      ) : (
                        <span aria-hidden>{initials(item.displayName)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-semibold ${strong}`}>{item.displayName}</p>
                      <p className={`text-xs ${muted}`}>{fmt.dateTime(item.createdAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Pill tone="blue">{item.areaSlug}</Pill>
                    <Pill tone={statusTone(item.status)}>{label("moderation", item.status)}</Pill>
                    {item.lessonTitle && <span className={`text-sm ${muted}`}>{item.lessonTitle}</span>}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-fg-secondary">{item.comment}</p>
                  <p className="mt-2 text-sm font-medium text-accent-text">{t("learning.rating", { rating: item.rating })}</p>
                </div>

                {item.status === "PENDING" && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => void moderate(item.id, "approve")} isLoading={moderating === item.id}>
                      {t("common.approve")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void moderate(item.id, "reject")} disabled={moderating === item.id}>
                      {t("common.reject")}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
