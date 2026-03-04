"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CompanyRatingAggregate {
  averageOverall: number;
  averageCulture: number;
  averageSalary: number;
  averageWorkLife: number;
  averageManagement: number;
  averageGrowth: number;
  reviewCount: number;
}

interface CompanyReview {
  id: string;
  overallRating: number;
  cultureRating: number;
  salaryRating: number;
  workLifeRating: number;
  managementRating: number;
  growthRating: number;
  pros: string;
  cons: string;
  jobTitle: string | null;
  createdAt: string;
}

interface CompanyDetail {
  id: string;
  companyName: string;
  industry: string | null;
  headquarters: string | null;
  website: string | null;
  size: string | null;
  bio: string | null;
  hiresFromAfrica: boolean;
  verified: boolean;
  visaTrustScore: number | null;
  ratingAggregate: CompanyRatingAggregate | null;
  reviews: CompanyReview[];
}

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sizeClass} ${
            star <= Math.round(rating) ? "text-yellow-400" : "text-gray-300"
          }`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-gray-600">{rating.toFixed(1)}</span>
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const percentage = (value / 5) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-emerald-500 h-2.5 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 w-8 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default function CompanyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review form state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    overallRating: 5,
    cultureRating: 5,
    salaryRating: 5,
    workLifeRating: 5,
    managementRating: 5,
    growthRating: 5,
    pros: "",
    cons: "",
    jobTitle: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/companies/${id}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load company");
        const json: CompanyDetail = await res.json();
        setCompany(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load company");
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchCompany();
  }, [id]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`${API_URL}/api/companies/${id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(reviewForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to submit review" }));
        throw new Error(body.error || "Failed to submit review");
      }
      // Refresh company data
      const updated = await fetch(`${API_URL}/api/companies/${id}`, {
        credentials: "include",
      });
      if (updated.ok) {
        setCompany(await updated.json());
      }
      setShowReviewForm(false);
      setReviewForm({
        overallRating: 5,
        cultureRating: 5,
        salaryRating: 5,
        workLifeRating: 5,
        managementRating: 5,
        growthRating: 5,
        pros: "",
        cons: "",
        jobTitle: "",
      });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          {error || "Company not found"}
        </div>
        <Link href="/companies" className="mt-4 inline-block text-emerald-600 hover:underline">
          ← Back to companies
        </Link>
      </div>
    );
  }

  const ratings = company.ratingAggregate;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/companies" className="text-emerald-600 hover:underline text-sm mb-6 inline-block">
        ← Back to companies
      </Link>

      {/* Company Header */}
      <Card className="mb-8">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{company.companyName}</h1>
                {company.verified && <Badge variant="info">Verified</Badge>}
              </div>
              {company.industry && (
                <p className="text-gray-600 mb-1">{company.industry}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mb-3">
                {company.size && <span>👥 {company.size}</span>}
                {company.headquarters && <span>📍 {company.headquarters}</span>}
              </div>
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline text-sm"
                >
                  {company.website}
                </a>
              )}
              {company.bio && (
                <p className="text-gray-600 mt-3">{company.bio}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              {company.hiresFromAfrica && (
                <Badge variant="success">Hires from Africa</Badge>
              )}
              {company.visaTrustScore != null && company.visaTrustScore > 0 && (
                <Badge variant="info">
                  Visa Trust Score: {company.visaTrustScore}/10
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Rating Breakdown */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Ratings</h2>
            </CardHeader>
            <CardContent>
              {ratings && ratings.reviewCount > 0 ? (
                <div className="space-y-4">
                  <div className="text-center mb-4">
                    <div className="text-4xl font-bold text-gray-900 mb-1">
                      {ratings.averageOverall.toFixed(1)}
                    </div>
                    <StarRating rating={ratings.averageOverall} />
                    <p className="text-sm text-gray-500 mt-1">
                      {ratings.reviewCount} review{ratings.reviewCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <RatingBar label="Culture" value={ratings.averageCulture} />
                    <RatingBar label="Salary" value={ratings.averageSalary} />
                    <RatingBar label="Work-Life" value={ratings.averageWorkLife} />
                    <RatingBar label="Management" value={ratings.averageManagement} />
                    <RatingBar label="Growth" value={ratings.averageGrowth} />
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No reviews yet</p>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Link href={`/jobs?company=${company.id}`}>
              <Button variant="outline" className="w-full">
                View Jobs by {company.companyName}
              </Button>
            </Link>
          </div>
        </div>

        {/* Reviews */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
                {user && user.role === "CANDIDATE" && !showReviewForm && (
                  <Button size="sm" onClick={() => setShowReviewForm(true)}>
                    Write a Review
                  </Button>
                )}
                {!user && (
                  <Link href="/login">
                    <Button size="sm" variant="outline">
                      Log in to Review
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Review Form */}
              {showReviewForm && (
                <form onSubmit={handleSubmitReview} className="mb-8 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-4">Write Your Review</h3>

                  {reviewError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                      {reviewError}
                    </div>
                  )}

                  <div className="mb-4">
                    <Input
                      label="Job Title (optional)"
                      value={reviewForm.jobTitle}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, jobTitle: e.target.value })
                      }
                      placeholder="e.g. Software Engineer"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    {(
                      [
                        ["overallRating", "Overall"],
                        ["cultureRating", "Culture"],
                        ["salaryRating", "Salary"],
                        ["workLifeRating", "Work-Life"],
                        ["managementRating", "Management"],
                        ["growthRating", "Growth"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {label} Rating
                        </label>
                        <select
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          value={reviewForm[key]}
                          onChange={(e) =>
                            setReviewForm({
                              ...reviewForm,
                              [key]: parseInt(e.target.value),
                            })
                          }
                        >
                          {[1, 2, 3, 4, 5].map((v) => (
                            <option key={v} value={v}>
                              {v} Star{v !== 1 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pros</label>
                    <textarea
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      rows={3}
                      value={reviewForm.pros}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, pros: e.target.value })
                      }
                      placeholder="What do you like about working here?"
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cons</label>
                    <textarea
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                      rows={3}
                      value={reviewForm.cons}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, cons: e.target.value })
                      }
                      placeholder="What could be improved?"
                      required
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit Review"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowReviewForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {/* Reviews List */}
              {company.reviews.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">
                    No reviews yet. Be the first to share your experience!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {company.reviews.map((review) => (
                    <div key={review.id} className="py-6 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          {review.jobTitle && (
                            <p className="font-medium text-gray-900">{review.jobTitle}</p>
                          )}
                          <StarRating rating={review.overallRating} size="sm" />
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {review.pros && (
                        <div className="mb-2">
                          <span className="text-sm font-medium text-green-700">Pros: </span>
                          <span className="text-sm text-gray-600">{review.pros}</span>
                        </div>
                      )}
                      {review.cons && (
                        <div>
                          <span className="text-sm font-medium text-red-700">Cons: </span>
                          <span className="text-sm text-gray-600">{review.cons}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
