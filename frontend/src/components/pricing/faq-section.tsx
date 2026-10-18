"use client";

import { useState } from "react";
import { pricingEvents } from "@/lib/analytics";
import { PUBLIC_MESSAGES, usePublicT, type PublicMessageKey } from "@/lib/i18n/public-messages";

interface FaqItem {
  question: PublicMessageKey;
  answer: PublicMessageKey;
}

const FAQ_ITEMS: FaqItem[] = [
  { question: "discover.faq.regionVary.q", answer: "discover.faq.regionVary.a" },
  { question: "discover.faq.billingRegion.q", answer: "discover.faq.billingRegion.a" },
  { question: "discover.faq.sameFeatures.q", answer: "discover.faq.sameFeatures.a" },
  { question: "discover.faq.switchRegion.q", answer: "discover.faq.switchRegion.a" },
  { question: "discover.faq.grandfathered.q", answer: "discover.faq.grandfathered.a" },
  { question: "discover.faq.switchInterval.q", answer: "discover.faq.switchInterval.a" },
  { question: "discover.faq.vat.q", answer: "discover.faq.vat.a" },
  { question: "discover.faq.paymentMethods.q", answer: "discover.faq.paymentMethods.a" },
  { question: "discover.faq.cancel.q", answer: "discover.faq.cancel.a" },
];

// Analytics keep the English question so reports stay comparable across locales.
const PUBLIC_EN_QUESTION = (key: PublicMessageKey) => PUBLIC_MESSAGES.en[key];

export function FaqSection() {
  const tp = usePublicT();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto" data-testid="pricing-faq">
      <h2 className="text-2xl font-bold text-fg text-center mb-8">
        {tp("discover.faq.title")}
      </h2>
      <div className="space-y-2">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="border border-line rounded-lg overflow-hidden"
            >
              <button
                onClick={() => {
                  const next = isOpen ? null : i;
                  setOpenIndex(next);
                  if (next !== null) pricingEvents.faqExpand(PUBLIC_EN_QUESTION(item.question));
                }}
                className="w-full flex items-center justify-between px-5 py-4 text-start hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-medium text-fg pe-4">
                  {tp(item.question)}
                </span>
                <svg
                  aria-hidden="true"
                  className={`w-5 h-5 text-fg-muted shrink-0 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-fg-secondary leading-relaxed">{tp(item.answer)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
