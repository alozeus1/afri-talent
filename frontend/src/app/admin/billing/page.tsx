"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  adminBilling,
  BillingStatus,
  AdminBillingCustomerDetail,
  AdminBillingCustomerSearchResult,
  AdminBillingDashboard,
  AdminBillingDiscrepancy,
  AdminBillingReconciliationRun,
  PlanEntitlements,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminEnum, useAdminFormatters, useAdminT } from "@/lib/i18n/admin-messages";
import {
  EmptyState,
  ErrorState,
  Field,
  KeyValueList,
  Notice,
  PageHeader,
  Panel,
  Pill,
  SkeletonList,
  StatCard,
  Td,
  Th,
  fieldClass,
  labelClass,
  muted,
  statusTone,
  strong,
} from "@/components/admin/console-ui";

type SupportActionType =
  | "NOTE"
  | "RESEND_RECEIPT"
  | "REFUND_REVIEW"
  | "CANCEL_SUBSCRIPTION"
  | "UPGRADE_DOWNGRADE_CORRECTION"
  | "GRANDFATHER_OVERRIDE";
type Capability = "CANDIDATE_PREMIUM" | "CANDIDATE_AI" | "EMPLOYER_PREMIUM";

const SUPPORT_ACTIONS: SupportActionType[] = [
  "NOTE",
  "RESEND_RECEIPT",
  "REFUND_REVIEW",
  "CANCEL_SUBSCRIPTION",
  "UPGRADE_DOWNGRADE_CORRECTION",
  "GRANDFATHER_OVERRIDE",
];

const initialSupportForm = { actionType: "NOTE" as SupportActionType, reasonCode: "support_note", notes: "", invoiceId: "" };
const initialCapabilityForm = {
  capability: "CANDIDATE_AI" as Capability,
  action: "GRANT" as "GRANT" | "REVOKE",
  reasonCode: "admin_capability_access_update",
  notes: "",
};

const candidatePlanOptions: BillingStatus["plan"][] = ["FREE", "BASIC", "PROFESSIONAL"];
const employerPlanOptions: BillingStatus["plan"][] = ["EMPLOYER_FREE", "EMPLOYER_BASIC", "EMPLOYER_PREMIUM"];
const subscriptionStatusOptions: BillingStatus["status"][] = ["ACTIVE", "PAST_DUE", "INACTIVE", "CANCELLED"];
const INVOICE_EXAMPLE = "in_…";

function toDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function buildInitialSubscriptionAccessForm(customer: AdminBillingCustomerDetail | null) {
  const defaultPlan = customer?.role === "EMPLOYER" ? "EMPLOYER_FREE" : "FREE";
  return {
    plan: customer?.subscription?.plan ?? defaultPlan,
    status: customer?.subscription?.status ?? "INACTIVE",
    currentPeriodEnd: toDatetimeLocalValue(customer?.subscription?.currentPeriodEnd ?? null),
    reasonCode: "admin_subscription_access_update",
    notes: "",
  };
}

export default function AdminBillingPage() {
  const t = useAdminT();
  const label = useAdminEnum();
  const fmt = useAdminFormatters();

  const [dashboard, setDashboard] = useState<AdminBillingDashboard | null>(null);
  const [discrepancies, setDiscrepancies] = useState<AdminBillingDiscrepancy[]>([]);
  const [runs, setRuns] = useState<AdminBillingReconciliationRun[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminBillingCustomerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminBillingCustomerDetail | null>(null);
  const [selectedPlanEntitlements, setSelectedPlanEntitlements] = useState<PlanEntitlements[]>([]);
  const [supportForm, setSupportForm] = useState(initialSupportForm);
  const [capabilityForm, setCapabilityForm] = useState(initialCapabilityForm);
  const [subscriptionAccessForm, setSubscriptionAccessForm] = useState(buildInitialSubscriptionAccessForm(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const limit = (value: number | null | boolean | undefined) => {
    if (value === null) return t("billing.unlimited");
    if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
    if (value === undefined) return t("common.notAvailable");
    return fmt.number(value);
  };
  const na = (value: string | null | undefined) => value || t("common.notAvailable");
  const planLabel = (plan: string | null | undefined) => label("plan", plan || "FREE");
  const subStatusLabel = (status: string | null | undefined) => label("subStatus", status || "INACTIVE");

  const loadOverview = useCallback(async () => {
    setLoadError(null);
    try {
      const [dashboardData, discrepanciesData, runsData] = await Promise.all([
        adminBilling.dashboard(),
        adminBilling.discrepancies({ status: "ALL", limit: 25 }),
        adminBilling.reconciliationRuns(10),
      ]);
      setDashboard(dashboardData);
      setDiscrepancies(discrepanciesData.discrepancies);
      setRuns(runsData.runs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    setSubscriptionAccessForm(buildInitialSubscriptionAccessForm(selectedCustomer));
    setCapabilityForm((current) => ({
      ...current,
      capability: selectedCustomer?.role === "EMPLOYER" ? "EMPLOYER_PREMIUM" : "CANDIDATE_AI",
    }));
  }, [selectedCustomer]);

  const openDiscrepancies = useMemo(() => discrepancies.filter((item) => item.status !== "RESOLVED"), [discrepancies]);
  const effectiveEntitlements = selectedCustomer?.billingEntitlementState?.entitlements ?? null;

  const loadCustomer = async (userId: string) => {
    setBusy(`customer:${userId}`);
    setError(null);
    try {
      const response = await adminBilling.customer(userId);
      setSelectedCustomer(response.customer);
      setSelectedPlanEntitlements(response.planEntitlements);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setError(null);
    setSuccess(null);
    try {
      setSuccess(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const refreshCustomer = async () => {
    if (!selectedCustomer) return;
    await Promise.all([loadOverview(), loadCustomer(selectedCustomer.id)]);
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearched(false);
      return;
    }
    setBusy("search");
    setError(null);
    try {
      const response = await adminBilling.searchCustomers(query);
      setSearchResults(response.customers);
      setSearched(true);
      if (response.customers.length === 1) await loadCustomer(response.customers[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  const handleTriggerReconciliation = () =>
    void runAction("reconcile", async () => {
      await adminBilling.triggerReconciliation();
      await loadOverview();
      return t("billing.reconciled");
    });

  const handleResyncEntitlements = () =>
    void runAction("resync", async () => {
      if (!selectedCustomer) return "";
      await adminBilling.resyncEntitlements(selectedCustomer.id);
      await refreshCustomer();
      return t("billing.resynced");
    });

  const handleSubscriptionAccess = (event: FormEvent) => {
    event.preventDefault();
    void runAction("subscription-access", async () => {
      if (!selectedCustomer) return "";
      const response = await adminBilling.updateSubscriptionAccess(selectedCustomer.id, {
        plan: subscriptionAccessForm.plan,
        status: subscriptionAccessForm.status,
        currentPeriodEnd: subscriptionAccessForm.currentPeriodEnd ? new Date(subscriptionAccessForm.currentPeriodEnd).toISOString() : null,
        reasonCode: subscriptionAccessForm.reasonCode,
        notes: subscriptionAccessForm.notes || undefined,
      });
      await refreshCustomer();
      const base = t("billing.subscriptionUpdated", {
        plan: response.state.effectivePlan,
        status: subStatusLabel(response.state.effectiveStatus),
      });
      return response.warnings[0] ? `${base} ${t("billing.warning", { warning: response.warnings[0] })}` : base;
    });
  };

  const handleCapabilityAccess = (event: FormEvent) => {
    event.preventDefault();
    void runAction("capability-access", async () => {
      if (!selectedCustomer) return "";
      const response = await adminBilling.updateCapabilityAccess(selectedCustomer.id, {
        capability: capabilityForm.capability,
        action: capabilityForm.action,
        reasonCode: capabilityForm.reasonCode,
        notes: capabilityForm.notes || undefined,
      });
      await refreshCustomer();
      setCapabilityForm((current) => ({ ...current, notes: "" }));
      const base = t("billing.capabilityUpdated", { plan: response.state.effectivePlan });
      return response.warnings[0] ? `${base} ${t("billing.warning", { warning: response.warnings[0] })}` : base;
    });
  };

  const handleSupportAction = (event: FormEvent) => {
    event.preventDefault();
    void runAction("support", async () => {
      if (!selectedCustomer) return "";
      const response = await adminBilling.supportAction(selectedCustomer.id, {
        actionType: supportForm.actionType,
        reasonCode: supportForm.reasonCode,
        notes: supportForm.notes || undefined,
        invoiceId: supportForm.invoiceId || undefined,
      });
      await refreshCustomer();
      setSupportForm(initialSupportForm);
      return response.receiptDelivery?.message || t("billing.supportRecorded");
    });
  };

  const header = (
    <PageHeader
      eyebrow={t("billing.eyebrow")}
      title={t("billing.title")}
      subtitle={t("billing.subtitle")}
      actions={
        dashboard && (
          <Button onClick={handleTriggerReconciliation} isLoading={busy === "reconcile"}>
            {t("billing.runReconciliation")}
          </Button>
        )
      }
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div>
        {header}
        <ErrorState message={loadError} onRetry={() => void loadOverview()} />
      </div>
    );
  }

  const m = dashboard.metrics;
  const sub = selectedCustomer?.subscription;
  const profile = selectedCustomer?.billingProfile;
  const ent = selectedCustomer?.billingEntitlementState;

  return (
    <div className="space-y-6">
      {header}

      {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}
      {success && <Notice tone="success" onDismiss={() => setSuccess(null)}>{success}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("billing.statSuccessful")} value={fmt.number(m.successfulPayments)} hint={t("billing.since", { date: fmt.date(dashboard.windows.paymentsSince) })} tone="brand" />
        <StatCard label={t("billing.statFailed")} value={fmt.number(m.failedPayments)} tone="warning" />
        <StatCard label={t("billing.statWebhookFailures")} value={fmt.number(m.webhookFailures)} tone="danger" />
        <StatCard label={t("billing.statMismatches")} value={fmt.number(m.mismatchedSubscriptionStates)} tone="neutral" />
        <StatCard label={t("billing.statUnpaidEntitled")} value={fmt.number(m.unpaidButEntitled)} tone="warning" />
        <StatCard label={t("billing.statPaidNotEntitled")} value={fmt.number(m.paidButNotEntitled)} tone="danger" />
        <StatCard label={t("billing.statRefunds")} value={fmt.number(m.pendingRefunds)} tone="info" />
        <StatCard
          label={t("billing.statLastRun")}
          value={dashboard.lastReconciliationRun ? label("reconStatus", dashboard.lastReconciliationRun.status) : t("common.never")}
          hint={dashboard.lastReconciliationRun ? fmt.dateTime(dashboard.lastReconciliationRun.startedAt) : t("billing.noRunYet")}
          tone="neutral"
        />
      </div>

      <Panel title={t("billing.findCustomer")}>
        <form onSubmit={(e) => void handleSearch(e)} className="flex flex-col gap-3 md:flex-row">
          <input
            type="search"
            aria-label={t("billing.findCustomer")}
            placeholder={t("billing.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className={fieldClass}
          />
          <Button type="submit" isLoading={busy === "search"} className="shrink-0">
            {t("common.search")}
          </Button>
        </form>

        {searched && searchResults.length === 0 && <p className={`mt-4 text-sm ${muted}`}>{t("billing.noCustomers")}</p>}
        {searchResults.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {searchResults.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => void loadCustomer(result.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    selectedCustomer?.id === result.id ? "border-primary bg-primary-soft" : "border-line bg-surface hover:border-line-strong hover:bg-surface-sunken"
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className={`font-semibold ${strong}`}>{result.name}</p>
                      <p className={`truncate text-sm ${muted}`}>{result.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone="zinc">{planLabel(result.subscription?.plan)}</Pill>
                      <Pill tone={statusTone(result.subscription?.status || "INACTIVE")}>{subStatusLabel(result.subscription?.status)}</Pill>
                      {result.billingProfile && <Pill tone="blue">{result.billingProfile.region} / {result.billingProfile.currency}</Pill>}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel title={t("billing.discrepancies")}>
          {openDiscrepancies.length === 0 ? (
            <Notice tone="success">{t("billing.noDiscrepancies")}</Notice>
          ) : (
            <ul className="space-y-3">
              {openDiscrepancies.map((item) => (
                <li key={item.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className={`font-semibold ${strong}`}>{item.title}</p>
                      <p className={`mt-0.5 text-sm ${muted}`}>
                        {item.user?.email || t("billing.noLinkedUser")} · {label("discType", item.type)}
                      </p>
                      {item.reasonCode && <code className={`mt-1 block text-xs ${muted}`}>{item.reasonCode}</code>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Pill tone={item.severity === "CRITICAL" || item.severity === "HIGH" ? "red" : "amber"}>{label("risk", item.severity)}</Pill>
                      <Pill tone={statusTone(item.status)}>{label("discStatus", item.status)}</Pill>
                    </div>
                  </div>
                  <p className={`mt-2 text-xs ${muted}`}>
                    {t("billing.detected", { time: fmt.dateTime(item.detectedAt) })}
                    {item.dueAt ? ` · ${t("billing.due", { time: fmt.dateTime(item.dueAt) })}` : ""}
                  </p>
                  {item.user?.id && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => void loadCustomer(item.user!.id)}>
                      {t("billing.openCustomer")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("billing.runs")}>
          {runs.length === 0 ? (
            <p className={`text-sm ${muted}`}>{t("billing.noRuns")}</p>
          ) : (
            <ul className="space-y-3">
              {runs.map((run) => (
                <li key={run.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Pill tone={statusTone(run.status)}>{label("reconStatus", run.status)}</Pill>
                    <span className={`text-xs ${muted}`}>{fmt.dateTime(run.startedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm text-fg-secondary">
                    {t("billing.runSummary", {
                      checked: fmt.number(run.checkedSubscriptions),
                      mismatches: fmt.number(run.subscriptionMismatches),
                      failed: fmt.number(run.failedPayments),
                      refunds: fmt.number(run.pendingRefunds),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {selectedCustomer && (
        <section className="space-y-6" aria-labelledby="billing-customer">
          <Panel>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 id="billing-customer" className={`text-xl font-semibold ${strong}`}>{selectedCustomer.name}</h2>
                <p className={`text-sm ${muted}`}>{selectedCustomer.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Pill tone="zinc">{planLabel(sub?.plan)}</Pill>
                <Pill tone={statusTone(sub?.status || "INACTIVE")}>{subStatusLabel(sub?.status)}</Pill>
                {profile?.isGrandfathered && <Pill tone="blue">{t("billing.grandfathered", { version: profile.pricingVersion })}</Pill>}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-line p-4">
                <p className={labelClass}>{t("billing.profile")}</p>
                <KeyValueList
                  items={[
                    { label: t("billing.region"), value: profile?.region || "ROW" },
                    { label: t("billing.country"), value: na(profile?.country) },
                    { label: t("billing.stripeCountry"), value: na(profile?.stripeCountry) },
                    { label: t("billing.currency"), value: profile?.currency || "USD" },
                    { label: t("billing.taxId"), value: na(profile?.taxIdValue) },
                  ]}
                />
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className={labelClass}>{t("billing.subscription")}</p>
                <KeyValueList
                  items={[
                    { label: t("billing.provider"), value: na(sub?.billingProvider) },
                    { label: t("billing.providerCustomer"), value: na(sub?.providerCustomerId) },
                    { label: t("billing.providerSubscription"), value: na(sub?.providerSubscriptionId) },
                    { label: t("billing.stripeCustomer"), value: na(sub?.stripeCustomerId) },
                    { label: t("billing.stripeSubscription"), value: na(sub?.stripeSubId) },
                    { label: t("billing.periodEnd"), value: sub?.currentPeriodEnd ? fmt.dateTime(sub.currentPeriodEnd) : t("common.notAvailable") },
                  ]}
                />
              </div>
              <div className="rounded-xl border border-line p-4">
                <p className={labelClass}>{t("billing.entitlementState")}</p>
                <KeyValueList
                  items={[
                    { label: t("billing.effectivePlan"), value: planLabel(ent?.effectivePlan) },
                    { label: t("billing.effectiveStatus"), value: subStatusLabel(ent?.effectiveStatus) },
                    { label: t("billing.synced"), value: ent?.lastSyncedAt ? fmt.dateTime(ent.lastSyncedAt) : t("common.never") },
                    { label: t("billing.checksum"), value: <code>{ent?.checksum?.slice(0, 12) || t("common.notAvailable")}</code> },
                  ]}
                />
                <Button variant="outline" size="sm" className="mt-3" onClick={handleResyncEntitlements} isLoading={busy === "resync"}>
                  {t("billing.resync")}
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title={t("billing.capabilityTitle")}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-xl border border-line bg-surface-sunken p-4">
                <p className={labelClass}>{t("billing.currentCapabilities")}</p>
                <KeyValueList
                  items={[
                    { label: t("ent.aiResumeReviews"), value: limit(effectiveEntitlements?.aiResumeReviews) },
                    { label: t("ent.aiJobMatches"), value: limit(effectiveEntitlements?.aiJobMatches) },
                    { label: t("ent.aiApplyPacks"), value: limit(effectiveEntitlements?.aiApplyPacks) },
                    { label: t("ent.chatAccess"), value: limit(effectiveEntitlements?.chatAccess) },
                    { label: t("ent.autopilot"), value: limit(effectiveEntitlements?.autopilot) },
                    { label: t("ent.prioritySupport"), value: limit(effectiveEntitlements?.prioritySupport) },
                    { label: t("ent.talentSearch"), value: limit(effectiveEntitlements?.talentSearch) },
                    { label: t("ent.apiAccess"), value: limit(effectiveEntitlements?.apiAccess) },
                  ]}
                />
              </div>

              <form onSubmit={handleCapabilityAccess} className="space-y-4 rounded-xl border border-line p-4">
                <Notice tone="warning">{t("billing.capabilityHelp")}</Notice>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label={t("billing.capability")}>
                    {(id) => (
                      <select id={id} className={fieldClass} value={capabilityForm.capability}
                        onChange={(e) => setCapabilityForm((c) => ({ ...c, capability: e.target.value as Capability }))}>
                        {(selectedCustomer.role === "EMPLOYER" ? (["EMPLOYER_PREMIUM"] as const) : (["CANDIDATE_PREMIUM", "CANDIDATE_AI"] as const)).map((cap) => (
                          <option key={cap} value={cap}>{t(`capability.${cap}`)}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field label={t("trust.action")}>
                    {(id) => (
                      <select id={id} className={fieldClass} value={capabilityForm.action}
                        onChange={(e) => setCapabilityForm((c) => ({ ...c, action: e.target.value as "GRANT" | "REVOKE" }))}>
                        <option value="GRANT">{t("billing.grant")}</option>
                        <option value="REVOKE">{t("billing.revoke")}</option>
                      </select>
                    )}
                  </Field>
                  <Field label={t("common.reasonCode")}>
                    {(id) => <input id={id} className={`${fieldClass} font-mono`} value={capabilityForm.reasonCode}
                      onChange={(e) => setCapabilityForm((c) => ({ ...c, reasonCode: e.target.value }))} />}
                  </Field>
                </div>
                <Field label={t("billing.auditNotes")}>
                  {(id) => <textarea id={id} rows={3} className={fieldClass} value={capabilityForm.notes} placeholder={t("billing.capabilityNotesPlaceholder")}
                    onChange={(e) => setCapabilityForm((c) => ({ ...c, notes: e.target.value }))} />}
                </Field>
                <Button type="submit" isLoading={busy === "capability-access"}>{t("billing.applyCapability")}</Button>
              </form>
            </div>

            {selectedPlanEntitlements.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-xl border border-line">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-line text-sm">
                    <thead>
                      <tr>
                        <Th>{t("billing.plan")}</Th>
                        <Th>{t("ent.aiResumeReviews")}</Th>
                        <Th>{t("ent.aiJobMatches")}</Th>
                        <Th>{t("ent.aiApplyPacks")}</Th>
                        <Th>{t("ent.chatAccess")}</Th>
                        <Th>{t("ent.autopilot")}</Th>
                        <Th>{t("ent.employerPremium")}</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-surface">
                      {selectedPlanEntitlements.map((plan) => (
                        <tr key={plan.plan}>
                          <Td className="font-semibold">{planLabel(plan.plan)}</Td>
                          <Td>{limit(plan.aiResumeReviews)}</Td>
                          <Td>{limit(plan.aiJobMatches)}</Td>
                          <Td>{limit(plan.aiApplyPacks)}</Td>
                          <Td>{limit(plan.chatAccess)}</Td>
                          <Td>{limit(plan.autopilot)}</Td>
                          <Td>{limit(plan.apiAccess || plan.pipelineExports || plan.advancedFunnelMetrics)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Panel>

          <Panel title={t("billing.overrideTitle")} description={t("billing.overrideHelp")}>
            {(sub?.billingProvider || sub?.providerSubscriptionId || sub?.stripeSubId) && (
              <Notice tone="warning">{t("billing.providerLinkedWarning")}</Notice>
            )}
            <form onSubmit={handleSubscriptionAccess} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label={t("billing.plan")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={subscriptionAccessForm.plan}
                      onChange={(e) => setSubscriptionAccessForm((c) => ({ ...c, plan: e.target.value as BillingStatus["plan"] }))}>
                      {(selectedCustomer.role === "EMPLOYER" ? employerPlanOptions : candidatePlanOptions).map((plan) => (
                        <option key={plan} value={plan}>{planLabel(plan)}</option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label={t("common.status")}>
                  {(id) => (
                    <select id={id} className={fieldClass} value={subscriptionAccessForm.status}
                      onChange={(e) => setSubscriptionAccessForm((c) => ({ ...c, status: e.target.value as BillingStatus["status"] }))}>
                      {subscriptionStatusOptions.map((s) => <option key={s} value={s}>{subStatusLabel(s)}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={t("billing.periodEnd")}>
                  {(id) => <input id={id} type="datetime-local" className={fieldClass} value={subscriptionAccessForm.currentPeriodEnd}
                    onChange={(e) => setSubscriptionAccessForm((c) => ({ ...c, currentPeriodEnd: e.target.value }))} />}
                </Field>
                <Field label={t("common.reasonCode")}>
                  {(id) => <input id={id} className={`${fieldClass} font-mono`} value={subscriptionAccessForm.reasonCode}
                    onChange={(e) => setSubscriptionAccessForm((c) => ({ ...c, reasonCode: e.target.value }))} />}
                </Field>
              </div>
              <Field label={t("billing.auditNotes")}>
                {(id) => <textarea id={id} rows={4} className={fieldClass} value={subscriptionAccessForm.notes} placeholder={t("billing.overrideNotesPlaceholder")}
                  onChange={(e) => setSubscriptionAccessForm((c) => ({ ...c, notes: e.target.value }))} />}
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" isLoading={busy === "subscription-access"}>{t("billing.updateAccess")}</Button>
                <p className={`text-xs ${muted}`}>
                  {selectedCustomer.role === "EMPLOYER" ? t("billing.rolePlansEmployer") : t("billing.rolePlansCandidate")}
                </p>
              </div>
            </form>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Panel title={t("billing.history")}>
              {selectedCustomer.billingEvents.length === 0 ? (
                <EmptyState title={t("billing.noEvents")} />
              ) : (
                <ul className="space-y-3">
                  {selectedCustomer.billingEvents.map((event) => (
                    <li key={event.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <p className={`break-all font-mono text-sm font-semibold ${strong}`}>{event.eventType}</p>
                          <p className={`mt-0.5 text-sm ${muted}`}>
                            {fmt.money(event.amountMinor, event.currency)} · {event.source}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Pill tone={statusTone(event.outcome)}>{label("eventOutcome", event.outcome)}</Pill>
                          {event.status && <Pill tone="blue">{event.status}</Pill>}
                        </div>
                      </div>
                      <p className={`mt-2 text-xs ${muted}`}>{fmt.dateTime(event.createdAt)}</p>
                      <p className={`break-all text-xs ${muted}`}>
                        {t("billing.invoiceRefund", { invoice: na(event.stripeInvoiceId), refund: na(event.stripeRefundId) })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("billing.supportActions")}>
              <form onSubmit={handleSupportAction} className="space-y-3 rounded-xl border border-line p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("billing.actionType")}>
                    {(id) => (
                      <select id={id} className={fieldClass} value={supportForm.actionType}
                        onChange={(e) => setSupportForm((c) => ({ ...c, actionType: e.target.value as SupportActionType }))}>
                        {SUPPORT_ACTIONS.map((a) => <option key={a} value={a}>{t(`billingAction.${a}`)}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label={t("common.reasonCode")}>
                    {(id) => <input id={id} className={`${fieldClass} font-mono`} value={supportForm.reasonCode}
                      onChange={(e) => setSupportForm((c) => ({ ...c, reasonCode: e.target.value }))} />}
                  </Field>
                </div>
                <Field label={t("billing.invoiceId")}>
                  {(id) => <input id={id} className={`${fieldClass} font-mono`} value={supportForm.invoiceId} placeholder={INVOICE_EXAMPLE}
                    onChange={(e) => setSupportForm((c) => ({ ...c, invoiceId: e.target.value }))} />}
                </Field>
                <Field label={t("common.notes")}>
                  {(id) => <textarea id={id} rows={4} className={fieldClass} value={supportForm.notes} placeholder={t("billing.supportNotesPlaceholder")}
                    onChange={(e) => setSupportForm((c) => ({ ...c, notes: e.target.value }))} />}
                </Field>
                <Button type="submit" isLoading={busy === "support"}>{t("billing.recordAction")}</Button>
              </form>

              <div className="mt-4">
                {selectedCustomer.billingSupportActions.length === 0 ? (
                  <p className={`text-sm ${muted}`}>{t("billing.noSupportActions")}</p>
                ) : (
                  <ul className="space-y-3">
                    {selectedCustomer.billingSupportActions.map((action) => (
                      <li key={action.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={`font-semibold ${strong}`}>{label("billingAction", action.actionType)}</p>
                          <code className={`text-xs ${muted}`}>{action.reasonCode}</code>
                        </div>
                        <p className="mt-1 text-sm text-fg-secondary">{action.notes || t("common.noNotes")}</p>
                        <p className={`mt-2 text-xs ${muted}`}>
                          {action.actor?.name || t("role.ADMIN")} · {fmt.dateTime(action.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </div>
        </section>
      )}
    </div>
  );
}
