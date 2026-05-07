"use client";

import { useEffect, useMemo, useState } from "react";
import { learning, type LearningFeedbackItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";

interface EarlyTesterFeedbackProps {
  area: string;
  areaSlug?: string;
  showApprovedFeedback?: boolean;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function splitName(fullName: string | undefined | null): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5 text-xs">
      {Array.from({ length: 5 }, (_, index) => index + 1).map((value) => (
        <span key={value} className={value <= rating ? "text-amber-500" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function EarlyTesterFeedback({
  area,
  areaSlug,
  showApprovedFeedback = false,
}: EarlyTesterFeedbackProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(showApprovedFeedback);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [attachPhoto, setAttachPhoto] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LearningFeedbackItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const resolvedAreaSlug = useMemo(() => areaSlug || slugify(area), [area, areaSlug]);
  const canAttachPhoto = Boolean(user?.role === "CANDIDATE" && user.avatarUrl);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const nameParts = splitName(user?.name);
    if (nameParts.firstName) setFirstName(nameParts.firstName);
    if (nameParts.lastName) setLastName(nameParts.lastName);
  }, [user?.name]);

  useEffect(() => {
    if (!showApprovedFeedback) return;

    let mounted = true;
    learning.feedback
      .list({ areaSlug: resolvedAreaSlug, limit: 6 })
      .then((data) => {
        if (mounted) setFeedback(data.feedback);
      })
      .catch(() => {
        if (mounted) setFeedback([]);
      });

    return () => {
      mounted = false;
    };
  }, [resolvedAreaSlug, showApprovedFeedback]);

  async function handleSubmit() {
    if (!rating) return;

    setLoading(true);
    setError(null);

    try {
      await learning.feedback.submit({
        areaSlug: resolvedAreaSlug,
        lessonTitle: area,
        firstName: firstName.trim() || "Anonymous",
        lastName: lastName.trim() || "Learner",
        rating,
        comment: comment.trim(),
        attachPhoto: canAttachPhoto ? attachPhoto : false,
      });

      trackEvent("feedback_submitted", {
        area,
        rating,
        has_comment: Boolean(comment.trim()),
      });

      setSubmitted(true);
      setComment("");
      setRating(0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit feedback");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Early tester feedback</p>
          <p className="mt-1 text-xs text-emerald-800">
            Share a short note. Submissions stay hidden until an admin approves them.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close feedback" : "Give feedback"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-emerald-900">First name</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="First name"
                autoComplete="given-name"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-emerald-900">Last name</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Last name"
                autoComplete="family-name"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Rate ${area}`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                onClick={() => {
                  setRating(value);
                  setSubmitted(false);
                }}
                disabled={!hydrated}
                className={`h-9 w-9 rounded-full border text-sm font-semibold transition-colors ${
                  rating === value
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-500"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Tell us what was useful, confusing, or missing."
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs text-emerald-800">
              <input
                type="checkbox"
                checked={canAttachPhoto && attachPhoto}
                onChange={(event) => setAttachPhoto(event.target.checked)}
                disabled={!canAttachPhoto}
                className="h-4 w-4 rounded border-emerald-300 text-emerald-700 disabled:cursor-not-allowed"
              />
              {canAttachPhoto ? "Attach my profile photo if this comment is approved" : "Anonymous submissions show your name only if you are logged in"}
            </label>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!hydrated || !rating || loading}
            >
              {loading ? "Submitting..." : "Submit feedback"}
            </Button>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {submitted && (
            <p className="text-sm font-medium text-emerald-800" role="status">
              Feedback submitted for review. It will appear after admin approval.
            </p>
          )}
        </div>
      )}

      {showApprovedFeedback && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-950">Approved learner notes</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                learning.feedback
                  .list({ areaSlug: resolvedAreaSlug, limit: 6 })
                  .then((data) => setFeedback(data.feedback))
                  .catch(() => setFeedback([]));
              }}
            >
              Refresh
            </Button>
          </div>
          {feedback.length === 0 ? (
            <p className="text-xs text-emerald-700">No approved feedback yet.</p>
          ) : (
            <div className="grid gap-3">
              {feedback.map((entry) => (
                <Card key={entry.id} className="border-emerald-100 bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                        {entry.avatarUrl ? (
                          <img src={entry.avatarUrl} alt={entry.displayName} className="h-full w-full object-cover" />
                        ) : (
                          entry.displayName
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{entry.displayName}</p>
                            <Stars rating={entry.rating} />
                          </div>
                          <p className="text-[11px] text-gray-400">
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{entry.comment}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
