import { PrismaClient, BillingRegion, BillingInterval, SubscriptionPlan } from "@prisma/client";

const prisma = new PrismaClient();

async function seedRegionConfig() {
  const regions = [
    {
      region: BillingRegion.AFRICA,
      defaultCurrency: "USD",
      currencies: ["USD", "NGN", "KES", "GHS", "ZAR"],
      countries: [
        "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ",
        "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG",
        "MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO",
        "ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
      ],
      taxBehavior: "unspecified",
      taxLabel: null,
      metadata: {
        paymentMethodsLive: ["card"],
        paymentMethodsRoadmap: ["flutterwave", "paystack", "mtn_momo", "airtel_money"],
        settlementCurrencies: ["USD", "NGN", "KES", "GHS", "ZAR"],
      },
    },
    {
      region: BillingRegion.EUROPE,
      defaultCurrency: "EUR",
      currencies: ["EUR", "GBP", "CHF"],
      countries: [
        "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
        "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
        "IS","LI","NO","GB","CH",
      ],
      taxBehavior: "exclusive",
      taxLabel: "VAT",
      metadata: {
        vatRates: { standard: 20, reduced: 10, zero: 0 },
        paymentMethodsLive: ["card", "sepa_debit", "ideal", "bancontact"],
        invoiceCompliance: ["eu_vat_id", "reverse_charge_supported"],
      },
    },
    {
      region: BillingRegion.ROW,
      defaultCurrency: "USD",
      currencies: ["USD"],
      countries: [], // everything not in AFRICA or EUROPE
      taxBehavior: "unspecified",
      taxLabel: null,
      metadata: {
        paymentMethodsLive: ["card"],
        paymentMethodsRoadmap: ["apple_pay", "google_pay"],
      },
    },
  ];

  for (const r of regions) {
    await prisma.regionConfig.upsert({
      where: { region: r.region },
      create: r,
      update: r,
    });
  }
  console.log("Region configs seeded");
}

async function seedPrices() {
  // Prices in minor units (cents/kobo/etc.)
  // Africa gets ~60% discount vs ROW, Europe is standard
  const prices: Array<{
    plan: SubscriptionPlan;
    region: BillingRegion;
    interval: BillingInterval;
    currency: string;
    amount: number;
    stripePriceId: string | null;
  }> = [
    // ── FREE (all regions, $0) ──
    // No price rows needed for FREE plans

    // ── BASIC — AFRICA (USD) ──
    { plan: "BASIC", region: "AFRICA", interval: "MONTHLY", currency: "USD", amount: 399, stripePriceId: null },
    { plan: "BASIC", region: "AFRICA", interval: "YEARLY",  currency: "USD", amount: 3990, stripePriceId: null },
    // ── BASIC — AFRICA (NGN) ──
    { plan: "BASIC", region: "AFRICA", interval: "MONTHLY", currency: "NGN", amount: 350000, stripePriceId: null },
    { plan: "BASIC", region: "AFRICA", interval: "YEARLY",  currency: "NGN", amount: 3500000, stripePriceId: null },

    // ── BASIC — EUROPE (EUR) ──
    { plan: "BASIC", region: "EUROPE", interval: "MONTHLY", currency: "EUR", amount: 999, stripePriceId: null },
    { plan: "BASIC", region: "EUROPE", interval: "YEARLY",  currency: "EUR", amount: 9990, stripePriceId: null },
    // ── BASIC — EUROPE (GBP) ──
    { plan: "BASIC", region: "EUROPE", interval: "MONTHLY", currency: "GBP", amount: 899, stripePriceId: null },
    { plan: "BASIC", region: "EUROPE", interval: "YEARLY",  currency: "GBP", amount: 8990, stripePriceId: null },

    // ── BASIC — ROW (USD) ──
    { plan: "BASIC", region: "ROW", interval: "MONTHLY", currency: "USD", amount: 999, stripePriceId: null },
    { plan: "BASIC", region: "ROW", interval: "YEARLY",  currency: "USD", amount: 9990, stripePriceId: null },

    // ── PROFESSIONAL — AFRICA (USD) ──
    { plan: "PROFESSIONAL", region: "AFRICA", interval: "MONTHLY", currency: "USD", amount: 999, stripePriceId: null },
    { plan: "PROFESSIONAL", region: "AFRICA", interval: "YEARLY",  currency: "USD", amount: 9990, stripePriceId: null },
    // ── PROFESSIONAL — AFRICA (NGN) ──
    { plan: "PROFESSIONAL", region: "AFRICA", interval: "MONTHLY", currency: "NGN", amount: 900000, stripePriceId: null },
    { plan: "PROFESSIONAL", region: "AFRICA", interval: "YEARLY",  currency: "NGN", amount: 9000000, stripePriceId: null },

    // ── PROFESSIONAL — EUROPE (EUR) ──
    { plan: "PROFESSIONAL", region: "EUROPE", interval: "MONTHLY", currency: "EUR", amount: 2499, stripePriceId: null },
    { plan: "PROFESSIONAL", region: "EUROPE", interval: "YEARLY",  currency: "EUR", amount: 24990, stripePriceId: null },
    // ── PROFESSIONAL — EUROPE (GBP) ──
    { plan: "PROFESSIONAL", region: "EUROPE", interval: "MONTHLY", currency: "GBP", amount: 2199, stripePriceId: null },
    { plan: "PROFESSIONAL", region: "EUROPE", interval: "YEARLY",  currency: "GBP", amount: 21990, stripePriceId: null },

    // ── PROFESSIONAL — ROW (USD) ──
    { plan: "PROFESSIONAL", region: "ROW", interval: "MONTHLY", currency: "USD", amount: 2499, stripePriceId: null },
    { plan: "PROFESSIONAL", region: "ROW", interval: "YEARLY",  currency: "USD", amount: 24990, stripePriceId: null },

    // ── EMPLOYER BASIC — AFRICA ──
    { plan: "EMPLOYER_BASIC", region: "AFRICA", interval: "MONTHLY", currency: "USD", amount: 4999, stripePriceId: null },
    { plan: "EMPLOYER_BASIC", region: "AFRICA", interval: "YEARLY",  currency: "USD", amount: 49990, stripePriceId: null },

    // ── EMPLOYER BASIC — EUROPE ──
    { plan: "EMPLOYER_BASIC", region: "EUROPE", interval: "MONTHLY", currency: "EUR", amount: 9999, stripePriceId: null },
    { plan: "EMPLOYER_BASIC", region: "EUROPE", interval: "YEARLY",  currency: "EUR", amount: 99990, stripePriceId: null },

    // ── EMPLOYER BASIC — ROW ──
    { plan: "EMPLOYER_BASIC", region: "ROW", interval: "MONTHLY", currency: "USD", amount: 9999, stripePriceId: null },
    { plan: "EMPLOYER_BASIC", region: "ROW", interval: "YEARLY",  currency: "USD", amount: 99990, stripePriceId: null },

    // ── EMPLOYER PREMIUM — AFRICA ──
    { plan: "EMPLOYER_PREMIUM", region: "AFRICA", interval: "MONTHLY", currency: "USD", amount: 14999, stripePriceId: null },
    { plan: "EMPLOYER_PREMIUM", region: "AFRICA", interval: "YEARLY",  currency: "USD", amount: 149990, stripePriceId: null },

    // ── EMPLOYER PREMIUM — EUROPE ──
    { plan: "EMPLOYER_PREMIUM", region: "EUROPE", interval: "MONTHLY", currency: "EUR", amount: 29999, stripePriceId: null },
    { plan: "EMPLOYER_PREMIUM", region: "EUROPE", interval: "YEARLY",  currency: "EUR", amount: 299990, stripePriceId: null },

    // ── EMPLOYER PREMIUM — ROW ──
    { plan: "EMPLOYER_PREMIUM", region: "ROW", interval: "MONTHLY", currency: "USD", amount: 29999, stripePriceId: null },
    { plan: "EMPLOYER_PREMIUM", region: "ROW", interval: "YEARLY",  currency: "USD", amount: 299990, stripePriceId: null },
  ];

  for (const p of prices) {
    await prisma.regionalPrice.upsert({
      where: {
        plan_region_interval_currency: {
          plan: p.plan,
          region: p.region,
          interval: p.interval,
          currency: p.currency,
        },
      },
      create: p,
      update: p,
    });
  }
  console.log(`${prices.length} regional prices seeded`);
}

async function seedEntitlements() {
  const entitlements = [
    { plan: "FREE" as const, applicationsPerMonth: 5, aiResumeReviews: null, aiJobMatches: null, aiApplyPacks: null, savedSearches: 3, jobAlerts: true, prioritySupport: false, skillsAssessments: false, chatAccess: false, autopilot: false, jobPostsPerMonth: null, talentSearch: false, analytics: false, apiAccess: false, atsIntegrations: null, videoMockInterviews: 2, pipelineExports: false, brandedCareerPage: false, advancedFunnelMetrics: false },
    { plan: "BASIC" as const, applicationsPerMonth: null, aiResumeReviews: 10, aiJobMatches: null, aiApplyPacks: null, savedSearches: null, jobAlerts: true, prioritySupport: false, skillsAssessments: false, chatAccess: true, autopilot: false, jobPostsPerMonth: null, talentSearch: false, analytics: false, apiAccess: false, atsIntegrations: null, videoMockInterviews: 5, pipelineExports: false, brandedCareerPage: false, advancedFunnelMetrics: false },
    { plan: "PROFESSIONAL" as const, applicationsPerMonth: null, aiResumeReviews: null, aiJobMatches: 20, aiApplyPacks: 5, savedSearches: null, jobAlerts: true, prioritySupport: true, skillsAssessments: true, chatAccess: true, autopilot: true, jobPostsPerMonth: null, talentSearch: false, analytics: false, apiAccess: false, atsIntegrations: null, videoMockInterviews: 10, pipelineExports: false, brandedCareerPage: false, advancedFunnelMetrics: false },
    { plan: "EMPLOYER_FREE" as const, applicationsPerMonth: null, aiResumeReviews: null, aiJobMatches: null, aiApplyPacks: null, savedSearches: null, jobAlerts: false, prioritySupport: false, skillsAssessments: false, chatAccess: false, autopilot: false, jobPostsPerMonth: 3, talentSearch: false, analytics: false, apiAccess: false, atsIntegrations: 0, videoMockInterviews: null, pipelineExports: false, brandedCareerPage: false, advancedFunnelMetrics: false },
    { plan: "EMPLOYER_BASIC" as const, applicationsPerMonth: null, aiResumeReviews: null, aiJobMatches: null, aiApplyPacks: null, savedSearches: null, jobAlerts: false, prioritySupport: false, skillsAssessments: false, chatAccess: false, autopilot: false, jobPostsPerMonth: 20, talentSearch: true, analytics: true, apiAccess: false, atsIntegrations: 1, videoMockInterviews: null, pipelineExports: false, brandedCareerPage: true, advancedFunnelMetrics: false },
    { plan: "EMPLOYER_PREMIUM" as const, applicationsPerMonth: null, aiResumeReviews: null, aiJobMatches: null, aiApplyPacks: null, savedSearches: null, jobAlerts: false, prioritySupport: true, skillsAssessments: false, chatAccess: false, autopilot: false, jobPostsPerMonth: null, talentSearch: true, analytics: true, apiAccess: true, atsIntegrations: 5, videoMockInterviews: null, pipelineExports: true, brandedCareerPage: true, advancedFunnelMetrics: true },
  ];

  for (const e of entitlements) {
    await prisma.planEntitlement.upsert({
      where: { plan: e.plan },
      create: e,
      update: e,
    });
  }
  console.log("Plan entitlements seeded");
}

async function main() {
  await seedRegionConfig();
  await seedPrices();
  await seedEntitlements();
  console.log("Regional pricing seed complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
