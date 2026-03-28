"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  adminBilling,
  AdminBillingCustomerDetail,
  AdminBillingCustomerSearchResult,
  AdminBillingDashboard,
  AdminBillingDiscrepancy,
  AdminBillingReconciliationRun,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const initialSupportForm = {
  actionType: "NOTE" as const,
  reasonCode: "support_note",
  notes: "",
  invoiceId: "",
};

function formatMinorAmount(amountMinor: number | null, currency: string | null) {
  if (amountMinor == null) return "n/a";
  const normalizedCurrency = currency?.toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${normalizedCurrency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

export default function AdminBillingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [dashboard, setDashboard] = useState<AdminBillingDashboard | null>(null);
  const [discrepancies, setDiscrepancies] = useState<AdminBillingDiscrepancy[]>([]);
  const [runs, setRuns] = useState<AdminBillingReconciliationRun[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminBillingCustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminBillingCustomerDetail | null>(null);
  const [supportForm, setSupportForm] = useState(initialSupportForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.push("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      void loadOverview();
    }
  }, [user]);

  const openDiscrepancies = useMemo(
    () => discrepancies.filter((item) => item.status !== "RESOLVED"),
    [discrepancies],
  );

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, discrepanciesData, runsData] = await Promise.all([
        adminBilling.dashboard(),
        adminBilling.discrepancies({ status: "ALL", limit: 25 }),
        adminBilling.reconciliationRuns(10),
      ]);
      setDashboard(dashboardData);
      setDiscrepancies(discrepanciesData.discrepancies);
      setRuns(runsData.runs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load billing operations data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomer(userId: string) {
    setBusy(`customer:${userId}`);
    setError(null);
    try {
      const response = await adminBilling.customer(userId);
      setSelectedCustomer(response.customer);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load customer billing details.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setBusy("search");
    setError(null);
    try {
      const response = await adminBilling.searchCustomers(searchQuery.trim());
      setSearchResults(response.customers);
      if (response.customers.length === 1) {
        await loadCustomer(response.customers[0].id);
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Customer search failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleTriggerReconciliation() {
    setBusy("reconcile");
    setError(null);
    setSuccess(null);
    try {
      await adminBilling.triggerReconciliation();
      await loadOverview();
      setSuccess("Manual billing reconciliation completed.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to run reconciliation.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResyncEntitlements() {
    if (!selectedCustomer) return;
    setBusy("resync");
    setError(null);
    setSuccess(null);
    try {
      await adminBilling.resyncEntitlements(selectedCustomer.id);
      await Promise.all([loadOverview(), loadCustomer(selectedCustomer.id)]);
      setSuccess("Entitlements were re-synced and stale state was cleared.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to re-sync entitlements.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSupportAction(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setBusy("support");
    setError(null);
    setSuccess(null);

    try {
      const response = await adminBilling.supportAction(selectedCustomer.id, {
        actionType: supportForm.actionType,
        reasonCode: supportForm.reasonCode,
        notes: supportForm.notes || undefined,
        invoiceId: supportForm.invoiceId || undefined,
      });
      await Promise.all([loadOverview(), loadCustomer(selectedCustomer.id)]);
      setSupportForm(initialSupportForm);
      setSuccess(response.receiptDelivery?.message || "Billing support action recorded.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to record support action.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (loading || !dashboard) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-emerald-50 p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 mb-3">
              Admin Billing Operations
            </p>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Reconciliation, support, and pricing safety</h1>
            <p className="max-w-3xl text-lg text-gray-600">
              Track webhook health, subscription state drift, pending refunds, and entitlement sync issues before they become finance or support escalations.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin">
              <Button variant="outline">Back to admin</Button>
            </Link>
            <Button onClick={handleTriggerReconciliation} disabled={busy === "reconcile"}>
              {busy === "reconcile" ? "Running..." : "Run reconciliation"}
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Successful payments</p>
            <p className="mt-3 text-3xl font-bold text-emerald-700">{dashboard.metrics.successfulPayments}</p>
            <p className="mt-1 text-xs text-gray-500">Since {new Date(dashboard.windows.paymentsSince).toLocaleDateString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Failed payments</p>
            <p className="mt-3 text-3xl font-bold text-amber-700">{dashboard.metrics.failedPayments}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Webhook failures</p>
            <p className="mt-3 text-3xl font-bold text-red-700">{dashboard.metrics.webhookFailures}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Subscription mismatches</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{dashboard.metrics.mismatchedSubscriptionStates}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Unpaid but entitled</p>
            <p className="mt-3 text-3xl font-bold text-orange-700">{dashboard.metrics.unpaidButEntitled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Paid but not entitled</p>
            <p className="mt-3 text-3xl font-bold text-red-800">{dashboard.metrics.paidButNotEntitled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pending refunds</p>
            <p className="mt-3 text-3xl font-bold text-blue-700">{dashboard.metrics.pendingRefunds}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Last reconciliation</p>
            <p className="mt-3 text-lg font-bold text-slate-900">
              {dashboard.lastReconciliationRun ? dashboard.lastReconciliationRun.status : "Never"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {dashboard.lastReconciliationRun
                ? new Date(dashboard.lastReconciliationRun.startedAt).toLocaleString()
                : "No run recorded yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Find customer billing history</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder="Search by email, name, user ID, Stripe customer ID, or subscription ID"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button type="submit" disabled={busy === "search"}>
              {busy === "search" ? "Searching..." : "Search"}
            </Button>
          </form>

          {searchResults.length > 0 && (
            <div className="grid gap-3">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => void loadCustomer(result.id)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-emerald-300"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{result.name}</p>
                      <p className="text-sm text-gray-600">{result.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default">{result.subscription?.plan || "FREE"}</Badge>
                      <Badge variant={result.subscription?.status === "ACTIVE" ? "success" : "warning"}>
                        {result.subscription?.status || "INACTIVE"}
                      </Badge>
                      {result.billingProfile && (
                        <Badge variant="info">
                          {result.billingProfile.region} / {result.billingProfile.currency}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Open discrepancy queue</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {openDiscrepancies.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                No open billing discrepancies. Reconciliation is clean right now.
              </div>
            ) : (
              openDiscrepancies.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {item.user?.email || "No linked user"} • {item.type.replaceAll("_", " ")}
                      </p>
                      {item.reasonCode && (
                        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">
                          Reason: {item.reasonCode}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={item.severity === "CRITICAL" || item.severity === "HIGH" ? "danger" : "warning"}>
                        {item.severity}
                      </Badge>
                      <Badge variant="info">{item.status}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>Detected {new Date(item.detectedAt).toLocaleString()}</span>
                    {item.dueAt && <span>Due {new Date(item.dueAt).toLocaleString()}</span>}
                  </div>
                  {item.user?.id && (
                    <div className="mt-4">
                      <Button variant="outline" onClick={() => void loadCustomer(item.user!.id)}>
                        Open customer
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">Recent reconciliation runs</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm text-gray-600">No reconciliation runs recorded yet.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-gray-900">{run.status}</p>
                    <Badge variant={run.status === "FAILED" ? "danger" : run.status === "PARTIAL" ? "warning" : "success"}>
                      {run.checkedSubscriptions} checked
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    <p>{new Date(run.startedAt).toLocaleString()}</p>
                    <p>
                      {run.subscriptionMismatches} mismatches • {run.failedPayments} failed payments • {run.pendingRefunds} pending refunds
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selectedCustomer && (
        <section className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900">{selectedCustomer.name}</h2>
                  <p className="text-sm text-gray-600">{selectedCustomer.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">{selectedCustomer.subscription?.plan || "FREE"}</Badge>
                  <Badge variant={selectedCustomer.subscription?.status === "ACTIVE" ? "success" : "warning"}>
                    {selectedCustomer.subscription?.status || "INACTIVE"}
                  </Badge>
                  {selectedCustomer.billingProfile?.isGrandfathered && (
                    <Badge variant="info">Grandfathered v{selectedCustomer.billingProfile.pricingVersion}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Billing profile</p>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <p>Region: {selectedCustomer.billingProfile?.region || "ROW"}</p>
                  <p>Country: {selectedCustomer.billingProfile?.country || "n/a"}</p>
                  <p>Stripe country: {selectedCustomer.billingProfile?.stripeCountry || "n/a"}</p>
                  <p>Currency: {selectedCustomer.billingProfile?.currency || "USD"}</p>
                  <p>VAT / Tax ID: {selectedCustomer.billingProfile?.taxIdValue || "n/a"}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Subscription</p>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <p>Stripe customer: {selectedCustomer.subscription?.stripeCustomerId || "n/a"}</p>
                  <p>Stripe subscription: {selectedCustomer.subscription?.stripeSubId || "n/a"}</p>
                  <p>Current period end: {selectedCustomer.subscription?.currentPeriodEnd ? new Date(selectedCustomer.subscription.currentPeriodEnd).toLocaleString() : "n/a"}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Entitlement state</p>
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <p>Effective plan: {selectedCustomer.billingEntitlementState?.effectivePlan || "FREE"}</p>
                  <p>Synced: {selectedCustomer.billingEntitlementState?.lastSyncedAt ? new Date(selectedCustomer.billingEntitlementState.lastSyncedAt).toLocaleString() : "never"}</p>
                  <p>Checksum: {selectedCustomer.billingEntitlementState?.checksum?.slice(0, 12) || "n/a"}</p>
                </div>
                <div className="mt-4">
                  <Button variant="outline" onClick={handleResyncEntitlements} disabled={busy === "resync"}>
                    {busy === "resync" ? "Re-syncing..." : "Re-sync entitlements"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <Card className="border-slate-200">
              <CardHeader>
                <h3 className="text-xl font-semibold text-gray-900">Payment, invoice, and webhook history</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedCustomer.billingEvents.length === 0 ? (
                  <p className="text-sm text-gray-600">No billing events recorded yet.</p>
                ) : (
                  selectedCustomer.billingEvents.map((event) => (
                    <div key={event.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{event.eventType}</p>
                          <p className="mt-1 text-sm text-gray-600">
                            {formatMinorAmount(event.amountMinor, event.currency)} • {event.source}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={event.outcome === "FAILED" ? "danger" : event.outcome === "DUPLICATE" ? "warning" : "success"}>
                            {event.outcome}
                          </Badge>
                          {event.status && <Badge variant="info">{event.status}</Badge>}
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-500">
                        <p>{new Date(event.createdAt).toLocaleString()}</p>
                        <p>Invoice: {event.stripeInvoiceId || "n/a"} • Refund: {event.stripeRefundId || "n/a"}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <h3 className="text-xl font-semibold text-gray-900">Support actions</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleSupportAction} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-gray-700">
                      <span className="mb-1 block">Action type</span>
                      <select
                        className="w-full rounded-xl border border-gray-300 px-3 py-2"
                        value={supportForm.actionType}
                        onChange={(event) =>
                          setSupportForm((current) => ({
                            ...current,
                            actionType: event.target.value as typeof initialSupportForm.actionType,
                          }))
                        }
                      >
                        <option value="NOTE">Note</option>
                        <option value="RESEND_RECEIPT">Resend receipt / invoice</option>
                        <option value="REFUND_REVIEW">Refund review</option>
                        <option value="CANCEL_SUBSCRIPTION">Cancellation review</option>
                        <option value="UPGRADE_DOWNGRADE_CORRECTION">Plan correction</option>
                        <option value="GRANDFATHER_OVERRIDE">Grandfather override</option>
                      </select>
                    </label>
                    <label className="text-sm text-gray-700">
                      <span className="mb-1 block">Reason code</span>
                      <Input
                        value={supportForm.reasonCode}
                        onChange={(event) => setSupportForm((current) => ({ ...current, reasonCode: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="text-sm text-gray-700 block">
                    <span className="mb-1 block">Invoice ID for resend, if needed</span>
                    <Input
                      value={supportForm.invoiceId}
                      onChange={(event) => setSupportForm((current) => ({ ...current, invoiceId: event.target.value }))}
                      placeholder="in_..."
                    />
                  </label>
                  <label className="text-sm text-gray-700 block">
                    <span className="mb-1 block">Notes</span>
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-gray-300 px-3 py-3"
                      value={supportForm.notes}
                      onChange={(event) => setSupportForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Summarize the support decision, customer context, or next step."
                    />
                  </label>
                  <Button type="submit" disabled={busy === "support"}>
                    {busy === "support" ? "Saving..." : "Record action"}
                  </Button>
                </form>

                {selectedCustomer.billingSupportActions.length === 0 ? (
                  <p className="text-sm text-gray-600">No support actions recorded yet.</p>
                ) : (
                  selectedCustomer.billingSupportActions.map((action) => (
                    <div key={action.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-gray-900">{action.actionType.replaceAll("_", " ")}</p>
                        <Badge variant="info">{action.reasonCode}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-gray-600">{action.notes || "No notes recorded."}</p>
                      <p className="mt-3 text-xs text-gray-500">
                        {action.actor?.name || "Admin"} • {new Date(action.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
