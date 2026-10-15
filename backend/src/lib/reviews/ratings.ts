import prisma from "../prisma.js";

/**
 * Recompute a company's rating aggregate from its approved reviews.
 * Called after every moderation decision (approve or reject) from both the
 * company route and the admin console, so un-approving a review removes it.
 */
export async function updateCompanyRatings(companyId: string): Promise<void> {
  const reviews = await prisma.companyReview.findMany({
    where: { companyId, isApproved: true },
  });

  if (reviews.length === 0) {
    await prisma.companyRatingAggregate.deleteMany({ where: { companyId } });
    return;
  }

  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v !== null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const aggregates = {
    totalReviews: reviews.length,
    averageOverall: avg(reviews.map((r) => r.overallRating)),
    averageCulture: avg(reviews.map((r) => r.cultureRating)),
    averageSalary: avg(reviews.map((r) => r.salaryRating)),
    averageWorkLife: avg(reviews.map((r) => r.workLifeRating)),
    averageManagement: avg(reviews.map((r) => r.managementRating)),
    averageGrowth: avg(reviews.map((r) => r.growthRating)),
    recommendationPct: (reviews.filter((r) => r.overallRating >= 4).length / reviews.length) * 100,
  };

  await prisma.companyRatingAggregate.upsert({
    where: { companyId },
    create: { companyId, ...aggregates },
    update: aggregates,
  });
}

/** Moderation write shared by both admin entry points. */
export function moderationData(approved: boolean, now = new Date()) {
  return {
    isApproved: approved,
    moderatedAt: now,
    rejectedAt: approved ? null : now,
  };
}
