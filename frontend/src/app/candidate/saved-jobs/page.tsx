"use client";

// Saved jobs — candidate bookmarks list (roadmap Phase 2/D).

import { useEffect, useState } from "react";
import Link from "next/link";
import { savedJobs, SavedJobItem, Job } from "@/lib/api";
import { africaPill } from "@/lib/job-trust-labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function SavedJobsPage() {
  const [items, setItems] = useState<SavedJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    savedJobs
      .list()
      .then((data) => setItems(data.saved))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load saved jobs"))
      .finally(() => setLoading(false));
  }, []);

  const unsave = async (jobId: string) => {
    setItems((prev) => prev.filter((i) => i.job.id !== jobId));
    try {
      await savedJobs.unsave(jobId);
    } catch {
      // refetch to restore accurate state on failure
      savedJobs.list().then((data) => setItems(data.saved)).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Saved jobs</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500 dark:text-gray-400">
          Roles you bookmarked to compare, track, and apply to when ready.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="font-semibold text-gray-900 dark:text-gray-100">No saved jobs yet</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Tap “Save job” on any listing and it will appear here.
              </p>
              <Link href="/jobs" className="mt-4 inline-block">
                <Button>Browse jobs</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className={item.job.isExpired ? "opacity-60" : ""}>
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <Link href={`/jobs/${item.job.slug}`} className="font-semibold text-gray-900 hover:text-emerald-700 dark:text-gray-100 dark:hover:text-emerald-400">
                      {item.job.title}
                    </Link>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      {item.job.employer?.companyName ?? item.job.sourceName ?? "Company"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{item.job.location}</span>
                      <span>·</span>
                      <span>{item.job.type}</span>
                      {item.job.hiresFromAfrica && <Badge variant="success">Hires from Africa</Badge>}
                      {(() => {
                        const pill = africaPill(item.job as unknown as Job);
                        return pill ? <Badge variant={pill.variant}>{pill.label}</Badge> : null;
                      })()}
                      {item.job.isExpired && <Badge variant="warning">Expired</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/jobs/${item.job.slug}`}>
                      <Button size="sm" variant="outline">View</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => unsave(item.job.id)} aria-label={`Remove ${item.job.title} from saved jobs`}>
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
