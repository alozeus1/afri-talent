"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { learning, type LearningFeedbackItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FILTERS = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

export default function AdminLearningFeedbackPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [feedback, setFeedback] = useState<LearningFeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [moderating, setModerating] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      loadFeedback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  const loadFeedback = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await learning.feedback.list({
        status: filter === "ALL" ? undefined : (filter as "PENDING" | "APPROVED" | "REJECTED"),
        limit: 50,
      });
      setFeedback(data.feedback);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load learning feedback");
    } finally {
      setLoading(false);
    }
  };

  const moderate = async (id: string, action: "approve" | "reject") => {
    setModerating(id);
    try {
      await learning.feedback.moderate(id, {
        action,
      });
      await loadFeedback();
    } catch (moderateError) {
      setError(moderateError instanceof Error ? moderateError.message : "Failed to moderate feedback");
    } finally {
      setModerating(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Learning Feedback Moderation</h1>
        <p className="mt-2 text-gray-600">Approve or reject learner feedback before it appears on the Learn page.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              filter === item
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-emerald-400"
            }`}
          >
            {item === "ALL" ? "All feedback" : item === "PENDING" ? "Pending" : item === "APPROVED" ? "Approved" : "Rejected"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : feedback.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-gray-600">
            No feedback found for this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info">{item.areaSlug}</Badge>
                      <Badge
                        variant={
                          item.status === "APPROVED"
                            ? "success"
                            : item.status === "REJECTED"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {item.status}
                      </Badge>
                      {item.lessonTitle && <span className="text-sm text-gray-500">{item.lessonTitle}</span>}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                        {item.avatarUrl ? (
                          <img src={item.avatarUrl} alt={item.displayName} className="h-full w-full object-cover" />
                        ) : (
                          item.displayName
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">{item.displayName}</h2>
                        <p className="text-sm text-gray-500">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-gray-700">{item.comment}</p>
                    <p className="mt-2 text-sm font-medium text-amber-600">Rating: {item.rating}/5</p>
                  </div>

                  {item.status === "PENDING" && (
                    <div className="flex gap-3">
                      <Button
                        size="sm"
                        onClick={() => moderate(item.id, "approve")}
                        disabled={moderating === item.id}
                      >
                        {moderating === item.id ? "Processing..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => moderate(item.id, "reject")}
                        disabled={moderating === item.id}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
