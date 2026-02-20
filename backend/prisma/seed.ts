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
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  // Tear down in dependency order
  await prisma.message.deleteMany();
  await prisma.threadParticipant.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.resume.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.adminReview.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("Password123!", 10);

  // ── Users ──────────────────────────────────────────────

  const adminUser = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: passwordHash,
      role: Role.ADMIN,
      name: "Admin User",
    },
  });

  const candidateUser = await prisma.user.create({
    data: {
      email: "candidate@example.com",
      password: passwordHash,
      role: Role.CANDIDATE,
      name: "Candidate One",
    },
  });

  const employerUser = await prisma.user.create({
    data: {
      email: "employer@example.com",
      password: passwordHash,
      role: Role.EMPLOYER,
      name: "Employer Owner",
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
  console.log("   Demo credentials (password: Password123!):");
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
