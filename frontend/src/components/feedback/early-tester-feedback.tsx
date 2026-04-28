"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "afritalent_early_tester_feedback";

interface StoredFeedback {
  area: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export function EarlyTesterFeedback({ area }: { area: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!rating) return;
    const entry: StoredFeedback = {
      area,
      rating,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      const parsed = existing ? (JSON.parse(existing) as StoredFeedback[]) : [];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...parsed].slice(0, 50)));
    } catch {
      // Feedback must not break the workflow if storage is unavailable.
    }
    trackEvent("feedback_submitted", {
      area,
      rating,
      has_comment: Boolean(comment.trim()),
    });
    setSubmitted(true);
    setComment("");
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Early tester feedback</p>
          <p className="mt-1 text-xs text-emerald-800">
            Was this useful? Your response is saved locally for now and can later be wired to admin review.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Close feedback" : "Give feedback"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
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
                className={`h-9 w-9 rounded-full border text-sm font-semibold ${
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
            rows={3}
            className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Optional: tell us what was useful, confusing, or missing."
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-emerald-800">
              Backend feedback storage is intentionally deferred until the schema change is planned.
            </p>
            <Button size="sm" onClick={handleSubmit} disabled={!rating}>
              Submit feedback
            </Button>
          </div>
          {submitted && (
            <p className="text-sm font-medium text-emerald-800" role="status">
              Feedback saved for this browser session.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

