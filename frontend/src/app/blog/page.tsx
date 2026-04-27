"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function estimateReadTime(excerpt: string) {
  const words = excerpt.split(/\s+/).length;
  return Math.max(3, Math.ceil(words * 8)); // rough estimate based on excerpt
}

// ── Hero / Featured post ──────────────────────────────────────────────────────

function FeaturedPost({ post }: { post: BlogPost }) {
  return (
    <Link href={`/resources/${post.slug}`} className="block group">
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 min-h-[400px] flex flex-col justify-end">
        {post.coverImage && (
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            className="object-cover opacity-40 group-hover:opacity-50 transition-opacity duration-300"
            sizes="(max-width: 768px) 100vw, 1200px"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="relative p-8 md:p-12">
          <Badge className="bg-emerald-500 text-white border-0 mb-4">Latest Issue</Badge>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 leading-snug group-hover:text-emerald-200 transition-colors">
            {post.title}
          </h2>
          <p className="text-gray-300 text-base mb-4 max-w-2xl line-clamp-2">{post.excerpt}</p>
          <div className="flex items-center gap-4 text-gray-400 text-sm">
            {post.publishedAt && <span>{formatDate(post.publishedAt)}</span>}
            <span>·</span>
            <span>{estimateReadTime(post.excerpt)} min read</span>
            <span className="ml-2 text-emerald-400 group-hover:underline font-medium">
              Read now →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/resources/${post.slug}`} className="block group h-full">
      <Card className="h-full hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 overflow-hidden border-gray-200">
        <div className="relative h-48 bg-gradient-to-br from-emerald-50 to-teal-100 overflow-hidden">
          {post.coverImage ? (
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl opacity-30">📰</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="info" className="text-xs">Weekly Digest</Badge>
            {post.publishedAt && (
              <span className="text-xs text-gray-400">{formatDate(post.publishedAt)}</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug mb-2 group-hover:text-emerald-700 transition-colors line-clamp-2">
            {post.title}
          </h3>
          <p className="text-gray-500 text-sm line-clamp-3 leading-relaxed">{post.excerpt}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-gray-400">{estimateReadTime(post.excerpt)} min read</span>
            <span className="text-xs text-emerald-600 font-medium group-hover:underline">Read →</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BlogPage() {
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
      if (!res.ok) throw new Error("Failed to load blog posts");
      const data: BlogListResponse = await res.json();

      setPosts(data.resources);
      setPagination({ totalPages: data.pagination.totalPages, total: data.pagination.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load blog");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timeout = setTimeout(fetchPosts, search ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [fetchPosts, search]);

  const featured = page === 1 && !search ? posts[0] : null;
  const rest = featured ? posts.slice(1) : posts;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Page header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-emerald-600 font-semibold text-sm tracking-wide uppercase">
                  AfriTalent Blog
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3">
                Weekly Hiring Trends
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl">
                Every week, our AI research team curates the most important remote job market
                insights — fact-checked and tailored for African tech professionals.
              </p>
            </div>
            <div className="flex-shrink-0">
              <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {pagination.total}
                </div>
                <div className="text-sm text-emerald-600 dark:text-emerald-500 font-medium">
                  Issues published
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Search */}
        <div className="mb-8 max-w-md">
          <Input
            placeholder="Search blog posts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-white dark:bg-gray-800"
          />
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-4" />
            <p className="text-gray-400 text-sm">Loading insights...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📰</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {search ? "No matching posts" : "First issue coming soon"}
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              {search
                ? "Try a different search term."
                : "Our AI research team is preparing the first weekly hiring trends digest. Check back soon."}
            </p>
            {search && (
              <Button variant="outline" className="mt-4" onClick={() => setSearch("")}>
                Clear search
              </Button>
            )}
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
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Archive</h2>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  </div>
                )}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                  {rest.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                >
                  ← Previous
                </Button>
                <span className="flex items-center px-4 text-sm text-gray-600 dark:text-gray-300">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={page >= pagination.totalPages}
                  onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                >
                  Next →
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Newsletter/subscribe CTA */}
      <div className="bg-emerald-700 dark:bg-emerald-900 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Never miss a weekly digest
          </h2>
          <p className="text-emerald-200 mb-6 max-w-lg mx-auto">
            Every Monday, get the latest remote hiring trends, in-demand skills, and Africa-specific
            job market insights — delivered automatically.
          </p>
          <Link href="/register">
            <Button className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold px-8 py-3 text-base">
              Join AfriTalent free →
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
