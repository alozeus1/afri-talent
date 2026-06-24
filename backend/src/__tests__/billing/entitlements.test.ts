import { beforeEach, describe, it, expect, vi } from "vitest";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    subscription: { findUnique: vi.fn() },
    planEntitlement: { findUnique: vi.fn() },
  },
}));

vi.mock("../../lib/prisma.js", () => ({ default: prismaMock }));

import {
  DEFAULT_ENTITLEMENTS,
  getUserEntitlements,
} from "../../lib/billing/entitlements.js";

describe("getUserEntitlements — subscription status gating (H3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No DB-backed PlanEntitlement rows → use hardcoded defaults.
    prismaMock.planEntitlement.findUnique.mockResolvedValue(null);
  });

  it("ACTIVE paid subscription keeps its plan entitlements", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.PROFESSIONAL,
      status: SubscriptionStatus.ACTIVE,
    });
    const ent = await getUserEntitlements("user-1");
    expect(ent.plan).toBe(SubscriptionPlan.PROFESSIONAL);
    expect(ent.autopilot).toBe(true);
  });

  it("PAST_DUE paid subscription is downgraded to FREE (failed payment loses access)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.PROFESSIONAL,
      status: SubscriptionStatus.PAST_DUE,
    });
    const ent = await getUserEntitlements("user-2");
    expect(ent.plan).toBe(SubscriptionPlan.FREE);
    expect(ent.autopilot).toBe(false);
  });

  it("CANCELLED subscription is downgraded to FREE", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.PROFESSIONAL,
      status: SubscriptionStatus.CANCELLED,
    });
    const ent = await getUserEntitlements("user-3");
    expect(ent.plan).toBe(SubscriptionPlan.FREE);
  });

  it("INACTIVE subscription is downgraded to FREE", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.BASIC,
      status: SubscriptionStatus.INACTIVE,
    });
    const ent = await getUserEntitlements("user-4");
    expect(ent.plan).toBe(SubscriptionPlan.FREE);
  });

  it("no subscription record falls back to FREE", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    const ent = await getUserEntitlements("user-5");
    expect(ent.plan).toBe(SubscriptionPlan.FREE);
  });
});

describe("DEFAULT_ENTITLEMENTS", () => {
  it("FREE plan has 5 applications/month", () => {
    expect(DEFAULT_ENTITLEMENTS.FREE.applicationsPerMonth).toBe(5);
  });

  it("BASIC plan has unlimited applications", () => {
    expect(DEFAULT_ENTITLEMENTS.BASIC.applicationsPerMonth).toBeNull();
  });

  it("PROFESSIONAL plan has autopilot", () => {
    expect(DEFAULT_ENTITLEMENTS.PROFESSIONAL.autopilot).toBe(true);
  });

  it("PROFESSIONAL plan has priority support", () => {
    expect(DEFAULT_ENTITLEMENTS.PROFESSIONAL.prioritySupport).toBe(true);
  });

  it("FREE plan has no chat access", () => {
    expect(DEFAULT_ENTITLEMENTS.FREE.chatAccess).toBe(false);
  });

  it("BASIC plan has chat access", () => {
    expect(DEFAULT_ENTITLEMENTS.BASIC.chatAccess).toBe(true);
  });

  it("entitlements are identical regardless of region (decoupled)", () => {
    // Entitlements are keyed by plan only, not by region
    const proEntitlements = DEFAULT_ENTITLEMENTS.PROFESSIONAL;
    expect(proEntitlements.aiJobMatches).toBe(20);
    expect(proEntitlements.aiApplyPacks).toBe(5);
    expect(proEntitlements.skillsAssessments).toBe(true);
    // These same values apply to Africa, Europe, and ROW
  });

  it("EMPLOYER_FREE has unlimited job posts (permission to post is universal across employer tiers)", () => {
    expect(DEFAULT_ENTITLEMENTS.EMPLOYER_FREE.jobPostsPerMonth).toBeNull();
  });

  it("EMPLOYER_BASIC has unlimited job posts", () => {
    expect(DEFAULT_ENTITLEMENTS.EMPLOYER_BASIC.jobPostsPerMonth).toBeNull();
  });

  it("EMPLOYER_BASIC has talent search", () => {
    expect(DEFAULT_ENTITLEMENTS.EMPLOYER_BASIC.talentSearch).toBe(true);
  });

  it("EMPLOYER_PREMIUM has API access", () => {
    expect(DEFAULT_ENTITLEMENTS.EMPLOYER_PREMIUM.apiAccess).toBe(true);
  });

  it("EMPLOYER_PREMIUM has unlimited job posts", () => {
    expect(DEFAULT_ENTITLEMENTS.EMPLOYER_PREMIUM.jobPostsPerMonth).toBeNull();
  });

  it("candidate plans don't have employer features", () => {
    expect(DEFAULT_ENTITLEMENTS.FREE.jobPostsPerMonth).toBeNull();
    expect(DEFAULT_ENTITLEMENTS.FREE.talentSearch).toBe(false);
    expect(DEFAULT_ENTITLEMENTS.PROFESSIONAL.apiAccess).toBe(false);
  });

  it("all 6 plans are defined", () => {
    const plans = Object.keys(DEFAULT_ENTITLEMENTS);
    expect(plans).toHaveLength(6);
    expect(plans).toContain("FREE");
    expect(plans).toContain("BASIC");
    expect(plans).toContain("PROFESSIONAL");
    expect(plans).toContain("EMPLOYER_FREE");
    expect(plans).toContain("EMPLOYER_BASIC");
    expect(plans).toContain("EMPLOYER_PREMIUM");
  });
});
