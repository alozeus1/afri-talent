"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { billing, pricing, BillingStatus, PricingData, RegionalPriceInfo } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Interval = "MONTHLY" | "YEARLY";

const PLAN_ORDER = ["FREE", "BASIC", "PROFESSIONAL"] as const;
const EMPLOYER_PLAN_ORDER = ["EMPLOYER_FREE", "EMPLOYER_BASIC", "EMPLOYER_PREMIUM"] as const;

const PLAN_META: Record<string, { name: string; features: string[]; popular?: boolean }> = {
  FREE: {
    name: "Free",
    features: ["Browse all jobs", "Apply to 5 jobs/month", "Basic profile"],
  },
  BASIC: {
    name: "Basic",
    features: [
      "Everything in Free",
      "Unlimited applications",
      "AI resume review (10/month)",
      "Saved searches",
      "Job alerts",
      "AI Chat assistant",
    ],
  },
  PROFESSIONAL: {
    name: "Professional",
    popular: true,
    features: [
      "Everything in Basic",
      "AI job matching (20/month)",
      "AI apply packs (5/month)",
      "Priority support",
      "Skills assessments",
      "Autopilot mode",
    ],
  },
  EMPLOYER_FREE: {
    name: "Employer Free",
    features: ["Unlimited job postings", "Basic applicant management"],
  },
  EMPLOYER_BASIC: {
    name: "Employer Basic",
    features: ["Unlimited job postings", "Talent search", "Analytics dashboard"],
  },
  EMPLOYER_PREMIUM: {
    name: "Employer Premium",
    popular: true,
    features: [
      "Unlimited job posts",
      "Talent search",
      "Advanced analytics",
      "API access",
      "Priority support",
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
              AfriTalent is now free for everyone. You can manage or cancel your existing subscription here.
            </p>
            <Button onClick={handlePortal} disabled={actionLoading === "portal"}>
              {actionLoading === "portal" ? "Opening..." : "Manage subscription"}
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
        ? "Flutterwave in Nigeria, Stripe elsewhere"
        : "Stripe";

  const isEmployer = user && (currentPlan.startsWith("EMPLOYER_") || user.role === "EMPLOYER");
  const planOrder = isEmployer ? EMPLOYER_PLAN_ORDER : PLAN_ORDER;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-fg mb-2">Plans &amp; Pricing</h1>
        <p className="text-fg-secondary max-w-2xl mx-auto">
          Choose the plan that fits your needs. Upgrade anytime to unlock powerful features.
        </p>

        {/* Region badge */}
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-fg-muted">
          <span>Showing prices for</span>
          <Badge variant="info">{region}</Badge>
          <span>in {currency}</span>
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          Checkout routing: {providerLabel}. Google Pay appears automatically on eligible Stripe devices.
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
            Monthly
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              interval === "YEARLY"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-muted hover:text-fg-secondary"
            }`}
            onClick={() => setInterval("YEARLY")}
          >
            Yearly
            <span className="ml-1 text-xs text-primary-text font-semibold">Save ~17%</span>
          </button>
        </div>
      </div>

      {/* Current plan card */}
      {user && status && (
        <Card className="mb-10 max-w-2xl mx-auto">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-fg">Current Plan:</span>
                <Badge variant="success">{PLAN_META[currentPlan]?.name ?? currentPlan}</Badge>
                {status.status === "ACTIVE" && currentPlan !== "FREE" && currentPlan !== "EMPLOYER_FREE" && (
                  <Badge variant="info">Active</Badge>
                )}
              </div>
              {status.currentPeriodEnd && (
                <p className="text-sm text-fg-muted">
                  Renews on {new Date(status.currentPeriodEnd).toLocaleDateString()}
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
                {actionLoading === "portal" ? "Redirecting..." : "Manage Billing"}
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
            ? "forever"
            : interval === "MONTHLY"
              ? "/month"
              : "/year";

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
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pt-8">
                <h2 className="text-xl font-bold text-fg">{meta.name}</h2>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold text-fg">{displayPrice}</span>
                  <span className="text-fg-muted ml-1">{period}</span>
                </div>
                {pricingData?.taxLabel && !isFree && (
                  <p className="text-xs text-gray-400 mt-1">excl. {pricingData.taxLabel}</p>
                )}
                {isCurrent && (
                  <Badge variant="success" className="mt-3">Current Plan</Badge>
                )}
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {meta.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-fg-secondary">
                      <svg
                        className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
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
                      {isFree ? "Sign Up Free" : "Get Started"}
                    </Button>
                  </Link>
                ) : isCurrent ? (
                  <Button variant="secondary" size="lg" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : !isFree ? (
                  <Button
                    variant={meta.popular ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                    onClick={() => handleCheckout(planKey)}
                    disabled={actionLoading === planKey}
                  >
                    {actionLoading === planKey ? "Redirecting..." : "Upgrade"}
                  </Button>
                ) : (
                  <Button variant="secondary" size="lg" className="w-full" disabled>
                    Free
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
          {isEmployer ? "View candidate plans" : "Looking to hire? View employer plans"}
        </Link>
      </div>
    </div>
  );
}
