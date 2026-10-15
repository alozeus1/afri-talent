"use client";

// Report-suspicious-job flow — posts to the existing trust reports endpoint
// (POST /api/trust/reports with targetJobId). Requires login; anonymous users
// are routed to /login.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trust, AbuseReportInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

const REASONS: Array<{ value: AbuseReportInput["reason"]; label: PublicMessageKey }> = [
  { value: "SCAM", label: "discover.report.scam" },
  { value: "FAKE_JOB", label: "discover.report.fake" },
  { value: "ADVANCE_FEE_REQUEST", label: "discover.report.fees" },
  { value: "MISLEADING_SALARY", label: "discover.report.salary" },
  { value: "OTHER", label: "discover.report.other" },
];

export function ReportJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const tp = usePublicT();
  const locale = useLocale();
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
        router.push(localizePath("/login", locale));
        return;
      }
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p role="status" className="text-sm font-medium text-success">
        {tp("discover.report.thanks")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-danger hover:underline"
      >
        {tp("discover.report.open")}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-danger-line bg-danger-soft p-4">
      <p className="mb-2 text-sm font-semibold text-fg">
        {tp("discover.report.title")}
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as AbuseReportInput["reason"])}
        className="mb-2 w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-focus"
        aria-label={tp("discover.report.reason")}
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>{tp(r.label)}</option>
        ))}
      </select>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={tp("discover.report.details")}
        aria-label={tp("discover.report.details")}
        rows={2}
        maxLength={4000}
        className="mb-3 w-full rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-focus"
      />
      {state === "error" && (
        <p role="alert" className="mb-2 text-xs text-danger">{tp("discover.report.error")}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="danger" onClick={submit} disabled={state === "sending"}>
          {state === "sending" ? tp("discover.report.sending") : tp("discover.report.submit")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {tp("site.common.cancel")}
        </Button>
      </div>
    </div>
  );
}
