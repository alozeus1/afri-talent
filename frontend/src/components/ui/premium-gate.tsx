"use client";

import { useRouter } from "next/navigation";
import { FREE_MODE } from "@/lib/free-mode";
import { localizePath, useLocale, useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PremiumGateProps {
  feature: string;
  description?: string;
  requiredPlan?: "Basic" | "Professional" | "Employer Basic" | "Employer Premium";
  price?: string;
  benefits?: string[];
}

const PLAN_KEYS = {
  Basic: "common.plan.basic",
  Professional: "common.plan.professional",
  "Employer Basic": "common.plan.employerBasic",
  "Employer Premium": "common.plan.employerPremium",
} as const;

export function PremiumGate({
  feature,
  description,
  requiredPlan = "Professional",
  price,
  benefits,
}: PremiumGateProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  // Free launch: nothing is gated, so the paywall never renders.
  if (FREE_MODE) return null;
  const plan = t(PLAN_KEYS[requiredPlan]);
  const benefitList = benefits ?? [
    t("common.ui.benefit.personalized"),
    t("common.ui.benefit.history"),
    t("common.ui.benefit.limits"),
  ];
  return (
    <Card className="border-2 border-dashed border-blue-200 bg-blue-50/40">
      <CardContent className="flex flex-col items-center text-center py-10 gap-4">
        <div className="rounded-full bg-blue-100 p-3 text-2xl">✦</div>
        <div>
          <h3 className="font-semibold text-lg">{t("common.ui.requiresPlan", { feature, plan })}</h3>
          <p className="text-sm text-fg-muted mt-1 max-w-sm">
            {description ??
              (price
                ? t("common.ui.availableOnPlanPrice", { feature, plan, price })
                : t("common.ui.availableOnPlan", { feature, plan }))}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-fg-secondary">
            {benefitList.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </div>
        <Button onClick={() => router.push(localizePath("/pricing", locale))} className="mt-2">
          {t("common.ui.viewPricing")}
        </Button>
      </CardContent>
    </Card>
  );
}
