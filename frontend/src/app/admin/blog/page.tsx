"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { adminBlog, type BlogPost } from "@/lib/api";
import type { Pagination } from "@/lib/admin-console-api";
import { Button } from "@/components/ui/button";
import { useAdminHref } from "@/components/admin/admin-shell";
import { useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  ConfirmDialog,
  ConfirmRequest,
  EmptyState,
  ErrorState,
  FilterChips,
  Notice,
  PageHeader,
  PaginationBar,
  Pill,
  SkeletonList,
  linkClass,
  muted,
  strong,
} from "@/components/admin/console-ui";

type StatusFilter = "pending" | "published" | "all";

export default function AdminBlogPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [pagination, setPagination] = useState<Pagination | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminBlog.list({ status: filter, page, limit: 12 });
      setPosts(data.posts);
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

  const approve = async (post: BlogPost) => {
    setActing(post.id);
    setNotice(null);
    try {
      await adminBlog.approve(post.id);
      setNotice({ tone: "success", text: t("blog.published") });
      await load();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : t("common.error") });
    } finally {
      setActing(null);
    }
  };

  const askReject = (post: BlogPost) =>
    setConfirm({
      title: t("blog.rejectTitle", { title: post.title }),
      description: t("blog.rejectHelp"),
      confirmLabel: t("common.reject"),
      danger: true,
      onConfirm: async ({ reason }) => {
        await adminBlog.reject(post.id, reason);
        setNotice({ tone: "success", text: t("blog.rejected") });
        await load();
      },
    });

  const trigger = async () => {
    setTriggering(true);
    setNotice(null);
    try {
      await adminBlog.trigger();
      setNotice({ tone: "success", text: t("blog.triggered") });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : t("blog.triggerFailed") });
    } finally {
      setTriggering(false);
    }
  };

  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: "pending", label: t("blog.pendingReview") },
    { value: "published", label: t("blog.statusPublished") },
    { value: "all", label: t("common.all") },
  ];

  return (
    <div>
      <PageHeader
        title={t("blog.title")}
        subtitle={t("blog.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => void trigger()} isLoading={triggering}>
            {t("blog.trigger")}
          </Button>
        }
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="mb-4">
        <FilterChips
          label={t("blog.filterLabel")}
          options={filters}
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <SkeletonList />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : posts.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? t("blog.emptyPending") : t("blog.empty")}
          description={filter === "pending" ? t("blog.emptyPendingHelp") : t("blog.emptyHelp")}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {posts.map((post) => {
              const rejected = post.reviewStatus === "REJECTED";
              return (
                <li key={post.id} className="surface-panel overflow-hidden rounded-2xl">
                  <div className="flex flex-col md:flex-row">
                    {post.coverImage && (
                      <div className="relative h-40 w-full shrink-0 bg-surface-muted md:h-auto md:w-56">
                        <Image src={post.coverImage} alt="" fill className="object-cover" sizes="(min-width: 768px) 224px, 100vw" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={post.published ? "green" : rejected ? "red" : "amber"}>
                            {post.published ? t("blog.statusPublished") : rejected ? t("moderation.REJECTED") : t("blog.pendingReview")}
                          </Pill>
                          <Pill tone="blue">{t("blog.series")}</Pill>
                        </div>
                        <span className={`text-xs ${muted}`}>{t("blog.generated", { date: fmt.date(post.createdAt) })}</span>
                      </div>

                      <h2 className={`mt-3 text-lg font-semibold leading-snug ${strong}`}>{post.title}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">{post.excerpt}</p>

                      {post.reviewNotes && rejected && (
                        <p className="mt-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg">
                          <span className="font-semibold">{t("blog.rejectionNotes")}</span> {post.reviewNotes}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link href={href(`/resources/${post.slug}`)} target="_blank" rel="noopener noreferrer" className={`text-sm ${linkClass}`}>
                          {t("blog.previewPost")}
                        </Link>
                        {!post.published && !rejected && (
                          <>
                            <Button size="sm" onClick={() => void approve(post)} isLoading={acting === post.id}>
                              {t("blog.approvePublish")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => askReject(post)} disabled={acting === post.id}>
                              {t("common.reject")}
                            </Button>
                          </>
                        )}
                        {post.published && post.publishedAt && (
                          <span className={`text-xs ${muted}`}>{t("blog.publishedOn", { date: fmt.date(post.publishedAt) })}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {pagination && pagination.totalPages > 1 && <PaginationBar pagination={pagination} onPage={setPage} />}
        </>
      )}

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
