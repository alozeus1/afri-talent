"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RegionalPriceInfo } from "@/lib/api";

export interface PlanCardProps {
  planKey: string;
  name: string;
  description: string;
  features: FeatureItem[];
  priceInfo?: RegionalPriceInfo;
  interval: "MONTHLY" | "YEARLY";
  isCurrent: boolean;
  isPopular?: boolean;
  isLoggedIn: boolean;
  taxLabel?: string | null;
  onCheckout: (plan: string) => void;
  checkoutLoading?: string | null;
}

export interface FeatureItem {
  label: string;
  included: "yes" | "limited" | "no";
  limit?: string;
}

export function PlanCard({
  planKey,
  name,
  description,
  features,
  priceInfo,
  interval,
  isCurrent,
  isPopular,
  isLoggedIn,
  taxLabel,
  onCheckout,
  checkoutLoading,
}: PlanCardProps) {
  const isFree = planKey === "FREE" || planKey === "EMPLOYER_FREE";
  const displayPrice = isFree ? "$0" : priceInfo?.displayAmount ?? "--";
  const period = isFree ? "forever" : interval === "MONTHLY" ? "/mo" : "/yr";

  return (
    <div
      className={`relative flex flex-col bg-white rounded-2xl border-2 transition-shadow ${
        isPopular
          ? "border-emerald-500 shadow-xl shadow-emerald-100"
          : isCurrent
            ? "border-emerald-300 shadow-md"
            : "border-gray-100 shadow-sm hover:shadow-md"
      }`}
      data-testid={`plan-card-${planKey}`}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <h3 className="text-lg font-bold text-gray-900">{name}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>

        <div className="mt-4">
          <span className="text-4xl font-extrabold text-gray-900 tracking-tight">
            {displayPrice}
          </span>
          <span className="text-gray-500 text-sm ml-1">{period}</span>
        </div>

        {taxLabel && !isFree && (
          <p className="text-xs text-gray-400 mt-1">excl. {taxLabel}</p>
        )}

        {isCurrent && (
          <Badge variant="success" className="mt-3">
            Your Current Plan
          </Badge>
        )}
      </div>

      {/* Features */}
      <div className="flex-1 px-6 pb-4">
        <ul className="space-y-2.5">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5 text-sm">
              {f.included === "yes" ? (
                <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : f.included === "limited" ? (
                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={f.included === "no" ? "text-gray-400" : "text-gray-700"}>
                {f.label}
                {f.limit && (
                  <span className="ml-1 text-xs text-gray-400">({f.limit})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        {!isLoggedIn ? (
          <Link href="/register" className="block w-full">
            <Button
              variant={isPopular ? "primary" : "outline"}
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
        ) : isFree ? (
          <Button variant="secondary" size="lg" className="w-full" disabled>
            Free
          </Button>
        ) : (
          <Button
            variant={isPopular ? "primary" : "outline"}
            size="lg"
            className="w-full"
            onClick={() => onCheckout(planKey)}
            disabled={checkoutLoading === planKey}
          >
            {checkoutLoading === planKey ? "Redirecting..." : "Upgrade"}
          </Button>
        )}
      </div>
    </div>
  );
}
