"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicT } from "@/lib/i18n/public-messages";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const BLOG_CATEGORY = "Weekly Hiring Trends";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage?: string;
  publishedAt?: string;
  category: string;
  readMinutes?: number;
}

interface BlogListResponse {
  resources: BlogPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readTime(post: BlogPost, tp: PublicT) {
  // API-computed from full content; digests average ~4 min
  return tp("guides.blog.readTime", { count: post.readMinutes ?? 4 });
}

// ── Hero / Featured post ──────────────────────────────────────────────────────

function FeaturedPost({ post }: { post: BlogPost }) {
  const tp = usePublicT();
  const locale = useLocale();
  return (
    <Link
      href={localizePath(`/resources/${post.slug}`, locale)}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <div className="relative flex min-h-[400px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900">
        {post.coverImage && (
          <Image
            src={post.coverImage}
            alt=""
            fill
            className="object-cover opacity-40 transition-opacity duration-300 group-hover:opacity-50"
            sizes="(max-width: 768px) 100vw, 1200px"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden="true" />
        <div className="relative p-8 md:p-12">
          <Badge className="mb-4 border-0 bg-emerald-500 text-white">{tp("guides.blog.latest")}</Badge>
          <h2 className="mb-3 text-2xl font-bold leading-snug text-white transition-colors group-hover:text-emerald-200 md:text-3xl">
            {post.title}
          </h2>
          <p className="mb-4 line-clamp-2 max-w-2xl text-base text-zinc-200">{post.excerpt}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
            {post.publishedAt && <span>{formatDate(post.publishedAt, locale)}</span>}
            <span aria-hidden="true">·</span>
            <span>{readTime(post, tp)}</span>
            <span className="inline-flex items-center gap-1 font-medium text-emerald-300 group-hover:underline">
              {tp("guides.blog.readNow")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: BlogPost }) {
  const tp = usePublicT();
  const locale = useLocale();
  return (
    <Link
      href={localizePath(`/resources/${post.slug}`, locale)}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Card className="h-full overflow-hidden border-line transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-raised">
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-emerald-500/10 to-teal-500/20">
          {post.coverImage ? (
            <Image
              src={post.coverImage}
              alt=""
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Newspaper className="h-10 w-10 text-primary-text opacity-40" aria-hidden="true" />
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="info" className="text-xs">
              {tp("guides.blog.digest")}
            </Badge>
            {post.publishedAt && <span className="text-xs text-fg-muted">{formatDate(post.publishedAt, locale)}</span>}
          </div>
          <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-fg transition-colors group-hover:text-primary-text">
            {post.title}
          </h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-fg-muted">{post.excerpt}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-fg-muted">{readTime(post, tp)}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-text group-hover:underline">
              {tp("guides.blog.read")}
              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlogPage() {
  const tp = usePublicT();
  const locale = useLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const LIMIT = 9;

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category: BLOG_CATEGORY,
        page: page.toString(),
        limit: LIMIT.toString(),
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`${API_URL}/api/resources?${params}`);
      if (!res.ok) throw new Error(tp("guides.blog.loadError"));
      const data: BlogListResponse = await res.json();

      setPosts(data.resources);
      setPagination({ totalPages: data.pagination.totalPages, total: data.pagination.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : tp("guides.blog.loadError"));
    } finally {
      setLoading(false);
    }
  }, [search, page, tp]);

  useEffect(() => {
    const timeout = setTimeout(fetchPosts, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchPosts, search]);

  const featured = page === 1 && !search ? posts[0] : null;
  const rest = featured ? posts.slice(1) : posts;

  const goToPage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Page header */}
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-text">{tp("guides.blog.eyebrow")}</p>
              <h1 className="font-display mb-3 text-4xl font-bold tracking-tight text-fg md:text-5xl">{tp("guides.blog.title")}</h1>
              <p className="max-w-xl text-lg text-fg-secondary">{tp("guides.blog.subtitle")}</p>
            </div>
            <div className="flex-shrink-0">
              <div className="rounded-xl border border-success-line bg-success-soft p-4 text-center">
                <div className="text-3xl font-bold text-primary-text">{pagination.total}</div>
                <div className="text-sm font-medium text-fg-secondary">{tp("guides.blog.issues")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="mb-8 max-w-md">
          <Input
            type="search"
            aria-label={tp("guides.blog.search")}
            placeholder={tp("guides.blog.search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {error && (
          <div role="alert" className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-danger">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchPosts()}>
              {tp("site.error.retry")}
            </Button>
          </div>
        )}

        {loading ? (
          <div role="status" aria-busy="true" aria-label={tp("guides.blog.loading")} className="space-y-6">
            <div className="h-[400px] animate-pulse rounded-2xl bg-surface-muted" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-72 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          </div>
        ) : posts.length === 0 && search ? (
          <div className="py-20 text-center">
            <Newspaper className="mx-auto mb-4 h-12 w-12 text-fg-muted" aria-hidden="true" />
            <h2 className="mb-2 text-2xl font-bold text-fg">{tp("guides.blog.noMatch")}</h2>
            <p className="mx-auto max-w-md text-fg-muted">{tp("guides.blog.noMatchBody")}</p>
            <Button variant="outline" className="mt-4" onClick={() => setSearch("")}>
              {tp("guides.blog.clear")}
            </Button>
          </div>
        ) : posts.length === 0 && !error ? (
          <div className="py-20 text-center">
            <div className="mx-auto max-w-md">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
                <Newspaper className="h-8 w-8 text-primary-text" aria-hidden="true" />
              </div>
              <h2 className="mb-3 text-xl font-semibold text-fg">{tp("guides.blog.soonTitle")}</h2>
              <p className="mb-6 text-fg-secondary">{tp("guides.blog.soonBody")}</p>
              <Link href={localizePath("/resources", locale)}>
                <Button variant="outline">{tp("guides.blog.browseResources")}</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Featured post */}
            {featured && (
              <div className="mb-10">
                <FeaturedPost post={featured} />
              </div>
            )}

            {/* Archive grid */}
            {rest.length > 0 && (
              <>
                {featured && (
                  <div className="mb-6 flex items-center gap-4">
                    <h2 className="text-xl font-bold text-fg">{tp("guides.blog.archive")}</h2>
                    <div className="h-px flex-1 bg-line" aria-hidden="true" />
                  </div>
                )}
                <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <nav aria-label={tp("guides.blog.pagination")} className="flex justify-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                  <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  {tp("discover.page.previous")}
                </Button>
                <span className="flex items-center px-4 text-sm text-fg-secondary">
                  {tp("discover.page.of", { page, total: pagination.totalPages })}
                </span>
                <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => goToPage(page + 1)}>
                  {tp("discover.page.next")}
                  <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      {/* Newsletter/subscribe CTA */}
      <div className="mt-16 bg-emerald-800">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="mb-3 text-2xl font-bold text-white md:text-3xl">{tp("guides.blog.ctaTitle")}</h2>
          <p className="mx-auto mb-6 max-w-lg text-emerald-100">{tp("guides.blog.ctaBody")}</p>
          <Link href={localizePath("/register", locale)}>
            <Button className="bg-white px-8 py-3 text-base font-semibold text-emerald-800 hover:bg-emerald-50 dark:bg-white dark:text-emerald-800 dark:hover:bg-emerald-50">
              {tp("guides.blog.ctaButton")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
