"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TOTP_CHANGED_EVENT, AdminTotpStatus, adminTotp, errorCodeOf } from "@/lib/admin-console-api";
import { AdminMessageKey, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import { ADMIN_SECURITY_PATH, useAdminHref, useAdminPrefix } from "./admin-href";

const linkButton =
  "inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg shadow-xs transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2";

const CODE_MESSAGES: Record<string, AdminMessageKey> = {
  TOTP_INVALID_CODE: "totp.error.invalidCode",
  TOTP_BAD_FORMAT: "totp.error.badFormat",
  TOTP_NOT_STARTED: "totp.error.notStarted",
  TOTP_ALREADY_ENROLLED: "totp.error.alreadyEnrolled",
  TOTP_NOT_ENROLLED: "totp.error.notEnrolled",
  TOTP_DECRYPT_FAILED: "totp.error.decryptFailed",
};

/** Maps a TOTP API failure to translated copy; never echoes raw server text. */
export function totpErrorKey(err: unknown): AdminMessageKey {
  const code = errorCodeOf(err);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  const status = err && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  if (status === 401) return "totp.error.session";
  if (status === 403) return "totp.error.forbidden";
  if (status === 429) return "totp.error.rateLimited";
  return "common.error";
}

export function isGraceActive(graceUntil: string | null | undefined, now = Date.now()): boolean {
  return !!graceUntil && new Date(graceUntil).getTime() > now;
}

/**
 * Console-wide prompt shown while the signed-in admin has not enrolled in
 * TOTP. Reads /api/admin/totp/status (exempt from the gate) and refreshes when
 * the security page reports a change.
 */
export function TotpBanner() {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const href = useAdminHref();
  const { strip } = useAdminPrefix();
  const onSecurityPage = strip(usePathname() ?? "/") === ADMIN_SECURITY_PATH;
  const [status, setStatus] = useState<AdminTotpStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      adminTotp
        .status()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        // Advisory only: the security page and gated pages surface their own errors.
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    };
    load();
    window.addEventListener(ADMIN_TOTP_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_TOTP_CHANGED_EVENT, load);
    };
  }, []);

  if (!status || status.enrolled) return null;

  const inGrace = isGraceActive(status.graceUntil);
  return (
    <div
      role="status"
      data-testid="admin-totp-banner"
      className={`mb-6 flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm text-fg sm:flex-row sm:items-center sm:justify-between ${
        inGrace ? "border-warning-line bg-warning-soft" : "border-danger-line bg-danger-soft"
      }`}
    >
      <div className="min-w-0">
        <p className="font-semibold">{t("totp.banner.title")}</p>
        <p className="mt-0.5 text-fg-secondary">
          {inGrace ? t("totp.banner.grace", { date: fmt.dateTime(status.graceUntil) }) : t("totp.banner.expired")}
        </p>
      </div>
      {!onSecurityPage && (
        <Link href={href(ADMIN_SECURITY_PATH)} className={linkButton}>
          {t("totp.banner.action")}
        </Link>
      )}
    </div>
  );
}

/** Replaces the generic "no access" state when the TOTP gate blocked a request. */
export function TotpRequiredNotice({ compact = false }: { compact?: boolean }) {
  const t = useAdminT();
  const href = useAdminHref();
  if (compact) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("totp.required.body")}{" "}
        <Link href={href(ADMIN_SECURITY_PATH)} className="font-semibold underline underline-offset-4">
          {t("totp.required.action")}
        </Link>
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-2xl border border-warning-line bg-warning-soft p-6 text-fg">
      <p className="font-semibold">{t("totp.required.title")}</p>
      <p className="mt-1 text-sm text-fg-secondary">{t("totp.required.body")}</p>
      <Link href={href(ADMIN_SECURITY_PATH)} className={`mt-4 ${linkButton}`}>
        {t("totp.required.action")}
      </Link>
    </div>
  );
}
