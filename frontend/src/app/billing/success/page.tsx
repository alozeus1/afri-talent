"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { billing, BillingStatus } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";
import { richText } from "@/lib/i18n/rich-text";

const PLAN_NAMES: Partial<Record<BillingStatus["plan"], PublicMessageKey>> = {
  FREE: "discover.plan.free",
  BASIC: "discover.plan.basic",
  PROFESSIONAL: "discover.plan.professional",
  EMPLOYER_FREE: "discover.plan.employerFree",
  EMPLOYER_BASIC: "discover.plan.employerBasic",
  EMPLOYER_PREMIUM: "discover.plan.employerPremium",
};
const STATUS_LABELS: Record<BillingStatus["status"], PublicMessageKey> = {
  ACTIVE: "discover.billing.status.ACTIVE",
  INACTIVE: "discover.billing.status.INACTIVE",
  PAST_DUE: "discover.billing.status.PAST_DUE",
  CANCELLED: "discover.billing.status.CANCELLED",
};

function SuccessContent() {
  const tp = usePublicT();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const provider = searchParams.get("provider");
  const txRef = searchParams.get("tx_ref");
  const transactionId = searchParams.get("transaction_id");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const hasSession = !!sessionId || provider === "FLUTTERWAVE";
  const [loading, setLoading] = useState(hasSession);

  useEffect(() => {
    if (hasSession) {
      const verify = async () => {
        if (provider === "FLUTTERWAVE" && transactionId) {
          await billing.verifyCheckout({
            provider: "FLUTTERWAVE",
            txRef: txRef ?? undefined,
            transactionId: Number(transactionId),
          });
        }
        const nextStatus = await billing.status();
        setStatus(nextStatus);
      };

      verify()
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [hasSession, provider, transactionId, txRef]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const planKey = status?.plan && status.plan !== "FREE" && status.plan !== "EMPLOYER_FREE" ? PLAN_NAMES[status.plan] : undefined;

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <div className="text-6xl mb-6">🎉</div>

      <Card>
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold text-fg mb-2">{tp("discover.billing.successTitle")}</h1>
          <p className="text-fg-secondary mb-4">
            {planKey
              ? richText(tp("discover.billing.successBody", { plan: tp(planKey) }), {
                  b: (chunk) => <span className="font-semibold text-primary-text">{chunk}</span>,
                })
              : tp("discover.billing.successBodyGeneric")}
          </p>

          {status && (
            <Badge variant="success" className="mb-6">
              {PLAN_NAMES[status.plan] ? tp(PLAN_NAMES[status.plan]!) : status.plan} — {tp(STATUS_LABELS[status.status])}
            </Badge>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Link href="/candidate">
              <Button variant="primary" size="lg">
                {tp("discover.billing.goToDashboard")}
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="outline" size="lg">
                {tp("discover.billing.viewBilling")}
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
