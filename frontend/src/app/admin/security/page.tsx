"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useAdminHref } from "@/components/admin/admin-href";
import { isGraceActive, totpErrorKey } from "@/components/admin/totp-notice";
import {
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  Pill,
  Spinner,
  fieldClass,
  labelClass,
  linkClass,
  muted,
  strong,
} from "@/components/admin/console-ui";
import {
  ADMIN_TOTP_CHANGED_EVENT,
  AdminTotpEnrolment,
  AdminTotpStatus,
  adminTotp,
  errorCodeOf,
} from "@/lib/admin-console-api";
import { AdminMessageKey, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";

const CODE_PATTERN = /^\d{6}$/;

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function notifyChanged() {
  window.dispatchEvent(new Event(ADMIN_TOTP_CHANGED_EVENT));
}

function CodeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useAdminT();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{t("totp.codeLabel")}</label>
      <input
        id={id}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        dir="ltr"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        className={`${fieldClass} max-w-[12rem] text-center font-mono text-lg tracking-[0.4em]`}
      />
    </div>
  );
}

function EnrolmentSteps({
  enrolment,
  onVerified,
  onRestart,
  onCancel,
}: {
  enrolment: AdminTotpEnrolment;
  onVerified: () => void;
  onRestart: (messageKey: AdminMessageKey) => void;
  onCancel: () => void;
}) {
  const t = useAdminT();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AdminMessageKey | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(enrolment.secret);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!CODE_PATTERN.test(code)) {
      setError("totp.error.badFormat");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminTotp.verifyEnrolment(code);
      onVerified();
    } catch (err) {
      const key = totpErrorKey(err);
      const errorCode = errorCodeOf(err);
      if (errorCode === "TOTP_NOT_STARTED" || errorCode === "TOTP_DECRYPT_FAILED" || errorCode === "TOTP_ALREADY_ENROLLED") {
        onRestart(key);
        return;
      }
      setError(key);
      setCode("");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel title={t("totp.step1.title")} description={t("totp.step1.body")}>
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <div
            role="img"
            aria-label={t("totp.qrLabel")}
            className="w-fit shrink-0 rounded-xl border border-line bg-white p-3"
          >
            <QRCodeSVG value={enrolment.provisioningUri} size={192} level="M" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className={`text-sm font-semibold ${strong}`}>{t("totp.manual.title")}</p>
            <p className={`text-sm ${muted}`}>{t("totp.manual.help")}</p>
            <code
              dir="ltr"
              data-testid="totp-secret"
              className={`block select-all break-all rounded-lg border border-line bg-surface-sunken px-3 py-2 font-mono text-base ${strong}`}
            >
              {groupSecret(enrolment.secret)}
            </code>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
                {t("totp.copy")}
              </Button>
              <span role="status" className={`text-sm ${muted}`}>
                {copyState === "copied" ? t("totp.copied") : copyState === "failed" ? t("totp.copyFailed") : ""}
              </span>
            </div>
            <p className={`text-xs ${muted}`}>{t("totp.secretWarning")}</p>
          </div>
        </div>
      </Panel>

      <Panel title={t("totp.step2.title")} description={t("totp.step2.body")}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <CodeField value={code} onChange={setCode} disabled={submitting} />
          {error && <p role="alert" className="text-sm text-danger">{t(error)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={submitting}>
              {t("totp.verify")}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function DisableForm({ onDisabled }: { onDisabled: () => void }) {
  const t = useAdminT();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AdminMessageKey | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!CODE_PATTERN.test(code)) {
      setError("totp.error.badFormat");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adminTotp.disable(code);
      onDisabled();
    } catch (err) {
      setError(totpErrorKey(err));
      setCode("");
      setSubmitting(false);
    }
  };

  return (
    <Panel title={t("totp.disable.title")} description={t("totp.disable.body")}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <CodeField value={code} onChange={setCode} disabled={submitting} />
        {error && <p role="alert" className="text-sm text-danger">{t(error)}</p>}
        <Button type="submit" variant="danger" isLoading={submitting}>
          {t("totp.disable.submit")}
        </Button>
      </form>
    </Panel>
  );
}

type Phase = { kind: "status" } | { kind: "enrolling"; enrolment: AdminTotpEnrolment } | { kind: "done" };

export default function AdminSecurityPage() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const [status, setStatus] = useState<AdminTotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<AdminMessageKey | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "status" });
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; key: AdminMessageKey } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStatus(await adminTotp.status());
    } catch (err) {
      setLoadError(totpErrorKey(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setStarting(true);
    setNotice(null);
    try {
      const enrolment = await adminTotp.enrol();
      setPhase({ kind: "enrolling", enrolment });
    } catch (err) {
      setNotice({ tone: "error", key: totpErrorKey(err) });
      if (errorCodeOf(err) === "TOTP_ALREADY_ENROLLED") await load();
    } finally {
      setStarting(false);
    }
  };

  const restart = async (key: AdminMessageKey) => {
    // Drop the secret from memory before showing the status view again.
    setPhase({ kind: "status" });
    setNotice({ tone: "error", key });
    await load();
  };

  const verified = () => {
    setPhase({ kind: "done" });
    setStatus((prev) => (prev ? { ...prev, enrolled: true, enrolmentStartedAt: null } : prev));
    notifyChanged();
  };

  const disabled = async () => {
    setNotice({ tone: "success", key: "totp.disabled" });
    notifyChanged();
    await load();
  };

  const header = <PageHeader eyebrow={t("nav.security")} title={t("totp.title")} subtitle={t("totp.subtitle")} />;

  if (phase.kind === "enrolling") {
    return (
      <div>
        {header}
        <EnrolmentSteps
          enrolment={phase.enrolment}
          onVerified={verified}
          onRestart={(key) => void restart(key)}
          onCancel={() => setPhase({ kind: "status" })}
        />
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <div>
        {header}
        <Panel>
          <div role="status" className="space-y-2">
            <Pill tone="green">{t("totp.status.onPill")}</Pill>
            <h2 className={`text-lg font-semibold ${strong}`}>{t("totp.success.title")}</h2>
            <p className={`text-sm ${muted}`}>{t("totp.success.body")}</p>
            <Link href={href("/admin")} className={`inline-block pt-2 text-sm ${linkClass}`}>
              {t("totp.success.done")}
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      {header}
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {t(notice.key)}
        </Notice>
      )}
      {loading && !status ? (
        <Spinner />
      ) : loadError || !status ? (
        <ErrorState message={t(loadError ?? "common.error")} onRetry={() => void load()} />
      ) : status.enrolled ? (
        <div className="space-y-6">
          <Panel>
            <div className="space-y-2">
              <Pill tone="green">{t("totp.status.onPill")}</Pill>
              <h2 className={`text-lg font-semibold ${strong}`}>{t("totp.status.on")}</h2>
              <p className={`text-sm ${muted}`}>{t("totp.status.onBody")}</p>
            </div>
          </Panel>
          <DisableForm onDisabled={() => void disabled()} />
        </div>
      ) : (
        <Panel>
          <div className="space-y-3">
            <Pill tone="amber">{t("totp.status.offPill")}</Pill>
            <h2 className={`text-lg font-semibold ${strong}`}>{t("totp.status.off")}</h2>
            <p className={`text-sm ${muted}`}>{t("totp.status.offBody")}</p>
            <p className={`text-sm font-medium ${strong}`}>
              {isGraceActive(status.graceUntil)
                ? t("totp.grace.until", { date: fmt.dateTime(status.graceUntil) })
                : t("totp.grace.expired")}
            </p>
            {status.enrolmentStartedAt === "pending" && <p className={`text-sm ${muted}`}>{t("totp.status.pending")}</p>}
            <div className="pt-2">
              <Button onClick={() => void start()} isLoading={starting}>
                {status.enrolmentStartedAt === "pending" ? t("totp.restart") : t("totp.start")}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
