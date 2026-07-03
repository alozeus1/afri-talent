"use client";

// Report-suspicious-job flow — posts to the existing trust reports endpoint
// (POST /api/trust/reports with targetJobId). Requires login; anonymous users
// are routed to /login.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trust, AbuseReportInput } from "@/lib/api";
import { Button } from "@/components/ui/button";

const REASONS: Array<{ value: AbuseReportInput["reason"]; label: string }> = [
  { value: "SCAM", label: "Looks like a scam" },
  { value: "FAKE_JOB", label: "Fake or misleading job" },
  { value: "ADVANCE_FEE_REQUEST", label: "Asks for money / fees" },
  { value: "MISLEADING_SALARY", label: "Misleading salary" },
  { value: "OTHER", label: "Something else" },
];

export function ReportJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AbuseReportInput["reason"]>("SCAM");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async () => {
    setState("sending");
    try {
      await trust.reportAbuse({ reason, details: details.trim() || undefined, targetJobId: jobId });
      setState("done");
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        router.push("/login");
        return;
      }
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
        Thanks — our trust team will review this listing.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline"
      >
        Report suspicious job
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
      <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Report this job to the trust team
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as AbuseReportInput["reason"])}
        className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
        aria-label="Report reason"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Anything that helps us review (optional)"
        rows={2}
        className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-gray-100"
      />
      {state === "error" && (
        <p className="mb-2 text-xs text-red-600">Could not submit the report — please try again.</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Submit report"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
