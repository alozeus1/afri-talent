"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Job, jobs, messages } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useEmployerT } from "@/lib/i18n/employer-messages";
import { controlClass } from "./employer-ui";

interface MessageCandidateButtonProps {
  candidateUserId: string;
  candidateName?: string | null;
  className?: string;
}

/**
 * Starts a message thread with a sourced candidate. The messaging API scopes
 * employer-initiated threads to one of the employer's own jobs, so the
 * composer asks which role the outreach is about before sending.
 */
export function MessageCandidateButton({ candidateUserId, candidateName, className }: MessageCandidateButtonProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useEmployerT();
  const [open, setOpen] = useState(false);
  const [jobOptions, setJobOptions] = useState<Job[] | null>(null);
  const [jobId, setJobId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openComposer = async () => {
    setOpen(true);
    setError(null);
    if (!body) {
      const firstName = candidateName?.split(" ")[0];
      setBody(firstName ? t("message.templateNamed", { name: firstName }) : t("message.template"));
    }
    if (jobOptions !== null) return;
    try {
      const myJobs = await jobs.myJobs();
      const published = myJobs.filter((job) => job.status === "PUBLISHED");
      setJobOptions(published);
      if (published.length > 0) setJobId(published[0].id);
    } catch (err) {
      setJobOptions([]);
      setError(err instanceof Error && err.message ? err.message : t("message.loadJobsFailed"));
    }
  };

  const send = async () => {
    if (!jobId || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const thread = await messages.createThread({
        participantId: candidateUserId,
        jobId,
        message: body.trim(),
      });
      router.push(localizePath(`/messages/${thread.id}`, locale));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("message.sendFailed"));
      setSending(false);
    }
  };

  if (!open) {
    return (
      <Button size="sm" className={className} onClick={() => void openComposer()}>
        {t("message.button")}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-line bg-surface-raised p-3 shadow-xs">
      {jobOptions === null ? (
        <p className="text-sm text-fg-muted" role="status">{t("message.loadingJobs")}</p>
      ) : jobOptions.length === 0 ? (
        <p className="text-sm text-fg-secondary">
          {t("message.needsJobBefore")}{" "}
          <Link href={localizePath("/employer/jobs/new", locale)} className="font-medium text-primary-text hover:underline">
            {t("message.postJob")}
          </Link>{" "}
          {t("message.needsJobAfter")}
        </p>
      ) : (
        <>
          <label className="block text-xs font-semibold uppercase tracking-wide text-fg-muted" htmlFor={`msg-job-${candidateUserId}`}>
            {t("message.aboutRole")}
          </label>
          <select
            id={`msg-job-${candidateUserId}`}
            className={`${controlClass} py-2`}
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
          >
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
          <Textarea
            aria-label={t("message.bodyLabel")}
            className="w-full"
            rows={3}
            maxLength={5000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {jobOptions && jobOptions.length > 0 && (
          <Button size="sm" disabled={sending || !jobId || !body.trim()} onClick={() => void send()}>
            {sending ? t("common.sending") : t("common.send")}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={sending} onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
