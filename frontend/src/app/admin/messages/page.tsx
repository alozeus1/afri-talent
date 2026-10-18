"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountRestrictionStatus } from "@/lib/api";
import { adminConsole, BroadcastSegment, ConsoleRole } from "@/lib/admin-console-api";
import { useAdminT } from "@/lib/i18n/admin-messages";
import { MessageComposer } from "@/components/admin/message-composer";
import { Notice, PageHeader, Panel, fieldClass, labelClass, muted, strong } from "@/components/admin/console-ui";

const ROLES: ConsoleRole[] = ["CANDIDATE", "EMPLOYER", "ADMIN"];
const STATUSES: AccountRestrictionStatus[] = ["ACTIVE", "LIMITED", "SUSPENDED"];

export default function AdminBroadcastPage() {
  const t = useAdminT();
  const [role, setRole] = useState<ConsoleRole | "">("");
  const [status, setStatus] = useState<AccountRestrictionStatus | "">("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const segment = (): BroadcastSegment => ({
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(verified ? { emailVerified: verified === "true" } : {}),
  });

  const resetPreview = () => setPreview(null);

  const runPreview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      const res = await adminConsole.broadcast({ segment: segment(), subject: "preview", body: "preview", sendEmail: false, dryRun: true });
      setPreview(res.recipients);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("broadcast.title")} subtitle={t("broadcast.subtitle")} />
      {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel className="lg:col-span-2">
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("broadcast.audience")}</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="bc-role" className={labelClass}>{t("users.filterRole")}</label>
              <select id="bc-role" className={fieldClass} value={role} onChange={(e) => { setRole(e.target.value as ConsoleRole | ""); resetPreview(); }}>
                <option value="">{t("common.all")}</option>
                {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bc-status" className={labelClass}>{t("users.filterStatus")}</label>
              <select id="bc-status" className={fieldClass} value={status} onChange={(e) => { setStatus(e.target.value as AccountRestrictionStatus | ""); resetPreview(); }}>
                <option value="">{t("common.all")}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="bc-verified" className={labelClass}>{t("users.filterVerified")}</label>
              <select id="bc-verified" className={fieldClass} value={verified} onChange={(e) => { setVerified(e.target.value as "" | "true" | "false"); resetPreview(); }}>
                <option value="">{t("common.all")}</option>
                <option value="true">{t("users.verified")}</option>
                <option value="false">{t("users.unverified")}</option>
              </select>
            </div>
            <p className={`text-xs ${muted}`}>{t("broadcast.bannedExcluded")}</p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={runPreview} isLoading={previewing}>{t("broadcast.preview")}</Button>
              {preview !== null && <span className={`text-sm font-medium ${strong}`}>{t("broadcast.recipients", { count: preview })}</span>}
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <h2 className={`mb-4 text-sm font-semibold ${strong}`}>{t("message.title")}</h2>
          <MessageComposer
            submitLabel={t("broadcast.send")}
            onSend={async (input) => {
              const dry = await adminConsole.broadcast({ ...input, segment: segment(), dryRun: true });
              if (!window.confirm(t("broadcast.confirm", { count: dry.recipients }))) {
                throw new Error(t("common.cancel"));
              }
              const res = await adminConsole.broadcast({ ...input, segment: segment() });
              setPreview(res.recipients);
              return { email: res.email };
            }}
            onSent={(msg) => setNotice(msg)}
          />
        </Panel>
      </div>
    </div>
  );
}
