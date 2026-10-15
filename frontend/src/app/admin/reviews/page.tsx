"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAPI } from "@/lib/api";
import { adminReviews } from "@/lib/api/support";
import { Button } from "@/components/ui/button";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import type { Pagination } from "@/lib/admin-console-api";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  Notice,
  PageHeader,
  PaginationBar,
  Pill,
  SkeletonList,
  muted,
  strong,
} from "@/components/admin/console-ui";

interface CompanyReview {
  id: string;
  companyName: string;
  reviewerName: string;
  rating: number;
  title: string;
  pros: string;
  cons: string;
  approved: boolean;
  moderationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

type ReviewFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} aria-hidden className={`text-sm ${star <= rating ? "text-accent-text" : "text-line-strong"}`}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const [reviews, setReviews] = useState<CompanyReview[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("PENDING");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filter !== "ALL") params.set("status", filter.toLowerCase());
      const data = await fetchAPI<{ reviews: CompanyReview[]; pagination: Pagination }>(`/api/admin/reviews?${params}`);
      setReviews(data.reviews);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [filter, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (id: string, action: "approve" | "reject") => {
    setModerating(id);
    setActionError(null);
    try {
      // Shared client attaches the CSRF token; approval also recomputes the
      // company's ratings server-side.
      await adminReviews.moderate(id, action);
      await load();
    } catch (err) {
      setActionError(t("reviews.moderationFailed", { error: err instanceof Error ? err.message : t("common.error") }));
    } finally {
      setModerating(null);
    }
  };

  const filters: Array<{ value: ReviewFilter; label: string }> = [
    { value: "PENDING", label: t("moderation.PENDING") },
    { value: "APPROVED", label: t("moderation.APPROVED") },
    { value: "REJECTED", label: t("moderation.REJECTED") },
    { value: "ALL", label: t("common.all") },
  ];

  const emptyKey = {
    PENDING: "reviews.emptyPending",
    APPROVED: "reviews.emptyApproved",
    REJECTED: "reviews.emptyRejected",
    ALL: "reviews.empty",
  } as const;

  return (
    <div>
      <PageHeader title={t("reviews.title")} subtitle={t("reviews.subtitle")} />
      <div className="mb-4">
        <FilterChips
          label={t("reviews.filterLabel")}
          options={filters}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
        />
      </div>

      {actionError && <Notice tone="error" onDismiss={() => setActionError(null)}>{actionError}</Notice>}

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : reviews.length === 0 ? (
        <EmptyState title={t(emptyKey[filter])} />
      ) : (
        <>
          <ul className="space-y-3">
            {reviews.map((review) => {
              const status = review.approved ? "APPROVED" : review.moderationStatus === "REJECTED" ? "REJECTED" : "PENDING";
              return (
                <li key={review.id} className="surface-panel rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={`text-base font-semibold ${strong}`}>{review.companyName}</h2>
                        <Pill tone={status === "APPROVED" ? "green" : status === "REJECTED" ? "red" : "amber"}>
                          {t(`moderation.${status}`)}
                        </Pill>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Stars rating={review.rating} label={t("reviews.ratingLabel", { rating: review.rating })} />
                        <span className={`text-sm ${muted}`}>{t("reviews.by", { name: review.reviewerName })}</span>
                      </div>
                    </div>
                    <span className={`text-xs ${muted}`}>{fmt.date(review.createdAt)}</span>
                  </div>

                  <h3 className={`mt-3 font-medium ${strong}`}>{review.title}</h3>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-success-line bg-success-soft p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-success">{t("reviews.pros")}</p>
                      <p className="mt-1 text-sm text-fg-secondary">{review.pros}</p>
                    </div>
                    <div className="rounded-xl border border-danger-line bg-danger-soft p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-danger">{t("reviews.cons")}</p>
                      <p className="mt-1 text-sm text-fg-secondary">{review.cons}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    {!review.approved && (
                      <Button size="sm" onClick={() => void moderate(review.id, "approve")} isLoading={moderating === review.id}>
                        {t("common.approve")}
                      </Button>
                    )}
                    {review.moderationStatus !== "REJECTED" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void moderate(review.id, "reject")}
                        disabled={moderating === review.id}
                      >
                        {review.approved ? t("reviews.unpublish") : t("common.reject")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {pagination && pagination.totalPages > 1 && <PaginationBar pagination={pagination} onPage={setPage} />}
        </>
      )}
    </div>
  );
}
