"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { admin, AdminPermission } from "@/lib/api";
import { adminConsole, ConsoleUserDetail, LifecycleAction } from "@/lib/admin-console-api";
import { hasAdminKey, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  ConfirmRequest,
  Drawer,
  Notice,
  Pill,
  Spinner,
  fieldClass,
  jobStatusTone,
  labelClass,
  muted,
  restrictionTone,
  strong,
  verificationTone,
} from "./console-ui";
import { MessageComposer } from "./message-composer";

const ALL_PERMISSIONS: AdminPermission[] = [
  "VIEW_USERS",
  "MANAGE_USER_ACCOUNTS",
  "RESTRICT_USER_ACCOUNT",
  "RESET_USER_PASSWORD",
  "VIEW_AUDIT_LOGS",
  "VIEW_HEALTH_STATUS",
  "MANAGE_ALERTS",
  "VIEW_SYSTEMS_METRICS",
  "REVIEW_JOBS",
  "REVIEW_APPLICATIONS",
  "REVIEW_RESOURCES",
  "REVIEW_COMPANY_DATA",
  "VIEW_TRUST_CASES",
  "MANAGE_TRUST_CASES",
  "VIEW_ABUSE_REPORTS",
  "MANAGE_ABUSE_REPORTS",
  "VIEW_VERIFICATION_ARTIFACTS",
  "APPROVE_VERIFICATION",
  "VIEW_BILLING_DATA",
  "MANAGE_BILLING_DISPUTES",
  "VIEW_REVENUE_REPORTS",
  "EXPORT_DATA",
  "RUN_BULK_OPERATIONS",
  "MODIFY_BULK_DATA",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--border-soft)] py-5 first:border-t-0 first:pt-0">
      <h3 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${muted}`}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className={`text-xs ${muted}`}>{label}</dt>
      <dd className={`mt-0.5 text-sm ${strong}`}>{value}</dd>
    </div>
  );
}

export function UserDetailDrawer({
  userId,
  currentAdminId,
  onClose,
  onChanged,
  onConfirm,
}: {
  userId: string | null;
  currentAdminId: string;
  onClose: () => void;
  onChanged: () => void;
  onConfirm: (request: ConfirmRequest) => void;
}) {
  const t = useAdminT();
  const fmt = useAdminFormatters();
  const [detail, setDetail] = useState<ConsoleUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<{ role: "ADMIN" | "CANDIDATE" | "EMPLOYER"; permissions: AdminPermission[]; reason: string }>({
    role: "CANDIDATE",
    permissions: ["VIEW_USERS"],
    reason: "",
  });
  const [savingRole, setSavingRole] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminConsole.user(id);
      setDetail(data);
      setRoleForm({
        role: data.user.role,
        permissions: (data.user.adminRole?.permissions as AdminPermission[] | undefined) ?? ["VIEW_USERS"],
        reason: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setNotice(null);
    setDetail(null);
    if (userId) void load(userId);
  }, [userId, load]);

  if (!userId) return null;

  const user = detail?.user;
  const isSelf = user?.id === currentAdminId;
  const status = user?.accountRestrictionStatus;

  const lifecycle = (action: LifecycleAction) => {
    if (!user) return;
    onConfirm({
      title: t("confirm.title", { action: t(`action.${action}`), target: user.email }),
      description: t(`actionHelp.${action}`),
      confirmLabel: t(`action.${action}`),
      danger: action === "ban" || action === "suspend",
      withDate: action === "suspend" ? { label: t("action.suspendUntil"), help: t("action.indefinite") } : undefined,
      onConfirm: async ({ reason, date }) => {
        await adminConsole.lifecycle(user.id, { action, reason, until: action === "suspend" ? date : undefined });
        setNotice(t("action.applied", { action: t(`action.${action}`) }));
        await load(user.id);
        onChanged();
      },
    });
  };

  const saveRole = async () => {
    if (!user) return;
    if (roleForm.reason.trim().length < 3) {
      setError(t("common.reasonTooShort"));
      return;
    }
    setSavingRole(true);
    setError(null);
    try {
      await admin.updateUserRole(user.id, {
        role: roleForm.role,
        permissions: roleForm.role === "ADMIN" ? roleForm.permissions : undefined,
        reason: roleForm.reason.trim(),
      });
      setNotice(t("roles.saved"));
      await load(user.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSavingRole(false);
    }
  };

  const lookup = (key: string, fallback: string) =>
    hasAdminKey(key) ? t(key) : fallback.replace(/_/g, " ").toLowerCase();
  const riskLabel = (level: string) => lookup(`risk.${level}`, level);
  const candidateVerifyLabel = (level: string) => lookup(`cverify.${level}`, level);
  const appStatusLabel = (st: string) => lookup(`appStatus.${st}`, st);

  const initials = (user?.name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Drawer open={Boolean(userId)} title={user?.name ?? t("common.loading")} onClose={onClose}>
      {loading && !detail ? (
        <Spinner />
      ) : error && !detail ? (
        <Notice tone="error">{error}</Notice>
      ) : user && detail ? (
        <div>
          {notice && <Notice tone="success" onDismiss={() => setNotice(null)}>{notice}</Notice>}
          {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}

          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className={`truncate text-base font-semibold ${strong}`}>{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={user.role === "ADMIN" ? "violet" : user.role === "EMPLOYER" ? "blue" : "green"}>{t(`role.${user.role}`)}</Pill>
                <Pill tone={restrictionTone[user.accountRestrictionStatus]}>
                  {t(`status.${user.accountRestrictionStatus}`)}
                  {user.accountRestrictedUntil ? ` · ${t("users.until", { date: fmt.date(user.accountRestrictedUntil) })}` : ""}
                </Pill>
                <Pill tone={user.emailVerified ? "green" : "amber"}>
                  {user.emailVerified ? t("users.verified") : t("users.unverified")}
                </Pill>
              </div>
              {user.accountRestrictionReason && (
                <p className={`mt-2 text-sm ${muted}`}>
                  {t("detail.restriction")}: <span className={strong}>{user.accountRestrictionReason}</span>
                </p>
              )}
            </div>
          </div>

          {!isSelf && (
            <Section title={t("detail.lifecycle")}>
              <div className="flex flex-wrap gap-2">
                {status === "ACTIVE" || status === "LIMITED" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => lifecycle("suspend")} disabled={user.role === "ADMIN"}>
                      {t("action.suspend")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => lifecycle("ban")} disabled={user.role === "ADMIN"}>
                      {t("action.ban")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => lifecycle("reactivate")}>{t("action.reactivate")}</Button>
                    {status === "SUSPENDED" && (
                      <Button size="sm" variant="danger" onClick={() => lifecycle("ban")}>{t("action.ban")}</Button>
                    )}
                  </>
                )}
                {status === "LIMITED" && (
                  <Button size="sm" variant="outline" onClick={() => lifecycle("reactivate")}>{t("action.reactivate")}</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => lifecycle("revoke_sessions")}>{t("action.revoke_sessions")}</Button>
                <Button size="sm" variant="outline" onClick={() => lifecycle("force_reverify")}>{t("action.force_reverify")}</Button>
              </div>
            </Section>
          )}

          <Section title={t("detail.profile")}>
            <dl className="grid grid-cols-2 gap-4">
              <Field label={t("detail.joined")} value={fmt.date(user.createdAt)} />
              <Field label={t("detail.locale")} value={user.preferredLocale?.toUpperCase() ?? "—"} />
              <Field label={t("detail.emailVerified")} value={user.emailVerifiedAt ? fmt.date(user.emailVerifiedAt) : t("common.no")} />
              <Field label={t("detail.phoneVerified")} value={user.phoneVerifiedAt ? fmt.date(user.phoneVerifiedAt) : t("common.no")} />
              {user.sessionsRevokedAt && <Field label={t("detail.sessionsRevoked")} value={fmt.dateTime(user.sessionsRevokedAt)} />}
              {user.employer && <Field label={t("detail.company")} value={user.employer.companyName} />}
              {user.candidateProfile?.headline && <Field label={t("detail.headline")} value={user.candidateProfile.headline} />}
            </dl>
          </Section>

          <Section title={t("detail.trust")}>
            <dl className="grid grid-cols-2 gap-4">
              <Field label={t("detail.openReports")} value={detail.trust.openReportsAgainst} />
              {user.employer?.trustProfile && (
                <>
                  <Field
                    label={t("detail.verification")}
                    value={<Pill tone={verificationTone[user.employer.trustProfile.verificationLevel]}>{t(`verify.${user.employer.trustProfile.verificationLevel}`)}</Pill>}
                  />
                  <Field label={t("detail.riskLevel")} value={`${riskLabel(user.employer.trustProfile.riskLevel)} · ${user.employer.trustProfile.riskScore}`} />
                  <Field
                    label={t("companies.colVerification")}
                    value={user.employer.trustProfile.postingEligibility ? t("companies.postingEligible") : t("companies.postingBlocked")}
                  />
                </>
              )}
              {user.candidateTrustProfile && (
                <>
                  <Field label={t("detail.verification")} value={candidateVerifyLabel(user.candidateTrustProfile.verificationLevel)} />
                  <Field label={t("detail.riskLevel")} value={`${riskLabel(user.candidateTrustProfile.riskLevel)} · ${user.candidateTrustProfile.riskScore}`} />
                </>
              )}
            </dl>
          </Section>

          {detail.applications.length > 0 && (
            <Section title={t("detail.applications")}>
              <ul className="space-y-2">
                {detail.applications.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">
                      {a.job.title} · <span className={muted}>{a.job.employer?.companyName ?? a.job.sourceName ?? "—"}</span>
                    </span>
                    <span className={`shrink-0 text-xs ${muted}`}>{appStatusLabel(a.status)} · {fmt.date(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.jobs.length > 0 && (
            <Section title={t("detail.jobs")}>
              <ul className="space-y-2">
                {detail.jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-200">{j.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Pill tone={jobStatusTone[j.status]}>{t(`jobStatus.${j.status}`)}</Pill>
                      <span className={`text-xs ${muted}`}>{j._count.applications}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!isSelf && (
            <Section title={t("message.title")}>
              <MessageComposer
                compact
                onSend={(input) => adminConsole.message(user.id, input)}
                onSent={(msg) => setNotice(msg)}
              />
            </Section>
          )}

          <Section title={t("detail.activity")}>
            {detail.activity.length === 0 ? (
              <p className={`text-sm ${muted}`}>{t("detail.noActivity")}</p>
            ) : (
              <ol className="relative space-y-3 border-s border-[var(--border-soft)] ps-4">
                {detail.activity.map((item, i) => (
                  <li key={`${item.kind}-${i}`} className="text-sm">
                    <span className="absolute -start-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-[var(--surface)] bg-emerald-500" aria-hidden />
                    <p className="text-zinc-800 dark:text-zinc-200">{item.label}</p>
                    <p className={`text-xs ${muted}`}>{fmt.dateTime(item.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title={t("detail.audit")}>
            {detail.auditTrail.length === 0 ? (
              <p className={`text-sm ${muted}`}>{t("detail.noAudit")}</p>
            ) : (
              <ul className="space-y-3">
                {detail.auditTrail.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-[var(--border-soft)] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-medium ${strong}`}>{entry.action.replace(/_/g, " ").toLowerCase()}</span>
                      <span className={`text-xs ${muted}`}>{fmt.dateTime(entry.createdAt)}</span>
                    </div>
                    {entry.reason && <p className="mt-1 text-zinc-700 dark:text-zinc-300">{entry.reason}</p>}
                    <p className={`mt-1 text-xs ${muted}`}>
                      {entry.admin?.admin
                        ? t("detail.by", { name: entry.admin.admin.name || entry.admin.admin.email })
                        : t("detail.system")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {!isSelf && (
            <Section title={t("roles.title")}>
              <div className="space-y-3">
                <div>
                  <label htmlFor="admin-role-select" className={labelClass}>{t("users.colRole")}</label>
                  <select
                    id="admin-role-select"
                    className={fieldClass}
                    value={roleForm.role}
                    onChange={(e) => setRoleForm((f) => ({ ...f, role: e.target.value as typeof f.role }))}
                  >
                    {(["CANDIDATE", "EMPLOYER", "ADMIN"] as const).map((r) => (
                      <option key={r} value={r}>{t(`role.${r}`)}</option>
                    ))}
                  </select>
                </div>
                {roleForm.role === "ADMIN" && (
                  <fieldset>
                    <legend className={labelClass}>{t("roles.permissions")}</legend>
                    <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-[var(--border-soft)] p-2 sm:grid-cols-2">
                      {ALL_PERMISSIONS.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={roleForm.permissions.includes(p)}
                            onChange={(e) =>
                              setRoleForm((f) => ({
                                ...f,
                                permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p),
                              }))
                            }
                          />
                          <span className="font-mono">{p}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div>
                  <label htmlFor="admin-role-reason" className={labelClass}>{t("common.reason")}</label>
                  <input
                    id="admin-role-reason"
                    className={fieldClass}
                    value={roleForm.reason}
                    maxLength={500}
                    onChange={(e) => setRoleForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={saveRole} isLoading={savingRole}>
                  {t("roles.save")}
                </Button>
              </div>
            </Section>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}
