"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CompanyReview {
  id: string;
  companyName: string;
  reviewerName: string;
  rating: number;
  title: string;
  pros: string;
  cons: string;
  approved: boolean;
  createdAt: string;
}

interface ReviewsResponse {
  reviews: CompanyReview[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [reviews, setReviews] = useState<CompanyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);

  // Filters
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED">("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadReviews();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter, page]);

  const loadReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter === "PENDING") params.set("approved", "false");
      if (filter === "APPROVED") params.set("approved", "true");
      params.set("page", page.toString());
      const query = params.toString();

      const res = await fetch(`${API_URL}/api/admin/reviews${query ? `?${query}` : ""}`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch reviews");
      }

      const data: ReviewsResponse = await res.json();
      setReviews(data.reviews);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  const moderateReview = async (id: string, action: "approve" | "reject") => {
    setModerating(id);
    try {
      const res = await fetch(`${API_URL}/api/admin/reviews/${id}/moderate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Moderation failed");
      }

      // Refresh list
      await loadReviews();
    } catch (err) {
      console.error("Failed to moderate review:", err);
    } finally {
      setModerating(null);
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-sm ${star <= rating ? "text-yellow-400" : "text-gray-300"}`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Review Moderation</h1>
        <p className="text-gray-600">Review and moderate company reviews</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["ALL", "PENDING", "APPROVED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === f
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:border-emerald-400"
            }`}
          >
            {f === "ALL" ? "All Reviews" : f === "PENDING" ? "Pending" : "Approved"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✅</span>
              </div>
              <p className="text-gray-600">
                {filter === "PENDING"
                  ? "No pending reviews to moderate"
                  : filter === "APPROVED"
                  ? "No approved reviews yet"
                  : "No reviews found"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 text-lg">{review.companyName}</h3>
                      <Badge variant={review.approved ? "success" : "warning"}>
                        {review.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      {renderStars(review.rating)}
                      <span className="text-sm text-gray-500">by {review.reviewerName}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h4 className="font-medium text-gray-800 mb-2">{review.title}</h4>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Pros</p>
                    <p className="text-sm text-gray-600">{review.pros}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Cons</p>
                    <p className="text-sm text-gray-600">{review.cons}</p>
                  </div>
                </div>

                {!review.approved && (
                  <div className="flex gap-3 pt-3 border-t border-gray-100">
                    <Button
                      size="sm"
                      onClick={() => moderateReview(review.id, "approve")}
                      disabled={moderating === review.id}
                    >
                      {moderating === review.id ? "Processing..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => moderateReview(review.id, "reject")}
                      disabled={moderating === review.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
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
