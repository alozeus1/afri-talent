// backend/prisma/seed.ts
import {
  PrismaClient,
  Role,
  JobStatus,
  ApplicationStatus,
  ReviewStatus,
  ReviewTargetType,
  VisaSponsorshipStatus,
  JobSource,
  SubscriptionPlan,
  SubscriptionStatus,
  BillingInterval,
  BillingRegion,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || "Password123!";

  // Tear down in dependency order
  await prisma.message.deleteMany();
  await prisma.threadParticipant.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.billingRegionAudit.deleteMany();
  await prisma.userBillingProfile.deleteMany();
  await prisma.planEntitlement.deleteMany();
  await prisma.regionalPrice.deleteMany();
  await prisma.regionConfig.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.adminReview.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // ── Users ──────────────────────────────────────────────

  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      password: passwordHash,
      role: Role.ADMIN,
      name: "Admin User",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const candidateUser = await prisma.user.create({
    data: {
      email: "candidate@example.com",
      password: passwordHash,
      role: Role.CANDIDATE,
      name: "Candidate One",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  const employerUser = await prisma.user.create({
    data: {
      email: "employer@example.com",
      password: passwordHash,
      role: Role.EMPLOYER,
      name: "Employer Owner",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // ── Employer profile ───────────────────────────────────

  const employer = await prisma.employer.create({
    data: {
      userId: employerUser.id,
      companyName: "Africa Tech Co",
      website: "https://example.com",
      location: "Remote, Africa",
      bio: "We hire and support global African tech talent.",
    },
  });

  // ── Candidate profile + resume ─────────────────────────

  const candidateProfile = await prisma.candidateProfile.create({
    data: {
      userId: candidateUser.id,
      headline: "Full-Stack Engineer seeking EU / Canada sponsorship",
      bio: "5 years building products in FinTech and e-commerce.",
      skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
      targetRoles: ["Full-Stack Engineer", "Backend Engineer"],
      targetCountries: ["Canada", "Germany", "United Kingdom"],
      yearsExperience: 5,
      visaStatus: "eligible-for-sponsorship",
    },
  });

  await prisma.resume.create({
    data: {
      profileId: candidateProfile.id,
      s3Key: `resumes/${candidateUser.id}/sample-resume.pdf`,
      fileName: "sample-resume.pdf",
      isActive: true,
    },
  });

  // ── Subscription (candidate on FREE plan) ─────────────

  await prisma.subscription.create({
    data: {
      userId: candidateUser.id,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  await prisma.subscription.create({
    data: {
      userId: employerUser.id,
      plan: SubscriptionPlan.EMPLOYER_FREE,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  // ── Regional pricing + billing fixtures ───────────────

  await prisma.regionConfig.createMany({
    data: [
      {
        region: BillingRegion.AFRICA,
        defaultCurrency: "NGN",
        currencies: ["NGN", "KES"],
        countries: ["NG", "KE", "GH", "ZA", "EG"],
        taxBehavior: "unspecified",
        taxLabel: "VAT",
      },
      {
        region: BillingRegion.EUROPE,
        defaultCurrency: "EUR",
        currencies: ["EUR", "GBP"],
        countries: ["DE", "FR", "NL", "IE", "ES"],
        taxBehavior: "exclusive",
        taxLabel: "VAT",
      },
      {
        region: BillingRegion.ROW,
        defaultCurrency: "USD",
        currencies: ["USD", "GBP"],
        countries: ["US", "CA", "GB"],
        taxBehavior: "unspecified",
        taxLabel: null,
      },
    ],
  });

  await prisma.planEntitlement.createMany({
    data: [
      {
        plan: SubscriptionPlan.FREE,
        applicationsPerMonth: 10,
        aiResumeReviews: 1,
        aiJobMatches: 5,
        aiApplyPacks: 0,
        savedSearches: 10,
        jobAlerts: true,
      },
      {
        plan: SubscriptionPlan.BASIC,
        applicationsPerMonth: 40,
        aiResumeReviews: 10,
        aiJobMatches: 30,
        aiApplyPacks: 5,
        savedSearches: 25,
        jobAlerts: true,
        skillsAssessments: true,
        chatAccess: true,
      },
      {
        plan: SubscriptionPlan.PROFESSIONAL,
        applicationsPerMonth: null,
        aiResumeReviews: null,
        aiJobMatches: null,
        aiApplyPacks: null,
        savedSearches: null,
        jobAlerts: true,
        prioritySupport: true,
        skillsAssessments: true,
        chatAccess: true,
        autopilot: true,
      },
      {
        plan: SubscriptionPlan.EMPLOYER_FREE,
        jobPostsPerMonth: 1,
        talentSearch: false,
      },
      {
        plan: SubscriptionPlan.EMPLOYER_BASIC,
        jobPostsPerMonth: 5,
        talentSearch: true,
        analytics: true,
        atsIntegrations: 1,
      },
      {
        plan: SubscriptionPlan.EMPLOYER_PREMIUM,
        jobPostsPerMonth: null,
        talentSearch: true,
        analytics: true,
        apiAccess: true,
        atsIntegrations: 5,
        pipelineExports: true,
        brandedCareerPage: true,
        advancedFunnelMetrics: true,
      },
    ],
  });

  const pricingMatrix = [
    {
      region: BillingRegion.AFRICA,
      currency: "NGN",
      prices: {
        [SubscriptionPlan.BASIC]: { monthly: 1500000, yearly: 15000000 },
        [SubscriptionPlan.PROFESSIONAL]: { monthly: 3500000, yearly: 33600000 },
        [SubscriptionPlan.EMPLOYER_BASIC]: { monthly: 6000000, yearly: 64800000 },
        [SubscriptionPlan.EMPLOYER_PREMIUM]: { monthly: 12000000, yearly: 126000000 },
      },
    },
    {
      region: BillingRegion.AFRICA,
      currency: "KES",
      prices: {
        [SubscriptionPlan.BASIC]: { monthly: 12500, yearly: 126000 },
        [SubscriptionPlan.PROFESSIONAL]: { monthly: 29000, yearly: 300000 },
        [SubscriptionPlan.EMPLOYER_BASIC]: { monthly: 52000, yearly: 540000 },
        [SubscriptionPlan.EMPLOYER_PREMIUM]: { monthly: 105000, yearly: 1080000 },
      },
    },
    {
      region: BillingRegion.ROW,
      currency: "USD",
      prices: {
        [SubscriptionPlan.BASIC]: { monthly: 1500, yearly: 14400 },
        [SubscriptionPlan.PROFESSIONAL]: { monthly: 3900, yearly: 37200 },
        [SubscriptionPlan.EMPLOYER_BASIC]: { monthly: 9900, yearly: 95040 },
        [SubscriptionPlan.EMPLOYER_PREMIUM]: { monthly: 19900, yearly: 190800 },
      },
    },
    {
      region: BillingRegion.ROW,
      currency: "GBP",
      prices: {
        [SubscriptionPlan.BASIC]: { monthly: 1200, yearly: 11520 },
        [SubscriptionPlan.PROFESSIONAL]: { monthly: 3200, yearly: 30720 },
        [SubscriptionPlan.EMPLOYER_BASIC]: { monthly: 8500, yearly: 81600 },
        [SubscriptionPlan.EMPLOYER_PREMIUM]: { monthly: 17500, yearly: 168000 },
      },
    },
  ] as const;

  await prisma.regionalPrice.createMany({
    data: pricingMatrix.flatMap(({ region, currency, prices }) =>
      Object.entries(prices).flatMap(([plan, amounts]) => ([
        {
          plan: plan as SubscriptionPlan,
          region,
          interval: BillingInterval.MONTHLY,
          currency,
          amount: amounts.monthly,
          stripePriceId: null,
        },
        {
          plan: plan as SubscriptionPlan,
          region,
          interval: BillingInterval.YEARLY,
          currency,
          amount: amounts.yearly,
          stripePriceId: null,
        },
      ])),
    ),
  });

  await prisma.userBillingProfile.createMany({
    data: [
      {
        userId: candidateUser.id,
        country: "NG",
        region: BillingRegion.AFRICA,
        currency: "NGN",
      },
      {
        userId: employerUser.id,
        country: "US",
        region: BillingRegion.ROW,
        currency: "USD",
      },
    ],
  });

  // ── Jobs ───────────────────────────────────────────────

  const job1 = await prisma.job.create({
    data: {
      title: "Senior Full-Stack Engineer",
      slug: "senior-full-stack-engineer",
      description: "Help build and scale the Africa Global Talent Platform.",
      location: "Remote",
      type: "Full-time",
      seniority: "Senior",
      salaryMin: 60000,
      salaryMax: 90000,
      currency: "USD",
      tags: ["React", "Node.js", "PostgreSQL"],
      employerId: employer.id,
      status: JobStatus.PUBLISHED,
      publishedAt: new Date(),
      visaSponsorship: VisaSponsorshipStatus.YES,
      relocationAssistance: true,
      eligibleCountries: ["NG", "GH", "KE", "ZA", "EG"],
      jobSource: JobSource.EMPLOYER_POSTED,
    },
  });

  // Aggregated job (no employer profile in DB)
  await prisma.job.create({
    data: {
      title: "Backend Engineer (Visa Sponsored)",
      slug: "backend-engineer-visa-sponsored",
      description: "Join a fast-growing EU startup. Full visa sponsorship provided.",
      location: "Berlin, Germany",
      type: "Full-time",
      seniority: "Mid-level",
      salaryMin: 55000,
      salaryMax: 75000,
      currency: "EUR",
      tags: ["Python", "FastAPI", "Kubernetes"],
      status: JobStatus.PUBLISHED,
      publishedAt: new Date(),
      visaSponsorship: VisaSponsorshipStatus.YES,
      relocationAssistance: true,
      eligibleCountries: ["NG", "GH", "KE", "ZA", "EG", "CM"],
      jobSource: JobSource.AGGREGATED,
      sourceName: "Greenhouse / GlobalTech GmbH",
      sourceUrl: "https://boards.greenhouse.io/globaltech/jobs/123",
      sourceId: "greenhouse-123",
    },
  });

  // ── Application ────────────────────────────────────────

  await prisma.application.create({
    data: {
      jobId: job1.id,
      candidateId: candidateUser.id,
      status: ApplicationStatus.PENDING,
      cvUrl: "https://s3.amazonaws.com/example/cv.pdf",
      coverLetter: "Excited to apply and contribute to AfriTalent's mission.",
    },
  });

  // ── Resource ───────────────────────────────────────────

  await prisma.resource.create({
    data: {
      title: "How to Land Remote Tech Roles from Africa",
      slug: "remote-tech-roles-africa",
      excerpt: "Practical steps for global jobs.",
      content: "Content goes here",
      category: "Career",
      published: true,
      publishedAt: new Date(),
    },
  });

  // ── Admin review ───────────────────────────────────────

  await prisma.adminReview.create({
    data: {
      reviewerId: adminUser.id,
      targetType: ReviewTargetType.JOB,
      targetJobId: job1.id,
      status: ReviewStatus.PENDING,
      notes: "Awaiting moderation",
    },
  });

  // ── Notification (sample) ──────────────────────────────

  await prisma.notification.create({
    data: {
      userId: candidateUser.id,
      type: "JOB_MATCH",
      title: "New visa-sponsored job match",
      body: "A new Senior Full-Stack Engineer role matches your profile.",
    },
  });

  console.log("✅ Seed completed successfully");
  console.log(`   Demo credentials (password: ${adminPassword}):`);
  console.log(`   Admin:     ${adminUser.email}`);
  console.log(`   Candidate: ${candidateUser.email}`);
  console.log(`   Employer:  ${employerUser.email}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
