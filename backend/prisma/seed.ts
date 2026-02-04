// backend/prisma/seed.ts
import { PrismaClient, Role, JobStatus, ApplicationStatus, ReviewStatus, ReviewTargetType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  await prisma.adminReview.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.employer.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: passwordHash,
      role: Role.ADMIN,
      name: "Admin User",
    },
  });

  const candidate = await prisma.user.create({
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

  const employer = await prisma.employer.create({
    data: {
      userId: employerUser.id,
      companyName: "Africa Tech Co",
      website: "https://example.com",
      location: "Remote, Africa",
      bio: "We hire and support global African tech talent.",
    },
  });

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
    },
  });

  await prisma.application.create({
    data: {
      jobId: job1.id,
      candidateId: candidate.id,
      status: ApplicationStatus.PENDING,
      cvUrl: "https://example.com/cv.pdf",
      coverLetter: "Excited to apply!",
    },
  });

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

  await prisma.adminReview.create({
    data: {
      reviewerId: admin.id,
      targetType: ReviewTargetType.JOB,
      targetJobId: job1.id,
      status: ReviewStatus.PENDING,
      notes: "Awaiting moderation",
    },
  });

  console.log("✅ Seed completed successfully");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

