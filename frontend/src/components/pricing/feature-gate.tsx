"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pricingEvents } from "@/lib/analytics";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";
import { usePublicLabel } from "@/lib/i18n/public-labels";

interface FeatureGateProps {
  feature: string;
  requiredPlan: string;
  currentPlan: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PLAN_RANK: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PROFESSIONAL: 2,
  EMPLOYER_FREE: 0,
  EMPLOYER_BASIC: 1,
  EMPLOYER_PREMIUM: 2,
};

function hasAccess(currentPlan: string, requiredPlan: string): boolean {
  // Free launch: every feature is unlocked for everyone.
  if (FREE_MODE) return true;
  return (PLAN_RANK[currentPlan] ?? 0) >= (PLAN_RANK[requiredPlan] ?? 0);
}

export function FeatureGate({
  feature,
  requiredPlan,
  currentPlan,
  children,
  fallback,
}: FeatureGateProps) {
  if (hasAccess(currentPlan, requiredPlan)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  return (
    <UpgradeCta feature={feature} requiredPlan={requiredPlan} currentPlan={currentPlan} />
  );
}

interface UpgradeCtaProps {
  feature: string;
  requiredPlan: string;
  currentPlan: string;
  compact?: boolean;
}

export function UpgradeCta({ feature, requiredPlan, currentPlan, compact }: UpgradeCtaProps) {
  const tp = usePublicT();
  const label = usePublicLabel();
  const locale = useLocale();
  const planName = label(PLAN_NAMES[requiredPlan] ?? requiredPlan);
  const billingHref = localizePath("/billing", locale);

  const handleClick = () => {
    pricingEvents.upgradeCtaClick(feature, currentPlan);
  };

  if (compact) {
    return (
      <Link href={billingHref} onClick={handleClick}>
        <span className="inline-flex items-center gap-1 text-xs text-primary-text hover:underline font-medium cursor-pointer">
          <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          {tp("discover.gate.upgradeTo", { plan: planName })}
        </span>
      </Link>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center py-8 px-4 bg-surface-sunken rounded-xl border border-dashed border-line-strong"
      data-testid={`upgrade-cta-${feature}`}
    >
      <div className="w-12 h-12 rounded-full bg-success-soft flex items-center justify-center mb-3">
        <svg aria-hidden="true" className="w-6 h-6 text-primary-text" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h4 className="text-sm font-semibold text-fg mb-1">
        {tp("discover.gate.requires", { feature, plan: planName })}
      </h4>
      <p className="text-xs text-fg-muted text-center mb-4 max-w-xs">
        {tp("discover.gate.unlock", { feature: feature.toLowerCase() })}
      </p>
      <Link href={billingHref} onClick={handleClick}>
        <Button variant="primary" size="sm">
          {tp("discover.gate.upgradeTo", { plan: planName })}
        </Button>
      </Link>
    </div>
  );
}

const PLAN_NAMES: Record<string, string> = {
  FREE: "Free",
  BASIC: "Basic",
  PROFESSIONAL: "Professional",
  EMPLOYER_FREE: "Employer Free",
  EMPLOYER_BASIC: "Employer Basic",
  EMPLOYER_PREMIUM: "Employer Premium",
};

export { hasAccess, PLAN_RANK };
