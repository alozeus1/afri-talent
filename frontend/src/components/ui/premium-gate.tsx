"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PremiumGateProps {
  feature: string;
  description?: string;
}

export function PremiumGate({ feature, description }: PremiumGateProps) {
  const router = useRouter();
  return (
    <Card className="border-2 border-dashed border-blue-200 bg-blue-50/40">
      <CardContent className="flex flex-col items-center text-center py-10 gap-4">
        <div className="rounded-full bg-blue-100 p-3 text-2xl">✦</div>
        <div>
          <h3 className="font-semibold text-lg">{feature} is a Premium Feature</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            {description ??
              "Upgrade to Professional to unlock unlimited access to all AI-powered tools."}
          </p>
        </div>
        <Button onClick={() => router.push("/pricing")} className="mt-2">
          Upgrade to Professional
        </Button>
      </CardContent>
    </Card>
  );
}
