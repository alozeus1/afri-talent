"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { billing, pricing, PricingData, BillingStatus, RegionalPriceInfo } from "@/lib/api";
import { PlanCard } from "@/components/pricing/plan-card";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { RegionSelector } from "@/components/pricing/region-selector";
import { FaqSection } from "@/components/pricing/faq-section";
import { pricingEvents } from "@/lib/analytics";
import { useT } from "@/lib/i18n/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CANDIDATE_PLANS,
  EMPLOYER_PLANS,
  CANDIDATE_COMPARISON_ROWS,
  EMPLOYER_COMPARISON_ROWS,
} from "@/components/pricing/pricing-data";

type Interval = "MONTHLY" | "YEARLY";
type PlanTab = "candidate" | "employer";

function getPrice(
  prices: RegionalPriceInfo[],
  plan: string,
  interval: Interval,
): RegionalPriceInfo | undefined {
  return prices.find((p) => p.plan === plan && p.interval === interval);
}

export interface PricingExperienceProps {
  initialPricingData: PricingData | null;
  initialRegion: string;
}

export function PricingExperience({
  initialPricingData,
  initialRegion,
}: PricingExperienceProps) {
  const t = useT();
  const { user, isLoading: authLoading } = useAuth();
  const [pricingData, setPricingData] = useState<PricingData | null>(initialPricingData);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [region, setRegion] = useState<string>(initialPricingData?.region ?? initialRegion);
  const [interval, setInterval] = useState<Interval>("MONTHLY");
  const [tab, setTab] = useState<PlanTab>("candidate");
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const trackedRef = useRef(false);
  const hasRefetchedForUser = useRef(false);

  const fetchPricing = useCallback(async (overrideRegion?: string) => {
    try {
      const r = overrideRegion ?? region;
      let data: PricingData;

      if (user) {
        data = await pricing.me();
      } else {
        data = await pricing.get(r);
      }

      setPricingData(data);
      if (!overrideRegion) setRegion(data.region);
    } catch (err) {
      console.error("Failed to load pricing:", err);
    } finally {
      setLoading(false);
    }
  }, [user, region]);

  // Once auth state resolves and we have a logged-in user the SSR didn't see,
  // refetch as the authenticated user so we get their resolved billing region.
  useEffect(() => {
    if (authLoading) return;
    if (user && !hasRefetchedForUser.current) {
      hasRefetchedForUser.current = true;
      fetchPricing();
    }
    if (user) {
      billing.status().then(setBillingStatus).catch(console.error);
    }
  }, [authLoading, user, fetchPricing]);

  // Track pricing page view once
  useEffect(() => {
    if (pricingData && !trackedRef.current) {
      trackedRef.current = true;
      pricingEvents.pageView(pricingData.region, pricingData.currency);
    }
  }, [pricingData]);

  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    setLoading(true);
    fetchPricing(newRegion);
  };

  const handleIntervalToggle = (newInterval: Interval) => {
    setInterval(newInterval);
    pricingEvents.intervalToggle(newInterval);
  };

  const handleTabSwitch = (newTab: PlanTab) => {
    setTab(newTab);
    pricingEvents.planTabSwitch(newTab);
  };

  const handleCheckout = async (plan: string) => {
    pricingEvents.checkoutClick(plan, region, interval);
    setCheckoutLoading(plan);
    try {
      const { url } = await billing.checkout(plan, interval);
      globalThis.location.assign(url);
    } catch {
      setCheckoutLoading(null);
    }
  };

  const prices = pricingData?.prices ?? [];
  const currentPlan = billingStatus?.plan ?? "FREE";
  const taxLabel = pricingData?.taxLabel;
  const checkoutRoutingHint = region === "AFRICA"
    ? "Nigeria checkouts use Flutterwave local rails. Other regions use Stripe, with Google Pay shown automatically when supported."
    : "Checkout is powered by Stripe, with Google Pay shown automatically on eligible devices.";

  const activePlans = tab === "candidate" ? CANDIDATE_PLANS : EMPLOYER_PLANS;
  const comparisonRows = tab === "candidate" ? CANDIDATE_COMPARISON_ROWS : EMPLOYER_COMPARISON_ROWS;
  const comparisonPlanNames = tab === "candidate"
    ? ["Free", "Basic", "Professional"]
    : ["Employer Free", "Employer Basic", "Employer Premium"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <section className="pt-16 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            {t("pricing.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            {t("pricing.subtitle")}
          </p>
          <p className="mt-3 text-sm text-gray-500 max-w-3xl mx-auto">
            {checkoutRoutingHint}
          </p>
          <p className="mt-2 text-sm font-medium text-emerald-700 max-w-3xl mx-auto">
            {region === "AFRICA"
              ? "Fair local pricing: plans for Africa are priced for African markets — not converted from US rates."
              : "Prices are localized to your region and shown in your regional currency."}
          </p>
        </div>
      </section>

      {/* Controls: Region + Interval + Tab */}
      <section className="pb-8 px-4">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Region selector */}
          <RegionSelector currentRegion={region} onChange={handleRegionChange} />

          {/* Plan type tabs */}
          <div className="flex justify-center">
            <Tabs.Root
              value={tab}
              onValueChange={(val) => handleTabSwitch(val as PlanTab)}
            >
              <Tabs.List
                className="flex items-center gap-x-1 p-1 bg-white border border-gray-200 rounded-xl shadow-sm text-sm"
                aria-label="Select Plan Type"
              >
                <Tabs.Trigger
                  value="candidate"
                  className="data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900 data-[state=active]:shadow-sm outline-gray-800 py-2 px-6 rounded-lg transition-all duration-150 text-gray-500 hover:text-gray-700 hover:bg-gray-50 active:bg-gray-100 font-medium"
                >
                  For Candidates
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="employer"
                  className="data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900 data-[state=active]:shadow-sm outline-gray-800 py-2 px-6 rounded-lg transition-all duration-150 text-gray-500 hover:text-gray-700 hover:bg-gray-50 active:bg-gray-100 font-medium"
                >
                  For Employers
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          </div>

          {/* Interval toggle */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-white shadow-sm">
              <button
                onClick={() => handleIntervalToggle("MONTHLY")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                  interval === "MONTHLY"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => handleIntervalToggle("YEARLY")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                  interval === "YEARLY"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Yearly
                <span className="ml-1.5 text-xs font-semibold opacity-90">Save ~17%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-16 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border-2 border-gray-100 bg-white px-6 py-8 shadow-sm"
                >
                  <div className="text-center">
                    <Skeleton className="mx-auto h-6 w-28" />
                    <Skeleton className="mx-auto mt-3 h-4 w-40" />
                    <Skeleton className="mx-auto mt-6 h-10 w-24" />
                    <Skeleton className="mx-auto mt-2 h-3 w-20" />
                  </div>
                  <div className="mt-8 space-y-3">
                    {Array.from({ length: 6 }).map((__, rowIndex) => (
                      <div key={rowIndex} className="flex items-center gap-2.5">
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    ))}
                  </div>
                  <Skeleton className="mt-8 h-11 w-full rounded-lg" />
                </div>
              ))
            : activePlans.map((plan) => (
                <PlanCard
                  key={plan.key}
                  planKey={plan.key}
                  name={plan.name}
                  description={plan.description}
                  features={plan.features}
                  priceInfo={getPrice(prices, plan.key, interval)}
                  interval={interval}
                  isCurrent={!!user && currentPlan === plan.key}
                  isPopular={plan.popular}
                  isLoggedIn={!!user}
                  taxLabel={taxLabel}
                  onCheckout={handleCheckout}
                  checkoutLoading={checkoutLoading}
                />
              ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-16 px-4 bg-gray-50/70">
        <div className="max-w-5xl mx-auto pt-12">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Compare all features
          </h2>
          <p className="text-gray-500 text-center mb-8 text-sm">
            Features are the same in every region {"—"} only pricing differs.
          </p>
          <ComparisonTable
            title={tab === "candidate" ? "Candidate Plans" : "Employer Plans"}
            plans={comparisonPlanNames}
            rows={comparisonRows}
            tableType={tab}
          />
        </div>
      </section>

      {/* Trust signals */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900">Secure payments</h4>
              <p className="text-xs text-gray-500 mt-1">Powered by Stripe</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900">Cancel anytime</h4>
              <p className="text-xs text-gray-500 mt-1">No long-term contracts</p>
            </div>
            <div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900">Fair regional pricing</h4>
              <p className="text-xs text-gray-500 mt-1">Adapted to your local market</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto pt-12">
          <FaqSection />
        </div>
      </section>
    </div>
  );
}
