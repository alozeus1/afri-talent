import { BillingRegion, RegionChangeSource } from "@prisma/client";
import prisma from "../prisma.js";
import { countryToRegion } from "./regions.js";
/**
 * Resolve a user's billing region using the priority chain:
 *  1. Explicit billing profile (user-selected country) — highest confidence
 *  2. Stripe payment country — high confidence
 *  3. IP geolocation — low confidence (soft signal only)
 *  4. Default to ROW
 */
export async function resolveUserRegion(userId, ipCountry) {
    // 1. Check existing billing profile
    const profile = await prisma.userBillingProfile.findUnique({
        where: { userId },
    });
    if (profile?.country) {
        return {
            region: profile.region,
            country: profile.country,
            currency: profile.currency,
            source: profile.regionSource,
            confidence: "high",
        };
    }
    // 2. Check Stripe payment country on profile
    if (profile?.stripeCountry) {
        const region = countryToRegion(profile.stripeCountry);
        return {
            region,
            country: profile.stripeCountry,
            currency: profile.currency,
            source: RegionChangeSource.STRIPE_PAYMENT,
            confidence: "high",
        };
    }
    // 3. Check if we have a Stripe customer with a payment method country
    const sub = await prisma.subscription.findUnique({
        where: { userId },
        select: { stripeCustomerId: true },
    });
    // 4. IP geolocation as fallback (low confidence, not persisted automatically)
    if (ipCountry) {
        const region = countryToRegion(ipCountry);
        const regionConfig = await prisma.regionConfig.findUnique({ where: { region } });
        return {
            region,
            country: ipCountry,
            currency: regionConfig?.defaultCurrency ?? "USD",
            source: RegionChangeSource.IP_GEOLOCATION,
            confidence: "low",
        };
    }
    // 5. Default
    return {
        region: BillingRegion.ROW,
        country: null,
        currency: "USD",
        source: RegionChangeSource.IP_GEOLOCATION,
        confidence: "low",
    };
}
/**
 * Set/update a user's billing country and region.
 * Creates an audit trail entry on every change.
 */
export async function setUserBillingCountry(userId, country, source, opts) {
    const region = countryToRegion(country);
    const regionConfig = await prisma.regionConfig.findUnique({ where: { region } });
    const currency = regionConfig?.defaultCurrency ?? "USD";
    const existing = await prisma.userBillingProfile.findUnique({ where: { userId } });
    await prisma.$transaction(async (tx) => {
        const profile = await tx.userBillingProfile.upsert({
            where: { userId },
            create: {
                userId,
                country: country.toUpperCase(),
                region,
                currency,
                regionSource: source,
            },
            update: {
                country: country.toUpperCase(),
                region,
                currency,
                regionSource: source,
            },
        });
        // Audit trail if region actually changed
        if (!existing || existing.region !== region || existing.country !== country.toUpperCase()) {
            await tx.billingRegionAudit.create({
                data: {
                    profileId: profile.id,
                    previousRegion: existing?.region ?? null,
                    newRegion: region,
                    previousCountry: existing?.country ?? null,
                    newCountry: country.toUpperCase(),
                    source,
                    ipAddress: opts?.ipAddress ?? null,
                    metadata: opts?.metadata ?? undefined,
                },
            });
        }
    });
}
/**
 * Update billing profile with Stripe payment country.
 * Called from webhook when payment method country is detected.
 */
export async function updateStripeCountry(userId, stripeCountry) {
    const profile = await prisma.userBillingProfile.findUnique({ where: { userId } });
    if (!profile) {
        // Create profile with Stripe country
        await setUserBillingCountry(userId, stripeCountry, RegionChangeSource.STRIPE_PAYMENT);
        return;
    }
    // Only update stripeCountry field; don't override user-selected country
    await prisma.userBillingProfile.update({
        where: { userId },
        data: { stripeCountry: stripeCountry.toUpperCase() },
    });
    // If user hasn't explicitly selected a country, adopt Stripe's
    if (!profile.country || profile.regionSource === RegionChangeSource.IP_GEOLOCATION) {
        await setUserBillingCountry(userId, stripeCountry, RegionChangeSource.STRIPE_PAYMENT);
    }
}
//# sourceMappingURL=region-resolver.js.map