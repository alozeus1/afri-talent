"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "REVIEWED";
  reviewNotes: string | null;
}

interface BlogListResponse {
  posts: BlogPost[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

type StatusFilter = "pending" | "published" | "all";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(post: BlogPost) {
  if (post.published) return <Badge variant="success">Published</Badge>;
  if (post.reviewStatus === "REJECTED") return <Badge variant="danger">Rejected</Badge>;
  return <Badge variant="warning">Pending Review</Badge>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminBlogPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [page, setPage] = useState(1);

  // Per-post action state
  const [acting, setActing] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: filter, page: page.toString(), limit: "12" });
      const res = await fetch(`${API_URL}/api/admin/blog?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch blog posts");
      const data: BlogListResponse = await res.json();
      setPosts(data.posts);
      setPagination({ page: data.pagination.page, totalPages: data.pagination.totalPages, total: data.pagination.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    if (user?.role === "ADMIN") loadPosts();
  }, [user, loadPosts]);

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/blog/${id}/approve`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Approval failed");
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string) => {
    const notes = rejectNotes[id]?.trim();
    if (!notes) {
      setError("Please provide rejection notes before rejecting");
      return;
    }
    setActing(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/blog/${id}/reject`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Rejection failed");
      setShowRejectForm(null);
      setRejectNotes((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActing(null);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    setTriggerMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/blog/trigger`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setTriggerMessage(data.message ?? "Pipeline triggered. Check back in a few minutes.");
    } catch {
      setTriggerMessage("Failed to trigger pipeline.");
    } finally {
      setTriggering(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Blog Automation</h1>
          <p className="text-gray-600 text-sm">Review AI-generated weekly blog posts before publication</p>
        </div>
        <div className="flex flex-col gap-2 items-start sm:items-end">
          <Button
            onClick={handleTrigger}
            disabled={triggering}
            variant="outline"
            size="sm"
          >
            {triggering ? "Triggering..." : "Trigger Pipeline Now"}
          </Button>
          {triggerMessage && (
            <p className="text-xs text-emerald-700 max-w-xs text-right">{triggerMessage}</p>
          )}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6">
        {(["pending", "published", "all"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:border-emerald-400"
            }`}
          >
            {f === "pending" ? "Pending Review" : f === "published" ? "Published" : "All"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📝</span>
            </div>
            <p className="text-gray-600 font-medium mb-2">
              {filter === "pending" ? "No posts awaiting review" : "No posts found"}
            </p>
            <p className="text-gray-400 text-sm">
              {filter === "pending"
                ? "Use \"Trigger Pipeline Now\" to generate a new post, or wait for the weekly schedule."
                : "Posts will appear here after the pipeline runs."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  {/* Cover image */}
                  {post.coverImage && (
                    <div className="relative w-full md:w-56 h-40 md:h-auto flex-shrink-0 bg-gray-100">
                      <Image
                        src={post.coverImage}
                        alt={post.title}
                        fill
                        className="object-cover"
                        sizes="224px"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(post)}
                        <Badge variant="info">Weekly Hiring Trends</Badge>
                      </div>
                      <span className="text-xs text-gray-400">
                        Generated {new Date(post.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric"
                        })}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-gray-900 mb-2 leading-snug">
                      {post.title}
                    </h2>

                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{post.excerpt}</p>

                    {post.reviewNotes && post.reviewStatus === "REJECTED" && (
                      <p className="text-xs text-red-600 bg-red-50 rounded p-2 mb-4">
                        <strong>Rejection notes:</strong> {post.reviewNotes}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 items-center">
                      <Link
                        href={`/resources/${post.slug}`}
                        target="_blank"
                        className="text-sm text-emerald-600 hover:text-emerald-700 underline"
                      >
                        Preview post →
                      </Link>

                      {!post.published && post.reviewStatus !== "REJECTED" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(post.id)}
                            disabled={acting === post.id}
                          >
                            {acting === post.id ? "Publishing..." : "Approve & Publish"}
                          </Button>

                          {showRejectForm !== post.id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setShowRejectForm(post.id); setError(null); }}
                            >
                              Reject
                            </Button>
                          ) : (
                            <div className="w-full flex flex-col gap-2 mt-2">
                              <textarea
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                rows={2}
                                placeholder="Rejection reason (required)..."
                                value={rejectNotes[post.id] ?? ""}
                                onChange={(e) =>
                                  setRejectNotes((prev) => ({ ...prev, [post.id]: e.target.value }))
                                }
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleReject(post.id)}
                                  disabled={acting === post.id}
                                >
                                  {acting === post.id ? "Rejecting..." : "Confirm Reject"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setShowRejectForm(null); setError(null); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {post.published && post.publishedAt && (
                        <span className="text-xs text-gray-400">
                          Published {new Date(post.publishedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-gray-600">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
