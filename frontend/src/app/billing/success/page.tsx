"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { billing, BillingStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const hasSession = !!sessionId;
  const [loading, setLoading] = useState(hasSession);

  useEffect(() => {
    if (hasSession) {
      billing
        .status()
        .then(setStatus)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [hasSession]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const planName =
    status?.plan === "PROFESSIONAL"
      ? "Professional"
      : status?.plan === "BASIC"
        ? "Basic"
        : "your new";

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <div className="text-6xl mb-6">🎉</div>

      <Card>
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Subscription Activated!
          </h1>
          <p className="text-gray-600 mb-4">
            You&apos;re now on the{" "}
            <span className="font-semibold text-emerald-600">{planName}</span> plan.
            All premium features are ready to use.
          </p>

          {status && (
            <Badge variant="success" className="mb-6">
              {status.plan} — {status.status}
            </Badge>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Link href="/candidate">
              <Button variant="primary" size="lg">
                Go to Dashboard
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="outline" size="lg">
                View Billing
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
