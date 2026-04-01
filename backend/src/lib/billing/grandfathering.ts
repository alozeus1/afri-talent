import { SubscriptionStatus } from "@prisma/client";
import prisma from "../prisma.js";

/**
 * Grandfather all active subscribers at the current pricing version.
 * Call this BEFORE updating prices to a new version.
 */
export async function grandfatherActiveSubscribers(pricingVersion: number): Promise<number> {
  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      plan: { not: "FREE" },
    },
    select: { userId: true },
  });

  let count = 0;
  for (const sub of activeSubscriptions) {
    await prisma.userBillingProfile.upsert({
      where: { userId: sub.userId },
      create: {
        userId: sub.userId,
        isGrandfathered: true,
        grandfatheredAt: new Date(),
        pricingVersion,
      },
      update: {
        isGrandfathered: true,
        grandfatheredAt: new Date(),
        pricingVersion,
      },
    });
    count++;
  }

  return count;
}

/**
 * Check if a user is grandfathered at a specific pricing version.
 */
export async function isGrandfathered(userId: string): Promise<boolean> {
  const profile = await prisma.userBillingProfile.findUnique({
    where: { userId },
    select: { isGrandfathered: true },
  });
  return profile?.isGrandfathered ?? false;
}

/**
 * Remove grandfathered status (e.g., when user cancels and re-subscribes).
 */
export async function removeGrandfathering(userId: string): Promise<void> {
  await prisma.userBillingProfile.updateMany({
    where: { userId, isGrandfathered: true },
    data: { isGrandfathered: false, grandfatheredAt: null },
  });
}
