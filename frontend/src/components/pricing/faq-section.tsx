"use client";

import { useState } from "react";
import { pricingEvents } from "@/lib/analytics";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Why does pricing vary by region?",
    answer:
      "AfriTalent serves talent across Africa, Europe, and the rest of the world. We adjust pricing to reflect local purchasing power so that our tools are accessible to everyone, regardless of where they are. Plan features remain the same everywhere \u2014 only the price changes.",
  },
  {
    question: "How is my billing region determined?",
    answer:
      "Your billing region is set by the country you select during checkout. If you haven't selected a country yet, we detect it from your payment method or suggest one based on your location. You can always update your billing country from your account settings.",
  },
  {
    question: "Do I get the same features regardless of my region?",
    answer:
      "Absolutely. Plan entitlements (features, limits, AI usage) are tied to your plan level, not your region. A Professional plan in Nigeria has the exact same features as one in Germany or the US.",
  },
  {
    question: "What happens if I switch regions?",
    answer:
      "If you update your billing country, your next invoice will reflect the new regional pricing. Your current billing cycle completes at the existing rate. All changes are audited for transparency.",
  },
  {
    question: "What is grandfathered pricing?",
    answer:
      "If you're an existing subscriber when we change prices, your subscription stays at the rate you signed up for until you cancel. This is called 'grandfathering.' You'll only see new prices if you cancel and re-subscribe.",
  },
  {
    question: "Can I switch between monthly and annual billing?",
    answer:
      "Yes. Annual billing saves you approximately 17% compared to monthly. You can switch at any time from the Manage Billing page. Stripe handles proration automatically.",
  },
  {
    question: "Is VAT included in European prices?",
    answer:
      "European prices are shown excluding VAT. The applicable VAT rate will be calculated and added during checkout based on your country. You can provide a VAT ID for business purchases.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards (Visa, Mastercard, American Express) through Stripe. We're working on adding local African payment methods like mobile money in the near future.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel anytime from your billing dashboard. Your plan features remain active until the end of your current billing period. No cancellation fees.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto" data-testid="pricing-faq">
      <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => {
                  const next = isOpen ? null : i;
                  setOpenIndex(next);
                  if (next !== null) pricingEvents.faqExpand(item.question);
                }}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-medium text-gray-900 pr-4">
                  {item.question}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
