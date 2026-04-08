import { Router, Request, Response } from "express";
import { z } from "zod";
import { BillingRegion, BillingInterval } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import {
  resolveUserRegion,
  setUserBillingCountry,
  getRegionalPrices,
  getEntitlements,
  getUserEntitlements,
  isValidCountryCode,
  countryToRegion,
  REGION_DEFAULTS,
  getDefaultCurrencyForCountry,
} from "../lib/billing/index.js";
import { RegionChangeSource, SubscriptionPlan } from "@prisma/client";

const router = Router();

// GET /api/pricing — public pricing page data (region from query or IP)
router.get("/", async (req: Request, res: Response) => {
  try {
    const region = (req.query.region as string)?.toUpperCase() as BillingRegion | undefined;
    const currency = req.query.currency as string | undefined;

    let resolvedRegion: BillingRegion = BillingRegion.ROW;

    if (region && Object.values(BillingRegion).includes(region)) {
      resolvedRegion = region;
    } else {
      // Try IP-based detection from common headers
      const ipCountry = extractIpCountry(req);
      if (ipCountry) {
        resolvedRegion = countryToRegion(ipCountry);
      }
    }

    const prices = await getRegionalPrices(resolvedRegion, currency);

    // Fetch all plan entitlements
    const plans = [
      SubscriptionPlan.FREE,
      SubscriptionPlan.BASIC,
      SubscriptionPlan.PROFESSIONAL,
      SubscriptionPlan.EMPLOYER_FREE,
      SubscriptionPlan.EMPLOYER_BASIC,
      SubscriptionPlan.EMPLOYER_PREMIUM,
    ];

    const entitlements = await Promise.all(plans.map((p) => getEntitlements(p)));

    const regionConfig = await prisma.regionConfig.findUnique({
      where: { region: resolvedRegion },
    });

    res.json({
      region: resolvedRegion,
      currency: currency?.toUpperCase() || regionConfig?.defaultCurrency || "USD",
      availableCurrencies: regionConfig?.currencies ?? REGION_DEFAULTS[resolvedRegion]?.currencies ?? ["USD"],
      taxBehavior: regionConfig?.taxBehavior ?? "unspecified",
      taxLabel: regionConfig?.taxLabel ?? null,
      prices,
      entitlements: entitlements.reduce(
        (acc, e) => ({ ...acc, [e.plan]: e }),
        {} as Record<string, unknown>,
      ),
    });
  } catch (error) {
    console.error("Pricing fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/me — authenticated user's pricing context
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const resolved = await resolveUserRegion(userId);
    const entitlements = await getUserEntitlements(userId);
    const prices = await getRegionalPrices(resolved.region, resolved.currency);

    const profile = await prisma.userBillingProfile.findUnique({
      where: { userId },
      select: {
        country: true,
        region: true,
        currency: true,
        isGrandfathered: true,
        pricingVersion: true,
        taxIdType: true,
        taxIdValue: true,
      },
    });

    res.json({
      region: resolved.region,
      country: resolved.country,
      currency: resolved.currency,
      confidence: resolved.confidence,
      source: resolved.source,
      isGrandfathered: profile?.isGrandfathered ?? false,
      pricingVersion: profile?.pricingVersion ?? 1,
      taxId: profile?.taxIdType ? { type: profile.taxIdType, value: profile.taxIdValue } : null,
      entitlements,
      prices,
    });
  } catch (error) {
    console.error("User pricing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const setBillingCountrySchema = z.object({
  country: z.string().length(2),
  currency: z.string().length(3).optional(),
  taxIdType: z.string().max(50).optional(),
  taxIdValue: z.string().max(100).optional(),
});

// POST /api/pricing/billing-country — user selects their billing country
router.post("/billing-country", authenticate, async (req: Request, res: Response) => {
  try {
    const { country, currency, taxIdType, taxIdValue } = setBillingCountrySchema.parse(req.body);

    if (!isValidCountryCode(country)) {
      res.status(400).json({ error: "Invalid country code" });
      return;
    }

    const ip = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();

    await setUserBillingCountry(
      req.user!.userId,
      country,
      RegionChangeSource.USER_SELECTED,
      { ipAddress: ip },
    );

    // Update tax ID if provided
    if (taxIdType || taxIdValue || currency) {
      const region = countryToRegion(country);
      const regionConfig = await prisma.regionConfig.findUnique({ where: { region } });

      if (currency && regionConfig && !regionConfig.currencies.includes(currency.toUpperCase())) {
        res.status(400).json({
          error: `Currency ${currency.toUpperCase()} is not supported for ${region}`,
        });
        return;
      }

      const defaultCurrency = getDefaultCurrencyForCountry(country) ?? regionConfig?.defaultCurrency;

      await prisma.userBillingProfile.update({
        where: { userId: req.user!.userId },
        data: {
          ...(taxIdType !== undefined && { taxIdType }),
          ...(taxIdValue !== undefined && { taxIdValue }),
          ...(currency && { currency: currency.toUpperCase() }),
          ...(!currency && defaultCurrency && { currency: defaultCurrency }),
        },
      });
    }

    const resolved = await resolveUserRegion(req.user!.userId);
    res.json({
      region: resolved.region,
      country: resolved.country,
      currency: resolved.currency,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Set billing country error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/regions — list available regions and their config
router.get("/regions", async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.regionConfig.findMany({
      where: { isActive: true },
      orderBy: { region: "asc" },
    });
    res.json(configs);
  } catch (error) {
    console.error("Regions fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/payment-localization — region payment methods + compliance roadmap
router.get("/payment-localization", async (_req: Request, res: Response) => {
  try {
    const configs = await prisma.regionConfig.findMany({
      where: { isActive: true },
      orderBy: { region: "asc" },
      select: {
        region: true,
        defaultCurrency: true,
        currencies: true,
        taxBehavior: true,
        taxLabel: true,
        metadata: true,
      },
    });

    res.json({
      regions: configs.map((config) => {
        const metadata = (config.metadata || {}) as Record<string, unknown>;
        return {
          region: config.region,
          defaultCurrency: config.defaultCurrency,
          currencies: config.currencies,
          taxBehavior: config.taxBehavior,
          taxLabel: config.taxLabel,
          paymentMethodsLive: Array.isArray(metadata.paymentMethodsLive)
            ? metadata.paymentMethodsLive
            : config.region === "AFRICA"
              ? ["flutterwave", "card"]
              : ["stripe", "card", "google_pay"],
          paymentMethodsRoadmap: Array.isArray(metadata.paymentMethodsRoadmap)
            ? metadata.paymentMethodsRoadmap
            : [],
          compliance: metadata.invoiceCompliance || null,
          taxMetadata: metadata.vatRates || null,
        };
      }),
      europeSpecific: {
        supportedTaxIds: ["eu_vat_id"],
        invoiceRules: [
          "VAT-exclusive pricing by default",
          "Reverse charge eligibility metadata for B2B invoices",
        ],
      },
      africaRoadmap: {
        plannedMethods: [
          "flutterwave",
          "paystack",
          "mtn_momo",
          "airtel_money",
          "bank_transfer_local_rails",
        ],
        status: "roadmap",
      },
    });
  } catch (error) {
    console.error("Payment localization error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/pricing/entitlements/:plan — get entitlements for a specific plan
router.get("/entitlements/:plan", async (req: Request, res: Response) => {
  try {
    const plan = req.params.plan.toUpperCase() as SubscriptionPlan;
    if (!Object.values(SubscriptionPlan).includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }
    const entitlements = await getEntitlements(plan);
    res.json(entitlements);
  } catch (error) {
    console.error("Entitlements fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function extractIpCountry(req: Request): string | null {
  // CloudFront / CloudFlare / AWS ALB headers
  return (
    (req.headers["cf-ipcountry"] as string) ||
    (req.headers["x-country-code"] as string) ||
    (req.headers["cloudfront-viewer-country"] as string) ||
    null
  );
}

export default router;
