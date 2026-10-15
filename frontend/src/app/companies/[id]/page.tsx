"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { CompanyReviewInput, companyReviews } from "@/lib/api/support";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CompanyRatingAggregate {
  averageOverall: number | null;
  averageCulture: number | null;
  averageSalary: number | null;
  averageWorkLife: number | null;
  averageManagement: number | null;
  averageGrowth: number | null;
  recommendationPct?: number | null;
  totalReviews: number;
}

interface CompanyReview {
  id: string;
  overallRating: number;
  cultureRating: number | null;
  salaryRating: number | null;
  workLifeRating: number | null;
  managementRating?: number | null;
  growthRating?: number | null;
  title?: string | null;
  pros: string;
  cons: string;
  advice?: string | null;
  isCurrentEmployee?: boolean;
  jobTitle: string | null;
  helpfulCount?: number;
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
  trustBadge?: string | null;
  sponsorshipTrustScore?: number | null;
  ratingAggregate: CompanyRatingAggregate | null;
  reviews: CompanyReview[];
}

type SubRatingKey = "cultureRating" | "salaryRating" | "workLifeRating" | "managementRating" | "growthRating";

const SUB_RATINGS: [SubRatingKey, string][] = [
  ["cultureRating", "Culture"],
  ["salaryRating", "Salary & benefits"],
  ["workLifeRating", "Work-life balance"],
  ["managementRating", "Management"],
  ["growthRating", "Career growth"],
];

// Mirrors backend CompanyReviewSchema.
const MIN_TITLE = 10;
const MIN_PROS_CONS = 20;

interface ReviewFormState {
  overallRating: number;
  cultureRating: number;
  salaryRating: number;
  workLifeRating: number;
  managementRating: number;
  growthRating: number;
  title: string;
  pros: string;
  cons: string;
  advice: string;
  jobTitle: string;
  isCurrentEmployee: boolean;
}

const EMPTY_FORM: ReviewFormState = {
  overallRating: 0,
  cultureRating: 0,
  salaryRating: 0,
  workLifeRating: 0,
  managementRating: 0,
  growthRating: 0,
  title: "",
  pros: "",
  cons: "",
  advice: "",
  jobTitle: "",
  isCurrentEmployee: false,
};

const textareaClass =
  "w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400";
const labelClass = "mb-1 block text-sm font-medium text-fg dark:text-zinc-200";

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          aria-hidden="true"
          className={`${sizeClass} ${star <= Math.round(rating) ? "text-amber-400" : "text-zinc-300 dark:text-zinc-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm text-fg-secondary dark:text-zinc-300">{rating.toFixed(1)}</span>
    </div>
  );
}

function StarInput({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onClick={() => onChange(value === star && !required ? 0 : star)}
            className={`rounded p-0.5 text-2xl leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              star <= value ? "text-amber-400" : "text-zinc-300 hover:text-amber-300 dark:text-zinc-600"
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  const percentage = (value / 5) * 100;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-fg-secondary dark:text-zinc-300">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-2.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-8 text-right text-sm font-medium text-fg dark:text-zinc-200">{value.toFixed(1)}</span>
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

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const [votes, setVotes] = useState<Record<string, { voted: boolean; count: number }>>({});
  const [votingId, setVotingId] = useState<string | null>(null);

  const loadCompany = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/companies/${id}`, { credentials: "include" });
    if (!res.ok) throw new Error(res.status === 404 ? "Company not found" : "Failed to load company");
    const json: { company: CompanyDetail } = await res.json();
    setCompany(json.company);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    loadCompany()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load company"))
      .finally(() => setLoading(false));
  }, [id, loadCompany]);

  // Which reviews this reader already marked helpful.
  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    companyReviews
      .listVotes(id)
      .then(({ reviews }) => {
        if (!active) return;
        setVotes(Object.fromEntries(reviews.map((r) => [r.id, { voted: r.votedByViewer, count: r.helpfulCount }])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, id]);

  const update = <K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) =>
    setReviewForm((prev) => ({ ...prev, [key]: value }));

  function validateReview(): string | null {
    if (!reviewForm.overallRating) return "Please choose an overall rating.";
    if (reviewForm.title.trim().length < MIN_TITLE) return `Please add a headline of at least ${MIN_TITLE} characters.`;
    if (reviewForm.pros.trim().length < MIN_PROS_CONS) return `Please describe the pros in at least ${MIN_PROS_CONS} characters.`;
    if (reviewForm.cons.trim().length < MIN_PROS_CONS) return `Please describe the cons in at least ${MIN_PROS_CONS} characters.`;
    return null;
  }

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const validationError = validateReview();
    if (validationError) {
      setReviewError(validationError);
      return;
    }
    setSubmitting(true);
    setReviewError(null);
    try {
      const payload: CompanyReviewInput = {
        overallRating: reviewForm.overallRating,
        title: reviewForm.title.trim(),
        pros: reviewForm.pros.trim(),
        cons: reviewForm.cons.trim(),
        isCurrentEmployee: reviewForm.isCurrentEmployee,
        ...(reviewForm.advice.trim() ? { advice: reviewForm.advice.trim() } : {}),
        ...(reviewForm.jobTitle.trim() ? { jobTitle: reviewForm.jobTitle.trim() } : {}),
      };
      for (const [key] of SUB_RATINGS) {
        if (reviewForm[key] > 0) payload[key] = reviewForm[key];
      }
      await companyReviews.submit(id, payload);
      setShowReviewForm(false);
      setReviewForm(EMPTY_FORM);
      setReviewSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReviewError("You have already reviewed this company. Thank you!");
      } else {
        setReviewError(err instanceof Error ? err.message : "Failed to submit review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  async function toggleHelpful(review: CompanyReview) {
    if (!user) return;
    const current = votes[review.id] ?? { voted: false, count: review.helpfulCount ?? 0 };
    setVotingId(review.id);
    try {
      const result = current.voted
        ? await companyReviews.unmarkHelpful(id, review.id)
        : await companyReviews.markHelpful(id, review.id);
      setVotes((prev) => ({ ...prev, [review.id]: { voted: result.voted, count: result.helpfulCount } }));
    } catch {
      // Own review / rate limit: leave state unchanged.
    } finally {
      setVotingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24" role="status" aria-label="Loading company">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error || "Company not found"}
        </div>
        <Link href="/companies" className="mt-4 inline-block text-emerald-700 hover:underline dark:text-emerald-400">
          ← Back to companies
        </Link>
      </div>
    );
  }

  const ratings = company.ratingAggregate;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/companies" className="mb-6 inline-block text-sm text-emerald-700 hover:underline dark:text-emerald-400">
        ← Back to companies
      </Link>

      {/* Company Header */}
      <Card className="mb-8">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold text-fg dark:text-zinc-50">{company.companyName}</h1>
                {company.trustBadge ? (
                  <Badge variant={company.trustBadge === "Unverified employer" ? "default" : "info"}>
                    {company.trustBadge}
                  </Badge>
                ) : (
                  company.verified && <Badge variant="info">Verified</Badge>
                )}
              </div>
              {company.industry && <p className="mb-1 text-fg-secondary dark:text-zinc-300">{company.industry}</p>}
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-secondary dark:text-zinc-400">
                {company.size && <span>👥 {company.size}</span>}
                {company.headquarters && <span>📍 {company.headquarters}</span>}
              </div>
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {company.website}
                </a>
              )}
              {company.bio ? (
                <p className="mt-3 text-fg-secondary dark:text-zinc-300">{company.bio}</p>
              ) : (
                <p className="mt-3 text-sm text-fg-secondary dark:text-zinc-400">
                  About this company: not enough verified data yet.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              {company.hiresFromAfrica && <Badge variant="success">Hires from Africa</Badge>}
              {company.sponsorshipTrustScore != null && company.sponsorshipTrustScore > 0 && (
                <Badge variant="info">Sponsorship trust score: {company.sponsorshipTrustScore}/10</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Rating Breakdown */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-fg dark:text-zinc-50">Ratings</h2>
            </CardHeader>
            <CardContent>
              {ratings && ratings.totalReviews > 0 && ratings.averageOverall != null ? (
                <div className="space-y-4">
                  <div className="mb-4 text-center">
                    <div className="mb-1 text-4xl font-bold text-fg dark:text-zinc-50">
                      {ratings.averageOverall.toFixed(1)}
                    </div>
                    <div className="flex justify-center">
                      <StarRating rating={ratings.averageOverall} />
                    </div>
                    <p className="mt-1 text-sm text-fg-secondary dark:text-zinc-400">
                      {ratings.totalReviews} review{ratings.totalReviews !== 1 ? "s" : ""}
                      {ratings.recommendationPct != null && ` · ${Math.round(ratings.recommendationPct)}% would recommend`}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {ratings.averageCulture != null && <RatingBar label="Culture" value={ratings.averageCulture} />}
                    {ratings.averageSalary != null && <RatingBar label="Salary & benefits" value={ratings.averageSalary} />}
                    {ratings.averageWorkLife != null && <RatingBar label="Work-life" value={ratings.averageWorkLife} />}
                    {ratings.averageManagement != null && <RatingBar label="Management" value={ratings.averageManagement} />}
                    {ratings.averageGrowth != null && <RatingBar label="Career growth" value={ratings.averageGrowth} />}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-fg-secondary dark:text-zinc-400">
                  Not enough verified data yet — no approved reviews so far.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Link href={`/jobs?query=${encodeURIComponent(company.companyName)}`}>
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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg dark:text-zinc-50">Reviews</h2>
                {user && user.role === "CANDIDATE" && !showReviewForm && !reviewSubmitted && (
                  <Button size="sm" onClick={() => setShowReviewForm(true)}>
                    Write a Review
                  </Button>
                )}
                {!user && (
                  <Link href={`/login?redirect=${encodeURIComponent(`/companies/${id}`)}`}>
                    <Button size="sm" variant="outline">
                      Log in to Review
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {reviewSubmitted && (
                <div
                  role="status"
                  className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                >
                  <p className="font-semibold">Thanks for sharing your experience!</p>
                  <p className="mt-1">
                    Your review is in our moderation queue and will appear here once approved. Reviews are always anonymous.
                  </p>
                </div>
              )}

              {showReviewForm && (
                <form
                  onSubmit={handleSubmitReview}
                  noValidate
                  className="mb-8 space-y-5 rounded-2xl border border-line bg-surface-sunken p-5 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div>
                    <h3 className="font-semibold text-fg dark:text-zinc-50">Write your review</h3>
                    <p className="mt-1 text-sm text-fg-secondary dark:text-zinc-400">
                      Reviews are anonymous and checked by our team before they are published.
                    </p>
                  </div>

                  {reviewError && (
                    <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                      {reviewError}
                    </div>
                  )}

                  <StarInput
                    label="Overall rating"
                    value={reviewForm.overallRating}
                    onChange={(v) => update("overallRating", v)}
                    required
                  />

                  <Input
                    id="review-title"
                    label="Review headline *"
                    value={reviewForm.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="e.g. Great mentorship, slow promotions"
                    maxLength={200}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="review-job-title"
                      label="Your job title (optional)"
                      value={reviewForm.jobTitle}
                      onChange={(e) => update("jobTitle", e.target.value)}
                      placeholder="e.g. Software Engineer"
                      maxLength={100}
                    />
                    <label className="flex items-center gap-2 self-end pb-3 text-sm text-fg dark:text-zinc-200">
                      <input
                        type="checkbox"
                        checked={reviewForm.isCurrentEmployee}
                        onChange={(e) => update("isCurrentEmployee", e.target.checked)}
                        className="h-4 w-4 rounded border-line-strong text-primary-text focus:ring-emerald-500"
                      />
                      I currently work here
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {SUB_RATINGS.map(([key, label]) => (
                      <StarInput key={key} label={`${label} (optional)`} value={reviewForm[key]} onChange={(v) => update(key, v)} />
                    ))}
                  </div>

                  {(
                    [
                      ["pros", "Pros *", "What do you like about working here?"],
                      ["cons", "Cons *", "What could be improved?"],
                      ["advice", "Advice to management (optional)", "What would make this a better place to work?"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label htmlFor={`review-${key}`} className={labelClass}>
                        {label}
                      </label>
                      <textarea
                        id={`review-${key}`}
                        className={textareaClass}
                        rows={3}
                        value={reviewForm[key]}
                        onChange={(e) => update(key, e.target.value)}
                        placeholder={placeholder}
                        maxLength={key === "advice" ? 1000 : 2000}
                      />
                      {key !== "advice" && (
                        <p className="mt-1 text-xs text-fg-secondary dark:text-zinc-400">
                          {reviewForm[key].trim().length}/{MIN_PROS_CONS} characters minimum
                        </p>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <Button type="submit" disabled={submitting} isLoading={submitting}>
                      {submitting ? "Submitting..." : "Submit review"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setShowReviewForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {company.reviews.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-fg-secondary dark:text-zinc-400">
                    No verified reviews yet. Be the first to share your experience!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line dark:divide-zinc-800">
                  {company.reviews.map((review) => {
                    const vote = votes[review.id] ?? { voted: false, count: review.helpfulCount ?? 0 };
                    return (
                      <article key={review.id} className="py-6 first:pt-0 last:pb-0">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            {review.title && (
                              <h3 className="font-semibold text-fg dark:text-zinc-50">{review.title}</h3>
                            )}
                            <StarRating rating={review.overallRating} size="sm" />
                            {(review.jobTitle || review.isCurrentEmployee !== undefined) && (
                              <p className="mt-1 text-xs text-fg-secondary dark:text-zinc-400">
                                {review.jobTitle ?? "Employee"}
                                {review.isCurrentEmployee ? " · Current employee" : " · Former employee"}
                              </p>
                            )}
                          </div>
                          <time className="shrink-0 text-xs text-fg-secondary dark:text-zinc-400" dateTime={review.createdAt}>
                            {new Date(review.createdAt).toLocaleDateString()}
                          </time>
                        </div>
                        {review.pros && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">Pros: </span>
                            <span className="text-fg-secondary dark:text-zinc-300">{review.pros}</span>
                          </p>
                        )}
                        {review.cons && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-red-700 dark:text-red-400">Cons: </span>
                            <span className="text-fg-secondary dark:text-zinc-300">{review.cons}</span>
                          </p>
                        )}
                        {review.advice && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-fg dark:text-zinc-200">Advice: </span>
                            <span className="text-fg-secondary dark:text-zinc-300">{review.advice}</span>
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-3 text-xs text-fg-secondary dark:text-zinc-400">
                          {user ? (
                            <button
                              type="button"
                              onClick={() => toggleHelpful(review)}
                              disabled={votingId === review.id}
                              aria-pressed={vote.voted}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors disabled:opacity-60 ${
                                vote.voted
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  : "border-line-strong text-fg-secondary hover:bg-surface-muted dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              }`}
                            >
                              👍 Helpful{vote.count > 0 ? ` · ${vote.count}` : ""}
                            </button>
                          ) : (
                            vote.count > 0 && <span>{vote.count} found this helpful</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
