import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Prisma, Role, SubscriptionPlan } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

const {
  prismaMock,
  stripeApiMock,
  isStripeConfiguredMock,
  getStripeMock,
  getPlanFromPriceIdMock,
  createUserNotificationMock,
} = vi.hoisted(() => {
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    employer: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    job: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    application: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    resource: {
      count: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    userBillingProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    billingRegionAudit: {
      create: vi.fn(),
    },
    billingEntitlementState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    billingEventAudit: {
      create: vi.fn(),
      count: vi.fn(),
    },
    billingWebhookIdempotencyKey: {
      create: vi.fn(),
    },
    billingDiscrepancy: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    billingSupportAction: {
      create: vi.fn(),
    },
    billingReconciliationRun: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    regionConfig: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    regionalPrice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    planEntitlement: {
      findUnique: vi.fn(),
    },
    analyticsEvent: {
      createMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    pushSubscription: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    emailVerificationToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    oAuthAccount: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    candidateProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    savedSearch: {
      count: vi.fn(),
    },
    jobAlert: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    companyReview: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    adminReview: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn(),
  };

  const stripeApiMock = {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
    invoices: {
      sendInvoice: vi.fn(),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };

  return {
    prismaMock,
    stripeApiMock,
    isStripeConfiguredMock: vi.fn(),
    getStripeMock: vi.fn(),
    getPlanFromPriceIdMock: vi.fn(),
    createUserNotificationMock: vi.fn(),
  };
});

vi.mock("../lib/ai/persistence.js", () => ({
  createAiRun: vi.fn().mockResolvedValue(undefined),
  completeAiRun: vi.fn().mockResolvedValue(undefined),
  getRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../lib/prisma.js", () => ({
  default: prismaMock,
}));

vi.mock("../lib/stripe.js", () => ({
  isStripeConfigured: isStripeConfiguredMock,
  getStripe: getStripeMock,
  getPlanFromPriceId: getPlanFromPriceIdMock,
  STRIPE_PRICES: {
    [SubscriptionPlan.FREE]: undefined,
    [SubscriptionPlan.BASIC]: "price_basic_fallback",
    [SubscriptionPlan.PROFESSIONAL]: "price_professional_fallback",
    [SubscriptionPlan.EMPLOYER_FREE]: undefined,
    [SubscriptionPlan.EMPLOYER_BASIC]: "price_employer_basic_fallback",
    [SubscriptionPlan.EMPLOYER_PREMIUM]: "price_employer_premium_fallback",
  },
}));

vi.mock("../lib/notifications.js", () => ({
  createUserNotification: createUserNotificationMock,
}));

import app from "../app.js";

function makeToken(
  role: Role = Role.CANDIDATE,
  userId = "user-1",
  email = "user@example.com",
): string {
  return signToken({ userId, role, email });
}

type UserLookupHandler = {
  matches: (args: any) => boolean;
  value: unknown;
};

function mockCurrentAccount(
  input: { id: string; email: string; role: Role },
  routeLookups: UserLookupHandler[] = [],
): void {
  prismaMock.user.findUnique.mockImplementation((args: any) => {
    const isAuthLookup =
      args?.where?.id === input.id &&
      args?.select?.deletedAt === true &&
      args?.select?.accountRestrictionStatus === true;

    if (isAuthLookup) {
      return Promise.resolve({
        id: input.id,
        email: input.email,
        role: input.role,
        deletedAt: null,
        accountRestrictionStatus: "ACTIVE",
      });
    }

    const routeLookup = routeLookups.find(({ matches }) => matches(args));
    return routeLookup ? Promise.resolve(routeLookup.value) : undefined;
  });
}

describe("Phase 1/2 quality integration suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

    isStripeConfiguredMock.mockReturnValue(false);
    getStripeMock.mockReturnValue(stripeApiMock);
    getPlanFromPriceIdMock.mockReturnValue(SubscriptionPlan.BASIC);
    createUserNotificationMock.mockResolvedValue({ id: "notif-1" });

    stripeApiMock.customers.create.mockResolvedValue({ id: "cus_123" });
    stripeApiMock.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.test/session",
    });
    stripeApiMock.billingPortal.sessions.create.mockResolvedValue({
      id: "bps_123",
      url: "https://billing.stripe.test/portal",
    });
    stripeApiMock.subscriptions.retrieve.mockResolvedValue({
      status: "active",
      items: {
        data: [{ price: { id: "price_regional_basic" } }],
      },
    });
    stripeApiMock.invoices.sendInvoice.mockResolvedValue({ id: "in_test_123" });
    stripeApiMock.webhooks.constructEvent.mockReset();

    prismaMock.$transaction.mockImplementation(async (value: unknown) => {
      if (Array.isArray(value)) {
        return Promise.all(value as Promise<unknown>[]);
      }
      if (typeof value === "function") {
        return (value as (tx: typeof prismaMock) => unknown)(prismaMock as unknown as typeof prismaMock);
      }
      return value;
    });

    prismaMock.planEntitlement.findUnique.mockResolvedValue(null);
    prismaMock.regionConfig.findUnique.mockResolvedValue({
      region: "ROW",
      defaultCurrency: "USD",
      currencies: ["USD", "EUR"],
      taxBehavior: "exclusive",
      taxLabel: "Tax excluded",
      metadata: {},
    });
    prismaMock.regionConfig.findMany.mockResolvedValue([]);
    prismaMock.regionalPrice.findMany.mockResolvedValue([]);
    prismaMock.regionalPrice.findFirst.mockResolvedValue({
      plan: SubscriptionPlan.BASIC,
      region: "EUROPE",
      interval: "MONTHLY",
      currency: "EUR",
      amount: 4900,
      stripePriceId: "price_regional_basic",
      isActive: true,
      createdAt: new Date(),
    });
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findMany.mockResolvedValue([]);
    prismaMock.subscription.upsert.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      plan: SubscriptionPlan.FREE,
      status: "INACTIVE",
    });
    prismaMock.userBillingProfile.findUnique.mockResolvedValue({
      userId: "user-1",
      country: "FR",
      stripeCountry: "FR",
      region: "EUROPE",
      currency: "EUR",
      regionSource: "USER_SELECTED",
      isGrandfathered: false,
      pricingVersion: 1,
      taxIdType: null,
      taxIdValue: null,
    });
    prismaMock.userBillingProfile.update.mockResolvedValue({});
    prismaMock.billingEntitlementState.findUnique.mockResolvedValue(null);
    prismaMock.billingEntitlementState.upsert.mockResolvedValue({
      id: "state-1",
      effectivePlan: SubscriptionPlan.FREE,
      effectiveStatus: "INACTIVE",
      checksum: "checksum",
    });
    prismaMock.billingEventAudit.create.mockResolvedValue({ id: "billing-event-1" });
    prismaMock.billingEventAudit.count.mockResolvedValue(0);
    prismaMock.billingWebhookIdempotencyKey.create.mockResolvedValue({ id: "idempotency-1" });
    prismaMock.billingDiscrepancy.findFirst.mockResolvedValue(null);
    prismaMock.billingDiscrepancy.create.mockResolvedValue({ id: "billing-discrepancy-1" });
    prismaMock.billingDiscrepancy.update.mockResolvedValue({ id: "billing-discrepancy-1" });
    prismaMock.billingDiscrepancy.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.billingDiscrepancy.count.mockResolvedValue(0);
    prismaMock.billingSupportAction.create.mockResolvedValue({ id: "billing-support-1" });
    prismaMock.billingReconciliationRun.create.mockResolvedValue({ id: "billing-run-1" });
    prismaMock.billingReconciliationRun.update.mockResolvedValue({ id: "billing-run-1" });
    prismaMock.billingReconciliationRun.findFirst.mockResolvedValue(null);
    prismaMock.billingReconciliationRun.findMany.mockResolvedValue([]);
    prismaMock.analyticsEvent.createMany.mockResolvedValue({ count: 1 });
    prismaMock.analyticsEvent.count.mockResolvedValue(0);
    prismaMock.analyticsEvent.groupBy.mockResolvedValue([]);

    prismaMock.user.count.mockResolvedValue(100);
    prismaMock.employer.count.mockResolvedValue(20);
    prismaMock.job.count.mockResolvedValue(50);
    prismaMock.application.count.mockResolvedValue(10);
    prismaMock.resource.count.mockResolvedValue(5);

    prismaMock.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.emailVerificationToken.create.mockResolvedValue({
      id: "evt-1",
      token: "token-123",
      userId: "candidate-1",
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.emailVerificationToken.update.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({});
  });

  afterEach(() => {
    prismaMock.user.findUnique.mockReset();
  });

  it("only advertises Google OAuth when both client id and secret exist", async () => {
    const prevGoogle = process.env.GOOGLE_CLIENT_ID;
    const prevGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;

    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    delete process.env.GOOGLE_CLIENT_SECRET;

    const missingSecretRes = await request(app).get("/api/auth/oauth/providers");
    expect(missingSecretRes.status).toBe(200);
    expect(missingSecretRes.body.providers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "google" })]),
    );

    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const enabledRes = await request(app).get("/api/auth/oauth/providers");
    expect(enabledRes.status).toBe(200);
    expect(enabledRes.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google",
          clientId: "google-client-id",
          enabled: true,
        }),
      ]),
    );

    process.env.GOOGLE_CLIENT_ID = prevGoogle;
    process.env.GOOGLE_CLIENT_SECRET = prevGoogleSecret;
  });

  it("serves OpenAPI docs and includes key Phase 1 paths", async () => {
    const res = await request(app).get("/api/docs/spec.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.3");
    expect(res.body.paths["/api/auth/oauth/google/callback"]).toBeDefined();
    expect(res.body.paths["/api/auth/oauth/github/callback"]).toBeDefined();
    expect(res.body.paths["/api/auth/email/send-verification"]).toBeDefined();
    expect(res.body.paths["/api/pricing"]).toBeDefined();
  });

  it("exposes OAuth providers endpoint for frontend CTAs", async () => {
    const prevGoogle = process.env.GOOGLE_CLIENT_ID;
    const prevGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
    const prevGithub = process.env.GITHUB_CLIENT_ID;
    const prevGithubSecret = process.env.GITHUB_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GITHUB_CLIENT_ID = "github-client-id";
    process.env.GITHUB_CLIENT_SECRET = "github-client-secret";

    const res = await request(app).get("/api/auth/oauth/providers");

    expect(res.status).toBe(200);
    expect(res.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "google", enabled: true }),
        expect.objectContaining({ provider: "github", enabled: true }),
      ]),
    );

    process.env.GOOGLE_CLIENT_ID = prevGoogle;
    process.env.GOOGLE_CLIENT_SECRET = prevGoogleSecret;
    process.env.GITHUB_CLIENT_ID = prevGithub;
    process.env.GITHUB_CLIENT_SECRET = prevGithubSecret;
  });

  it("resolves pricing region from explicit query and geo header", async () => {
    const byQuery = await request(app).get("/api/pricing?region=AFRICA");
    expect(byQuery.status).toBe(200);
    expect(byQuery.body.region).toBe("AFRICA");

    const byGeoHeader = await request(app)
      .get("/api/pricing")
      .set("cf-ipcountry", "FR");
    expect(byGeoHeader.status).toBe(200);
    expect(byGeoHeader.body.region).toBe("EUROPE");
  });

  it("rejects billing-country tampering attempts with invalid payload", async () => {
    const token = makeToken(Role.CANDIDATE, "candidate-1", "candidate@example.com");
    mockCurrentAccount({ id: "candidate-1", email: "candidate@example.com", role: Role.CANDIDATE });

    const res = await request(app)
      .post("/api/pricing/billing-country")
      .set("Authorization", `Bearer ${token}`)
      .send({ country: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("sends and verifies email verification tokens", async () => {
    const token = makeToken(Role.CANDIDATE, "candidate-1", "candidate@example.com");
    mockCurrentAccount(
      { id: "candidate-1", email: "candidate@example.com", role: Role.CANDIDATE },
      [{
        matches: (args) => args?.where?.id === "candidate-1" && !args?.select && !args?.include,
        value: {
          id: "candidate-1",
          email: "candidate@example.com",
          name: "Candidate",
          emailVerified: false,
        },
      }],
    );

    const sendRes = await request(app)
      .post("/api/auth/email/send-verification")
      .set("Authorization", `Bearer ${token}`);

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.message).toContain("Verification email sent");
    expect(prismaMock.emailVerificationToken.create).toHaveBeenCalled();

    prismaMock.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "evt-1",
      token: "token-123",
      userId: "candidate-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "candidate-1",
        email: "candidate@example.com",
      },
    });

    const verifyRes = await request(app)
      .post("/api/auth/email/verify")
      .send({ token: "token-123" });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toBe("Email verified successfully");
  });

  it("blocks checkout for unverified users, then creates a checkout session for verified users", async () => {
    const token = makeToken(Role.CANDIDATE, "candidate-1", "candidate@example.com");
    mockCurrentAccount(
      { id: "candidate-1", email: "candidate@example.com", role: Role.CANDIDATE },
      [{
        matches: (args) =>
          args?.where?.id === "candidate-1" &&
          args?.select?.emailVerified === true &&
          args?.select?.email === true,
        value: { emailVerified: false, email: "candidate@example.com" },
      }],
    );

    const blocked = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "BASIC", interval: "MONTHLY" });

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");

    isStripeConfiguredMock.mockReturnValue(true);
    mockCurrentAccount(
      { id: "candidate-1", email: "candidate@example.com", role: Role.CANDIDATE },
      [
        {
          matches: (args) =>
            args?.where?.id === "candidate-1" &&
            args?.select?.emailVerified === true &&
            args?.select?.email === true,
          value: { emailVerified: true, email: "candidate@example.com" },
        },
        {
          matches: (args) =>
            args?.where?.id === "candidate-1" &&
            args?.select?.email === true &&
            args?.select?.name === true,
          value: { email: "candidate@example.com", name: "Candidate One" },
        },
      ],
    );

    const ok = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "BASIC", interval: "MONTHLY" });

    expect(ok.status).toBe(200);
    expect(ok.body.sessionId).toBe("cs_test_123");
    expect(ok.body.url).toContain("checkout.stripe.test");
    expect(stripeApiMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ userId: "candidate-1", plan: "BASIC", interval: "MONTHLY" }),
        tax_id_collection: { enabled: true },
      }),
    );
  });

  it("validates Stripe webhook signatures and handles successful checkout completion", async () => {
    isStripeConfiguredMock.mockReturnValue(true);

    stripeApiMock.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error("Invalid signature");
    });

    const invalid = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "bad-signature")
      .set("Content-Type", "application/json")
      .send({ test: true });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Invalid webhook signature");

    stripeApiMock.webhooks.constructEvent.mockReturnValueOnce({
      id: "evt_checkout_ok_1",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
          metadata: {
            userId: "candidate-1",
            plan: "BASIC",
          },
        },
      },
    });

    const valid = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "valid-signature")
      .set("Content-Type", "application/json")
      .send({ test: true });

    expect(valid.status).toBe(200);
    expect(valid.body.received).toBe(true);
    expect(prismaMock.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "candidate-1" },
      }),
    );
    expect(createUserNotificationMock).toHaveBeenCalled();
  });

  it("treats duplicate Stripe webhook reservations as already processed", async () => {
    isStripeConfiguredMock.mockReturnValue(true);

    prismaMock.billingWebhookIdempotencyKey.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on idempotency key", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["key"] },
      }),
    );
    stripeApiMock.webhooks.constructEvent.mockReturnValueOnce({
      id: "evt_checkout_duplicate_1",
      type: "checkout.session.completed",
      created: 1_714_000_000,
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
          metadata: {
            userId: "candidate-1",
            plan: "BASIC",
          },
        },
      },
    });

    const res = await request(app)
      .post("/api/webhooks/stripe")
      .set("stripe-signature", "valid-signature")
      .set("Content-Type", "application/json")
      .send({ test: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(prismaMock.subscription.upsert).not.toHaveBeenCalled();
    expect(prismaMock.billingEventAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: "evt_checkout_duplicate_1",
          reasonCode: "duplicate_webhook_event",
        }),
      }),
    );
  });

  it("accepts analytics events for ingestion contracts", async () => {
    const res = await request(app)
      .post("/api/analytics/events")
      .send({
        events: [
          {
            category: "ACQUISITION",
            eventName: "signup_started",
            sessionId: "sess-1",
            path: "/register",
          },
        ],
      });

    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(1);
    expect(prismaMock.analyticsEvent.createMany).toHaveBeenCalled();
  });

  it("returns public hero stats from admin-backed aggregates", async () => {
    prismaMock.user.count.mockResolvedValueOnce(12345);
    prismaMock.employer.count.mockResolvedValueOnce(678);
    prismaMock.job.count.mockResolvedValueOnce(2468);

    const res = await request(app).get("/api/public/stats");
    expect(res.status).toBe(200);
    expect(res.body.activeCandidates).toBe(12345);
    expect(res.body.partnerCompanies).toBe(678);
    expect(res.body.jobsPosted).toBe(2468);
    expect(res.body.africanCountries).toBe(54);
  });

  it("provides admin stats used by dashboard/reporting surfaces", async () => {
    prismaMock.user.count.mockResolvedValueOnce(500);
    prismaMock.job.count.mockResolvedValueOnce(120).mockResolvedValueOnce(12);
    prismaMock.application.count.mockResolvedValueOnce(75);
    prismaMock.resource.count.mockResolvedValueOnce(23);

    const token = makeToken(Role.ADMIN, "admin-1", "admin@example.com");
    mockCurrentAccount({ id: "admin-1", email: "admin@example.com", role: Role.ADMIN });

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalUsers: 500,
      totalJobs: 120,
      pendingJobs: 12,
      totalApplications: 75,
      totalResources: 23,
    });
  });
});
