"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { applications, Job } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNetworkProfile } from "@/lib/network-profile";

const QuickApplyModal = dynamic(
  () => import("@/components/jobs/quick-apply-modal").then((mod) => mod.QuickApplyModal),
  {
    loading: () => null,
  },
);

interface JobApplyPanelProps {
  job: Job;
}

export function JobApplyPanel({ job }: JobApplyPanelProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { online, isLowBandwidth } = useNetworkProfile();
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);

  const handleApply = async () => {
    if (!online) {
      setApplyError("You appear to be offline. Reconnect and try again.");
      return;
    }

    if (!user) {
      router.push(`/login?redirect=/jobs/${job.slug}`);
      return;
    }

    if (user.role !== "CANDIDATE") {
      setApplyError("Only candidates can apply to jobs");
      return;
    }

    setApplying(true);
    setApplyError(null);

    try {
      await applications.apply({ jobId: job.id });
      setApplied(true);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Card className="sticky top-24">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">Apply for this position</h3>

          <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
            <p className="text-sm font-semibold text-blue-900">Stay safe while applying</p>
            <p className="mt-2 text-sm text-blue-900">
              Keep interviews and file sharing on AfriTalent when possible, and never pay application or processing fees.
            </p>
            <Link
              href={`/trust/report?targetJobId=${job.id}`}
              className="mt-3 inline-flex text-sm font-medium text-blue-900 underline-offset-2 hover:underline"
            >
              Report this job
            </Link>
          </div>

          {!online && (
            <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              You&apos;re offline. AfriTalent will keep this job available, but apply actions are paused until you reconnect.
            </div>
          )}

          {isLowBandwidth && (
            <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              Lite network mode is on, so quick apply checks may take a little longer on this connection.
            </div>
          )}

          {applied ? (
            <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg mb-4">
              Application submitted successfully!
            </div>
          ) : user && user.role === "EMPLOYER" ? (
            <div className="bg-blue-50 text-blue-700 p-4 rounded-lg mb-4 text-sm">
              <p className="font-medium">You&apos;re logged in as an employer.</p>
              <p className="mt-1">Only candidates can apply to jobs.</p>
            </div>
          ) : user && user.role === "ADMIN" ? (
            <div className="bg-gray-50 text-gray-700 p-4 rounded-lg mb-4 text-sm">
              <p className="font-medium">You&apos;re logged in as an admin.</p>
              <p className="mt-1">Admins cannot apply to jobs.</p>
            </div>
          ) : (
            <>
              {applyError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                  {applyError}
                </div>
              )}
              {!user && (
                <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                  Sign in to apply and track your application from your candidate dashboard.
                </div>
              )}
              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={handleApply} disabled={applying || !online}>
                  {applying ? "Applying..." : applied ? "Applied" : "Apply Now"}
                </Button>
                {user?.role === "CANDIDATE" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setQuickApplyOpen(true)}
                    disabled={!online}
                  >
                    Quick Apply
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <QuickApplyModal
        jobId={job.id}
        jobTitle={job.title}
        isOpen={quickApplyOpen}
        onClose={() => setQuickApplyOpen(false)}
        onSuccess={() => {
          setQuickApplyOpen(false);
          setApplied(true);
        }}
      />
    </>
  );
}
