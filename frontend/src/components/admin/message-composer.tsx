"use client";

import { FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass, muted } from "./console-ui";
import { useAdminT } from "@/lib/i18n/admin-messages";
import type { EmailOutcome } from "@/lib/admin-console-api";

export interface ComposerResult {
  email?: EmailOutcome;
}

export function MessageComposer({
  submitLabel,
  onSend,
  onSent,
  compact = false,
}: {
  submitLabel?: string;
  onSend: (input: { subject: string; body: string; sendEmail: boolean }) => Promise<ComposerResult | void>;
  onSent?: (message: string) => void;
  compact?: boolean;
}) {
  const t = useAdminT();
  const id = useId();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3 || body.trim().length < 1) {
      setError(t("message.tooShort"));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await onSend({ subject: subject.trim(), body: body.trim(), sendEmail });
      const email = result && "email" in result ? result.email : undefined;
      const parts = [t("message.sent")];
      if (email === "queued") parts.push(t("message.emailQueued"));
      if (email === "skipped_not_configured") parts.push(t("message.emailSkipped"));
      onSent?.(parts.join(" "));
      setSubject("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor={`${id}-subject`} className={labelClass}>{t("message.subject")}</label>
        <input
          id={`${id}-subject`}
          className={fieldClass}
          value={subject}
          maxLength={140}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${id}-body`} className={labelClass}>{t("message.body")}</label>
        <textarea
          id={`${id}-body`}
          className={fieldClass}
          rows={compact ? 4 : 6}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <label className={`flex items-center gap-2 text-sm ${muted}`}>
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(e) => setSendEmail(e.target.checked)}
          className="h-4 w-4 rounded border-line-strong text-primary-text focus:ring-focus"
        />
        {t("message.sendEmail")}
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" isLoading={sending}>{submitLabel ?? t("message.send")}</Button>
    </form>
  );
}
