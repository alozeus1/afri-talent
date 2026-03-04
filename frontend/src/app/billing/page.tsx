"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { billing, BillingStatus } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const plans = [
  {
    key: "FREE" as const,
    name: "Free",
    price: "$0",
    period: "forever",
    features: [
      "Browse all jobs",
      "Apply to 5 jobs/month",
      "Basic profile",
    ],
  },
  {
    key: "BASIC" as const,
    name: "Basic",
    price: "$9.99",
    period: "/month",
    features: [
      "Everything in Free",
      "Unlimited applications",
      "AI resume review (10/month)",
      "Saved searches",
      "Job alerts",
    ],
  },
  {
    key: "PROFESSIONAL" as const,
    name: "Professional",
    price: "$24.99",
    period: "/month",
    popular: true,
    features: [
      "Everything in Basic",
      "AI job matching (20/month)",
      "AI apply packs (5/month)",
      "Priority support",
      "Skills assessments",
    ],
  },
];

export default function BillingPage() {
  const { user, isLoading } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(!!user);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      let cancelled = false;
      billing
        .status()
        .then((s) => { if (!cancelled) setStatus(s); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
  }, [user]);

  const handleCheckout = async (plan: "BASIC" | "PROFESSIONAL") => {
    setActionLoading(plan);
    try {
      const { url } = await billing.checkout(plan);
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const currentPlan = status?.plan ?? "FREE";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Plans &amp; Pricing</h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Choose the plan that fits your job search. Upgrade anytime to unlock AI-powered tools and unlimited applications.
        </p>
      </div>

      {user && loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {user && status && (
        <Card className="mb-10 max-w-2xl mx-auto">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">Current Plan:</span>
                <Badge variant="success">{currentPlan}</Badge>
                {status.status === "ACTIVE" && currentPlan !== "FREE" && (
                  <Badge variant="info">Active</Badge>
                )}
              </div>
              {status.currentPeriodEnd && (
                <p className="text-sm text-gray-500">
                  Renews on {new Date(status.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {status.hasCustomer && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePortal}
                disabled={actionLoading === "portal"}
              >
                {actionLoading === "portal" ? "Redirecting…" : "Manage Billing"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const isCurrent = user && currentPlan === plan.key;
          const isPaid = plan.key !== "FREE";

          return (
            <Card
              key={plan.key}
              className={`relative flex flex-col ${
                plan.popular
                  ? "border-2 border-emerald-600 shadow-lg"
                  : ""
              } ${isCurrent ? "ring-2 ring-emerald-500" : ""}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="success" className="bg-emerald-600 text-white px-3 py-1">
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pt-8">
                <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 ml-1">{plan.period}</span>
                </div>
                {isCurrent && (
                  <Badge variant="success" className="mt-3">
                    Current Plan
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
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
                      variant={plan.popular ? "primary" : "outline"}
                      size="lg"
                      className="w-full"
                    >
                      {isPaid ? "Get Started" : "Sign Up Free"}
                    </Button>
                  </Link>
                ) : isCurrent ? (
                  <Button variant="secondary" size="lg" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : isPaid ? (
                  <Button
                    variant={plan.popular ? "primary" : "outline"}
                    size="lg"
                    className="w-full"
                    onClick={() => handleCheckout(plan.key as "BASIC" | "PROFESSIONAL")}
                    disabled={actionLoading === plan.key}
                  >
                    {actionLoading === plan.key ? "Redirecting…" : "Upgrade"}
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
    </div>
  );
}
