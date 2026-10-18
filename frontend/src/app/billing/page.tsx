"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { billing, pricing, BillingStatus, PricingData, RegionalPriceInfo } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Interval = "MONTHLY" | "YEARLY";

const PLAN_ORDER = ["FREE", "BASIC", "PROFESSIONAL"] as const;
const EMPLOYER_PLAN_ORDER = ["EMPLOYER_FREE", "EMPLOYER_BASIC", "EMPLOYER_PREMIUM"] as const;

// Plan copy is resolved at render time through usePublicT, so every locale
// gets translated names and features.
type PlanFeature = { key: PublicMessageKey; perMonth?: number };
const PLAN_META: Record<string, { name: PublicMessageKey; features: PlanFeature[]; popular?: boolean }> = {
  FREE: {
    name: "discover.plan.free",
    features: [
      { key: "discover.feat.browseAll" },
      { key: "discover.feat.applications", perMonth: 5 },
      { key: "discover.feat.basicProfile" },
    ],
  },
  BASIC: {
    name: "discover.plan.basic",
    features: [
      { key: "discover.billing.everythingFree" },
      { key: "discover.feat.unlimitedApplications" },
      { key: "discover.feat.aiResumeReview", perMonth: 10 },
      { key: "discover.feat.savedSearches" },
      { key: "discover.feat.jobAlerts" },
      { key: "discover.feat.chatbot" },
    ],
  },
  PROFESSIONAL: {
    name: "discover.plan.professional",
    popular: true,
    features: [
      { key: "discover.feat.everythingBasic" },
      { key: "discover.feat.aiMatching", perMonth: 20 },
      { key: "discover.feat.applyPacks", perMonth: 5 },
      { key: "discover.feat.prioritySupport" },
      { key: "discover.feat.assessments" },
      { key: "discover.feat.autopilot" },
    ],
  },
  EMPLOYER_FREE: {
    name: "discover.plan.employerFree",
    features: [{ key: "discover.feat.unlimitedPosts" }, { key: "discover.feat.applicantMgmt" }],
  },
  EMPLOYER_BASIC: {
    name: "discover.plan.employerBasic",
    features: [
      { key: "discover.feat.unlimitedPosts" },
      { key: "discover.feat.candidateSearch" },
      { key: "discover.feat.analytics" },
    ],
  },
  EMPLOYER_PREMIUM: {
    name: "discover.plan.employerPremium",
    popular: true,
    features: [
      { key: "discover.feat.unlimitedPosts" },
      { key: "discover.feat.candidateSearch" },
      { key: "discover.feat.advancedAnalytics" },
      { key: "discover.feat.api" },
      { key: "discover.feat.prioritySupport" },
    ],
  },
};

function hasManageablePaidPlan(status: BillingStatus | null): boolean {
  return (
    !!status &&
    status.status === "ACTIVE" &&
    status.plan !== "FREE" &&
    status.plan !== "EMPLOYER_FREE" &&
    status.hasPortal
  );
}

function getPrice(prices: RegionalPriceInfo[], plan: string, interval: Interval): RegionalPriceInfo | undefined {
  return prices.find((p) => p.plan === plan && p.interval === interval);
}

export default function BillingPage() {
  const { user, isLoading } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [interval, setInterval] = useState<Interval>("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const pData = user
        ? await pricing.me()
        : await pricing.get();
      setPricingData(pData);

      if (user) {
        const s = await billing.status();
        setStatus(s);
      }
    } catch (err) {
      console.error("Failed to load pricing:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const router = useRouter();
  const locale = useLocale();
  const tp = usePublicT();
  const t = useT();
  const featureLabel = (feature: PlanFeature) =>
    feature.perMonth
      ? tp("discover.billing.withLimit", {
          feature: tp(feature.key),
          limit: tp("discover.feat.perMonth", { count: feature.perMonth }),
        })
      : tp(feature.key);
  const showFreeModePortal = FREE_MODE && hasManageablePaidPlan(status);

  // Free launch: nothing to buy. Only people with an existing paid
  // subscription stay here (to manage or cancel it); everyone else goes to
  // the "free for everyone" page.
  useEffect(() => {
    if (!FREE_MODE || isLoading || loading || showFreeModePortal) return;
    router.replace(localizePath("/pricing", locale));
  }, [isLoading, loading, showFreeModePortal, router, locale]);

  const handleCheckout = async (plan: string) => {
    setActionLoading(plan);
    try {
      const { url } = await billing.checkout(plan, interval);
      globalThis.location.assign(url);
    } catch {
      setActionLoading(null);
    }
  };

  const handlePortal = async () => {
    setActionLoading("portal");
    try {
      const { url } = await billing.portal();
      globalThis.location.assign(url);
    } catch {
      setActionLoading(null);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (FREE_MODE) {
    if (!showFreeModePortal) {
      return (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-4 py-16" data-testid="billing-free-mode">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-fg-secondary dark:text-gray-300">
              {tp("discover.billing.freeModeBody")}
            </p>
            <Button onClick={handlePortal} disabled={actionLoading === "portal"}>
              {actionLoading === "portal" ? tp("discover.billing.opening") : tp("discover.billing.manageSubscription")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = status?.plan ?? "FREE";
  const prices = pricingData?.prices ?? [];
  const region = pricingData?.region ?? "ROW";
  const currency = pricingData?.currency ?? "USD";
  const providerLabel = status?.billingProvider === "FLUTTERWAVE"
    ? "Flutterwave"
    : status?.billingProvider === "STRIPE"
      ? "Stripe"
      : region === "AFRICA"
        ? tp("discover.billing.providerAfrica")
        : "Stripe";

  const isEmployer = user && (currentPlan.startsWith("EMPLOYER_") || user.role === "EMPLOYER");
  const planOrder = isEmployer ? EMPLOYER_PLAN_ORDER : PLAN_ORDER;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-fg mb-2">{tp("discover.billing.title")}</h1>
        <p className="text-fg-secondary max-w-2xl mx-auto">
          {tp("discover.billing.subtitle")}
        </p>

        {/* Region badge */}
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-fg-muted">
          <span>{tp("discover.billing.pricesFor")}</span>
          <Badge variant="info">{region}</Badge>
          <span>{tp("discover.billing.inCurrency", { currency })}</span>
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          {tp("discover.billing.routing", { provider: providerLabel })}
        </p>
      </div>

      {/* Interval toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex rounded-lg border border-line p-1 bg-surface-sunken">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              interval === "MONTHLY"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-muted hover:text-fg-secondary"
            }`}
            onClick={() => setInterval("MONTHLY")}
          >
            {t("pricing.monthly")}
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              interval === "YEARLY"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-muted hover:text-fg-secondary"
            }`}
            onClick={() => setInterval("YEARLY")}
          >
            {t("pricing.yearly")}
            <span className="ml-1 text-xs text-primary-text font-semibold">{t("pricing.savePercent")}</span>
          </button>
        </div>
      </div>

      {/* Current plan card */}
      {user && status && (
        <Card className="mb-10 max-w-2xl mx-auto">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-fg">{tp("discover.billing.currentPlan")}</span>
                <Badge variant="success">{PLAN_META[currentPlan] ? tp(PLAN_META[currentPlan].name) : currentPlan}</Badge>
                {status.status === "ACTIVE" && currentPlan !== "FREE" && currentPlan !== "EMPLOYER_FREE" && (
                  <Badge variant="info">{tp("discover.billing.active")}</Badge>
                )}
              </div>
              {status.currentPeriodEnd && (
                <p className="text-sm text-fg-muted">
                  {tp("discover.billing.renewsOn", {
                    date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(status.currentPeriodEnd)),
                  })}
                </p>
              )}
            </div>
            {status.hasPortal && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePortal}
                disabled={actionLoading === "portal"}
              >
                {actionLoading === "portal" ? tp("discover.plan.redirecting") : tp("discover.billing.manageBilling")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {planOrder.map((planKey) => {
          const meta = PLAN_META[planKey];
          if (!meta) return null;
          const isCurrent = user && currentPlan === planKey;
          const isFree = planKey === "FREE" || planKey === "EMPLOYER_FREE";
          const priceInfo = getPrice(prices, planKey, interval);

          const displayPrice = isFree
            ? "$0"
            : priceInfo?.displayAmount ?? "—";
          const period = isFree
            ? tp("discover.plan.forever")
            : interval === "MONTHLY"
              ? tp("discover.plan.perMonth")
              : tp("discover.plan.perYear");

          return (
            <Card
              key={planKey}
              className={`relative flex flex-col ${
                meta.popular ? "border-2 border-emerald-600 shadow-lg" : ""
              } ${isCurrent ? "ring-2 ring-emerald-500" : ""}`}
            >
              {meta.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="success" className="bg-emerald-600 text-white px-3 py-1">
                    {tp("discover.plan.popular")}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pt-8">
                <h2 className="text-xl font-bold text-fg">{tp(meta.name)}</h2>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold text-fg">{displayPrice}</span>
                  <span className="text-fg-muted ml-1">{period}</span>
                </div>
                {pricingData?.taxLabel && !isFree && (
                  <p className="text-xs text-gray-400 mt-1">{tp("discover.plan.excl", { tax: pricingData.taxLabel })}</p>
                )}
                {isCurrent && (
                  <Badge variant="success" className="mt-3">{tp("discover.plan.current")}</Badge>
                )}
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {meta.features.map((feature) => (
                    <li key={feature.key} className="flex items-start gap-2 text-sm text-fg-secondary">
                      <svg
                        className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {featureLabel(feature)}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-0">
                {!user ? (
                  <Link href="/register" className="w-full">
                    <Button
                      variant={meta.popular ? "primary" : "outline"}
                      size="lg"
                      className="w-full"
                    >
                      {isFree ? tp("discover.plan.signUpFree") : tp("discover.plan.getStarted")}
                    </Button>
                  </Link>
                ) : isCurrent ? (
                  <Button variant="secondary" size="lg" className="w-full" disabled>
                    {tp("discover.plan.current")}
                  </Button>
                ) : !isFree ? (
                  <Button
                    variant={meta.popular ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                    onClick={() => handleCheckout(planKey)}
                    disabled={actionLoading === planKey}
                  >
                    {actionLoading === planKey ? tp("discover.plan.redirecting") : tp("discover.plan.upgrade")}
                  </Button>
                ) : (
                  <Button variant="secondary" size="lg" className="w-full" disabled>
                    {t("pricing.free")}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Switch between candidate and employer plans */}
      <div className="text-center mt-8">
        <Link
          href={isEmployer ? "/billing?view=candidate" : "/billing?view=employer"}
          className="text-sm text-primary-text hover:underline"
        >
          {isEmployer ? tp("discover.billing.viewCandidatePlans") : tp("discover.billing.viewEmployerPlans")}
        </Link>
      </div>
    </div>
  );
}
