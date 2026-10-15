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
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";
import { ArrowLeft } from "lucide-react";

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

const SUB_RATINGS: [SubRatingKey, PublicMessageKey][] = [
  ["cultureRating", "discover.company.culture"],
  ["salaryRating", "discover.company.salary"],
  ["workLifeRating", "discover.company.workLifeBalance"],
  ["managementRating", "discover.company.management"],
  ["growthRating", "discover.company.growth"],
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
  "w-full resize-y rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-focus";
const labelClass = "mb-1 block text-sm font-medium text-fg";

function StarRating({ rating, size = "md" }: { rating: number; size?: "sm" | "md" }) {
  const tp = usePublicT();
  const sizeClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={tp("discover.companies.rating", { rating: rating.toFixed(1) })}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          aria-hidden="true"
          className={`${sizeClass} ${star <= Math.round(rating) ? "text-amber-400" : "text-fg-muted/40"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ms-1 text-sm text-fg-secondary" aria-hidden="true">{rating.toFixed(1)}</span>
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
  const tp = usePublicT();
  return (
    <fieldset>
      <legend className={labelClass}>
        {label}
        {required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
      </legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={tp("discover.company.stars", { count: star })}
            onClick={() => onChange(value === star && !required ? 0 : star)}
            className={`rounded p-0.5 text-2xl leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              star <= value ? "text-amber-400" : "text-fg-muted/50 hover:text-amber-300"
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
      <span className="w-32 shrink-0 text-sm text-fg-secondary">{label}</span>
      <div className="h-2.5 flex-1 rounded-full bg-surface-muted" aria-hidden="true">
        <div className="h-2.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-8 text-end text-sm font-medium text-fg">{value.toFixed(1)}</span>
    </div>
  );
}

export default function CompanyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();

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
    if (!res.ok) throw new Error(res.status === 404 ? tp("discover.company.notFound") : tp("discover.company.loadError"));
    const json: { company: CompanyDetail } = await res.json();
    setCompany(json.company);
    // tp only formats copy; refetching on locale change is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    loadCompany()
      .catch((err) => setError(err instanceof Error ? err.message : tp("discover.company.loadError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!reviewForm.overallRating) return tp("discover.company.errOverall");
    if (reviewForm.title.trim().length < MIN_TITLE) return tp("discover.company.errTitle", { count: MIN_TITLE });
    if (reviewForm.pros.trim().length < MIN_PROS_CONS) return tp("discover.company.errPros", { count: MIN_PROS_CONS });
    if (reviewForm.cons.trim().length < MIN_PROS_CONS) return tp("discover.company.errCons", { count: MIN_PROS_CONS });
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
        setReviewError(tp("discover.company.errDuplicate"));
      } else {
        setReviewError(err instanceof Error ? err.message : tp("discover.company.errSubmit"));
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
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8" role="status" aria-busy="true" aria-label={tp("discover.company.loading")}>
        <div className="mb-6 h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="mb-8 h-44 animate-pulse rounded-2xl border border-line bg-surface-muted" />
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-surface-muted lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-4 text-danger">
          {error || tp("discover.company.notFound")}
        </div>
        <Link href={localizePath("/companies", locale)} className="mt-4 inline-flex items-center gap-1.5 font-medium text-primary-text hover:underline">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {tp("discover.company.back")}
        </Link>
      </div>
    );
  }

  const ratings = company.ratingAggregate;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href={localizePath("/companies", locale)} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tp("discover.company.back")}
      </Link>

      {/* Company Header */}
      <Card className="mb-8">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-3xl font-bold tracking-tight text-fg">{company.companyName}</h1>
                {company.trustBadge ? (
                  <Badge variant={company.trustBadge === "Unverified employer" ? "default" : "info"}>
                    {label(company.trustBadge)}
                  </Badge>
                ) : (
                  company.verified && <Badge variant="info">{tp("discover.detail.verified")}</Badge>
                )}
              </div>
              {company.industry && <p className="mb-1 text-fg-secondary">{company.industry}</p>}
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-secondary">
                {company.size && <span><span aria-hidden="true">👥</span> {company.size}</span>}
                {company.headquarters && <span><span aria-hidden="true">📍</span> {company.headquarters}</span>}
              </div>
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary-text hover:underline"
                  dir="ltr"
                >
                  {company.website}
                </a>
              )}
              {company.bio ? (
                <p className="mt-3 text-fg-secondary">{company.bio}</p>
              ) : (
                <p className="mt-3 text-sm text-fg-secondary">
                  {tp("discover.company.noBio")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
              {company.hiresFromAfrica && <Badge variant="success">{tp("discover.badge.hiresFromAfrica")}</Badge>}
              {company.sponsorshipTrustScore != null && company.sponsorshipTrustScore > 0 && (
                <Badge variant="info">{tp("discover.company.sponsorScore", { score: company.sponsorshipTrustScore })}</Badge>
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
              <h2 className="text-lg font-semibold text-fg">{tp("discover.company.ratings")}</h2>
            </CardHeader>
            <CardContent>
              {ratings && ratings.totalReviews > 0 && ratings.averageOverall != null ? (
                <div className="space-y-4">
                  <div className="mb-4 text-center">
                    <div className="mb-1 text-4xl font-bold text-fg">
                      {ratings.averageOverall.toFixed(1)}
                    </div>
                    <div className="flex justify-center">
                      <StarRating rating={ratings.averageOverall} />
                    </div>
                    <p className="mt-1 text-sm text-fg-secondary">
                      {tp("discover.companies.reviews", { count: ratings.totalReviews })}
                      {ratings.recommendationPct != null && ` · ${tp("discover.company.recommend", { pct: Math.round(ratings.recommendationPct) })}`}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {ratings.averageCulture != null && <RatingBar label={tp("discover.company.culture")} value={ratings.averageCulture} />}
                    {ratings.averageSalary != null && <RatingBar label={tp("discover.company.salary")} value={ratings.averageSalary} />}
                    {ratings.averageWorkLife != null && <RatingBar label={tp("discover.company.workLife")} value={ratings.averageWorkLife} />}
                    {ratings.averageManagement != null && <RatingBar label={tp("discover.company.management")} value={ratings.averageManagement} />}
                    {ratings.averageGrowth != null && <RatingBar label={tp("discover.company.growth")} value={ratings.averageGrowth} />}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-fg-secondary">
                  {tp("discover.company.noRatings")}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Link href={localizePath(`/jobs?search=${encodeURIComponent(company.companyName)}`, locale)}>
              <Button variant="outline" className="w-full">
                {tp("discover.company.viewJobs", { name: company.companyName })}
              </Button>
            </Link>
          </div>
        </div>

        {/* Reviews */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-fg">{tp("discover.company.reviewsTitle")}</h2>
                {user && user.role === "CANDIDATE" && !showReviewForm && !reviewSubmitted && (
                  <Button size="sm" onClick={() => setShowReviewForm(true)}>
                    {tp("discover.company.write")}
                  </Button>
                )}
                {!user && (
                  <Link href={`${localizePath("/login", locale)}?redirect=${encodeURIComponent(localizePath(`/companies/${id}`, locale))}`}>
                    <Button size="sm" variant="outline">
                      {tp("discover.company.loginToReview")}
                    </Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {reviewSubmitted && (
                <div
                  role="status"
                  className="mb-6 rounded-xl border border-success-line bg-success-soft p-4 text-sm text-fg"
                >
                  <p className="font-semibold text-success">{tp("discover.company.thanksTitle")}</p>
                  <p className="mt-1 text-fg-secondary">{tp("discover.company.thanksBody")}</p>
                </div>
              )}

              {showReviewForm && (
                <form
                  onSubmit={handleSubmitReview}
                  noValidate
                  className="mb-8 space-y-5 rounded-2xl border border-line bg-surface-sunken p-5"
                  aria-labelledby="review-form-title"
                >
                  <div>
                    <h3 id="review-form-title" className="font-semibold text-fg">{tp("discover.company.formTitle")}</h3>
                    <p className="mt-1 text-sm text-fg-secondary">
                      {tp("discover.company.formBody")}
                    </p>
                  </div>

                  {reviewError && (
                    <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-3 text-sm text-danger">
                      {reviewError}
                    </div>
                  )}

                  <StarInput
                    label={tp("discover.company.overall")}
                    value={reviewForm.overallRating}
                    onChange={(v) => update("overallRating", v)}
                    required
                  />

                  <Input
                    id="review-title"
                    label={`${tp("discover.company.headline")} *`}
                    value={reviewForm.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder={tp("discover.company.headlinePlaceholder")}
                    maxLength={200}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="review-job-title"
                      label={tp("discover.company.jobTitle")}
                      value={reviewForm.jobTitle}
                      onChange={(e) => update("jobTitle", e.target.value)}
                      placeholder={tp("discover.company.jobTitlePlaceholder")}
                      maxLength={100}
                    />
                    <label className="flex items-center gap-2 self-end pb-3 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={reviewForm.isCurrentEmployee}
                        onChange={(e) => update("isCurrentEmployee", e.target.checked)}
                        className="h-4 w-4 rounded border-line-strong accent-emerald-700 focus:ring-focus"
                      />
                      {tp("discover.company.currentlyWork")}
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {SUB_RATINGS.map(([key, label]) => (
                      <StarInput key={key} label={tp("discover.company.optional", { label: tp(label) })} value={reviewForm[key]} onChange={(v) => update(key, v)} />
                    ))}
                  </div>

                  {(
                    [
                      ["pros", "discover.company.pros", "discover.company.prosPlaceholder"],
                      ["cons", "discover.company.cons", "discover.company.consPlaceholder"],
                      ["advice", "discover.company.adviceOptional", "discover.company.advicePlaceholder"],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label htmlFor={`review-${key}`} className={labelClass}>
                        {tp(label)}
                        {key !== "advice" && <span className="text-danger" aria-hidden="true"> *</span>}
                      </label>
                      <textarea
                        id={`review-${key}`}
                        className={textareaClass}
                        rows={3}
                        value={reviewForm[key]}
                        onChange={(e) => update(key, e.target.value)}
                        placeholder={tp(placeholder)}
                        maxLength={key === "advice" ? 1000 : 2000}
                      />
                      {key !== "advice" && (
                        <p className="mt-1 text-xs text-fg-secondary">
                          {tp("discover.company.minChars", { current: reviewForm[key].trim().length, min: MIN_PROS_CONS })}
                        </p>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <Button type="submit" disabled={submitting} isLoading={submitting}>
                      {submitting ? tp("discover.quick.submitting") : tp("discover.company.submit")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setShowReviewForm(false)}>
                      {tp("site.common.cancel")}
                    </Button>
                  </div>
                </form>
              )}

              {company.reviews.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-fg-secondary">
                    {tp("discover.company.noReviews")}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {company.reviews.map((review) => {
                    const vote = votes[review.id] ?? { voted: false, count: review.helpfulCount ?? 0 };
                    return (
                      <article key={review.id} className="py-6 first:pt-0 last:pb-0">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            {review.title && (
                              <h3 className="font-semibold text-fg">{review.title}</h3>
                            )}
                            <StarRating rating={review.overallRating} size="sm" />
                            {(review.jobTitle || review.isCurrentEmployee !== undefined) && (
                              <p className="mt-1 text-xs text-fg-secondary">
                                {review.jobTitle ?? tp("discover.company.employee")}
                                {" · "}
                                {review.isCurrentEmployee ? tp("discover.company.current") : tp("discover.company.former")}
                              </p>
                            )}
                          </div>
                          <time className="shrink-0 text-xs text-fg-secondary" dateTime={review.createdAt}>
                            {new Date(review.createdAt).toLocaleDateString(locale)}
                          </time>
                        </div>
                        {review.pros && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-success">{tp("discover.company.prosLabel")} </span>
                            <span className="text-fg-secondary">{review.pros}</span>
                          </p>
                        )}
                        {review.cons && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-danger">{tp("discover.company.consLabel")} </span>
                            <span className="text-fg-secondary">{review.cons}</span>
                          </p>
                        )}
                        {review.advice && (
                          <p className="mb-2 text-sm">
                            <span className="font-medium text-fg">{tp("discover.company.adviceLabel")} </span>
                            <span className="text-fg-secondary">{review.advice}</span>
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-3 text-xs text-fg-secondary">
                          {user ? (
                            <button
                              type="button"
                              onClick={() => toggleHelpful(review)}
                              disabled={votingId === review.id}
                              aria-pressed={vote.voted}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors disabled:opacity-60 ${
                                vote.voted
                                  ? "border-primary bg-success-soft text-primary-text"
                                  : "border-line-strong text-fg-secondary hover:bg-surface-muted"
                              }`}
                            >
                              <span aria-hidden="true">👍</span> {tp("discover.company.helpful")}{vote.count > 0 ? ` · ${vote.count}` : ""}
                            </button>
                          ) : (
                            vote.count > 0 && <span>{tp("discover.company.foundHelpful", { count: vote.count })}</span>
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
