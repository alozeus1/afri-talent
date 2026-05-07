"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PremiumGateProps {
  feature: string;
  description?: string;
  requiredPlan?: "Basic" | "Professional" | "Employer Basic" | "Employer Premium";
  price?: string;
  benefits?: string[];
}

export function PremiumGate({
  feature,
  description,
  requiredPlan = "Professional",
  price,
  benefits = ["Personalized AI assistance", "Saved history", "Higher workflow limits"],
}: PremiumGateProps) {
  const router = useRouter();
  const priceCopy = price ? ` for ${price}` : "";
  return (
    <Card className="border-2 border-dashed border-blue-200 bg-blue-50/40">
      <CardContent className="flex flex-col items-center text-center py-10 gap-4">
        <div className="rounded-full bg-blue-100 p-3 text-2xl">✦</div>
        <div>
          <h3 className="font-semibold text-lg">{feature} requires {requiredPlan}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            {description ??
              `${feature} is available on the ${requiredPlan} plan${priceCopy}. Upgrade when you are ready to unlock this workflow.`}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-gray-600">
            {benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </div>
        <Button onClick={() => router.push("/pricing")} className="mt-2">
          View pricing
        </Button>
      </CardContent>
    </Card>
  );
}
