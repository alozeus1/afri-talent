"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RegionalPriceInfo } from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";

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
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();
  const isFree = planKey === "FREE" || planKey === "EMPLOYER_FREE";
  const displayPrice = isFree ? "$0" : priceInfo?.displayAmount ?? "--";
  const period = isFree ? tp("discover.plan.forever") : interval === "MONTHLY" ? tp("discover.plan.perMonth") : tp("discover.plan.perYear");

  return (
    <div
      className={`relative flex flex-col bg-surface rounded-2xl border-2 transition-shadow ${
        isPopular
          ? "border-emerald-500 shadow-raised"
          : isCurrent
            ? "border-emerald-300 shadow-md"
            : "border-line shadow-sm hover:shadow-md"
      }`}
      data-testid={`plan-card-${planKey}`}
    >
      {/* Popular badge */}
      {isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 rtl:translate-x-1/2">
          <span className="inline-flex items-center gap-1 bg-primary text-primary-fg text-xs font-semibold px-3 py-1 rounded-full shadow">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {tp("discover.plan.popular")}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-8 pb-4 text-center">
        <h3 className="text-lg font-bold text-fg">{label(name)}</h3>
        <p className="mt-1 text-sm text-fg-muted">{label(description)}</p>

        <div className="mt-4">
          <span className="text-4xl font-extrabold text-fg tracking-tight">
            {displayPrice}
          </span>
          <span className="text-fg-muted text-sm ms-1">{period}</span>
        </div>

        {taxLabel && !isFree && (
          <p className="text-xs text-fg-muted mt-1">{tp("discover.plan.excl", { tax: taxLabel })}</p>
        )}

        {isCurrent && (
          <Badge variant="success" className="mt-3">
            {tp("discover.plan.yourCurrent")}
          </Badge>
        )}
      </div>

      {/* Features */}
      <div className="flex-1 px-6 pb-4">
        <ul className="space-y-2.5">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5 text-sm">
              {f.included === "yes" ? (
                <svg aria-hidden="true" className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : f.included === "limited" ? (
                <svg aria-hidden="true" className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="w-5 h-5 text-fg-muted shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={f.included === "no" ? "text-fg-muted line-through decoration-fg-muted/40" : "text-fg-secondary"}>
                {label(f.label)}
                {f.limit && (
                  <span className="ms-1 text-xs text-fg-muted">({label(f.limit)})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        {!isLoggedIn ? (
          <Link href={localizePath("/register", locale)} className="block w-full">
            <Button
              variant={isPopular ? "primary" : "outline"}
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
        ) : isFree ? (
          <Button variant="secondary" size="lg" className="w-full" disabled>
            {tp("discover.plan.free")}
          </Button>
        ) : (
          <Button
            variant={isPopular ? "primary" : "outline"}
            size="lg"
            className="w-full"
            onClick={() => onCheckout(planKey)}
            disabled={checkoutLoading === planKey}
          >
            {checkoutLoading === planKey ? tp("discover.plan.redirecting") : tp("discover.plan.upgrade")}
          </Button>
        )}
      </div>
    </div>
  );
}
