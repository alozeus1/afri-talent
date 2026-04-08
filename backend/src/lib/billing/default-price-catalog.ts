import { BillingInterval, BillingRegion, SubscriptionPlan } from "@prisma/client";

export interface DefaultRegionalPriceRow {
  plan: SubscriptionPlan;
  region: BillingRegion;
  interval: BillingInterval;
  currency: string;
  amount: number;
}

export const DEFAULT_REGIONAL_PRICE_CATALOG: DefaultRegionalPriceRow[] = [
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "USD", amount: 399 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "USD", amount: 3990 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "NGN", amount: 350000 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "NGN", amount: 3500000 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "EUR", amount: 999 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "EUR", amount: 9990 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "GBP", amount: 899 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "GBP", amount: 8990 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.ROW, interval: BillingInterval.MONTHLY, currency: "USD", amount: 999 },
  { plan: SubscriptionPlan.BASIC, region: BillingRegion.ROW, interval: BillingInterval.YEARLY, currency: "USD", amount: 9990 },

  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "USD", amount: 999 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "USD", amount: 9990 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "NGN", amount: 900000 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "NGN", amount: 9000000 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "EUR", amount: 2499 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "EUR", amount: 24990 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "GBP", amount: 2199 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "GBP", amount: 21990 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.ROW, interval: BillingInterval.MONTHLY, currency: "USD", amount: 2499 },
  { plan: SubscriptionPlan.PROFESSIONAL, region: BillingRegion.ROW, interval: BillingInterval.YEARLY, currency: "USD", amount: 24990 },

  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "USD", amount: 4999 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "USD", amount: 49990 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "NGN", amount: 4500000 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "NGN", amount: 45000000 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "EUR", amount: 9999 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "EUR", amount: 99990 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.ROW, interval: BillingInterval.MONTHLY, currency: "USD", amount: 9999 },
  { plan: SubscriptionPlan.EMPLOYER_BASIC, region: BillingRegion.ROW, interval: BillingInterval.YEARLY, currency: "USD", amount: 99990 },

  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "USD", amount: 14999 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "USD", amount: 149990 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.AFRICA, interval: BillingInterval.MONTHLY, currency: "NGN", amount: 12500000 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.AFRICA, interval: BillingInterval.YEARLY, currency: "NGN", amount: 125000000 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.EUROPE, interval: BillingInterval.MONTHLY, currency: "EUR", amount: 29999 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.EUROPE, interval: BillingInterval.YEARLY, currency: "EUR", amount: 299990 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.ROW, interval: BillingInterval.MONTHLY, currency: "USD", amount: 29999 },
  { plan: SubscriptionPlan.EMPLOYER_PREMIUM, region: BillingRegion.ROW, interval: BillingInterval.YEARLY, currency: "USD", amount: 299990 },
];
