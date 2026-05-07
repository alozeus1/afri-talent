/**
 * Seed script: Premium Resume Template Catalog
 *
 * Run after uploading template assets to S3:
 *   npx tsx prisma/seed-templates.ts
 *
 * Before running, update the S3 keys below to match your uploaded files.
 * Templates are sourced from: /Users/ocheme/Desktop/Personal/premium-products/HireReady-Templates/
 */

import prisma from "../src/lib/prisma.js";
import { SubscriptionPlan } from "@prisma/client";

const TEMPLATES = [
  {
    name: "Healthcare Nurse Resume",
    description:
      "A clean, ATS-optimized resume template tailored for nursing and healthcare professionals. Emphasizes certifications, clinical rotations, and patient-care metrics.",
    thumbnailUrl: "templates/thumbnails/healthcare-nurse-thumb.png",
    tags: ["ATS-Optimized", "Healthcare", "Nurse", "Clinical"],
    bestFor: ["entry", "mid", "healthcare"],
    minPlan: SubscriptionPlan.PROFESSIONAL,
    sortOrder: 1,
    files: [
      { format: "HTML" as const, s3Key: "templates/resumes/01-Healthcare-Nurse-Resume.html", fileSizeBytes: 13122 },
      { format: "PDF" as const, s3Key: "templates/resumes/01-Healthcare-Nurse-Resume.pdf", fileSizeBytes: 28315 },
    ],
  },
  {
    name: "Tech & AI Resume",
    description:
      "Modern resume layout for software engineers, AI/ML specialists, and data scientists. Highlights technical skills, project impact, and quantified engineering outcomes.",
    thumbnailUrl: "templates/thumbnails/tech-ai-thumb.png",
    tags: ["ATS-Optimized", "Tech", "AI", "Software Engineering"],
    bestFor: ["entry", "senior", "tech"],
    minPlan: SubscriptionPlan.PROFESSIONAL,
    sortOrder: 2,
    files: [
      { format: "HTML" as const, s3Key: "templates/resumes/02-TechAI-Resume.html", fileSizeBytes: 15610 },
      { format: "PDF" as const, s3Key: "templates/resumes/02-TechAI-Resume.pdf", fileSizeBytes: 43574 },
    ],
  },
  {
    name: "Executive Resume",
    description:
      "Polished, leadership-focused resume for directors, VPs, and C-suite candidates. Emphasizes strategic impact, P&L ownership, and team-scale achievements.",
    thumbnailUrl: "templates/thumbnails/executive-thumb.png",
    tags: ["ATS-Optimized", "Executive", "Leadership", "Senior"],
    bestFor: ["senior", "executive", "non-tech"],
    minPlan: SubscriptionPlan.PROFESSIONAL,
    sortOrder: 3,
    files: [
      { format: "HTML" as const, s3Key: "templates/resumes/03-Executive-Resume.html", fileSizeBytes: 15680 },
      { format: "PDF" as const, s3Key: "templates/resumes/03-Executive-Resume.pdf", fileSizeBytes: 30576 },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding resume template catalog...\n");

  for (const template of TEMPLATES) {
    const existing = await prisma.resumeTemplate.findFirst({
      where: { name: template.name },
    });

    if (existing) {
      console.log(`   ⏭️  Skipping existing template: ${template.name}`);
      continue;
    }

    const created = await prisma.resumeTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        thumbnailUrl: template.thumbnailUrl,
        tags: template.tags,
        bestFor: template.bestFor,
        minPlan: template.minPlan,
        sortOrder: template.sortOrder,
        isActive: true,
        files: {
          create: template.files.map((f) => ({
            format: f.format,
            s3Key: f.s3Key,
            fileSizeBytes: f.fileSizeBytes,
          })),
        },
      },
      include: { files: true },
    });

    console.log(`   ✅ Created: ${created.name} (${created.files.length} files)`);
  }

  console.log("\n✅ Template seed completed.");
  console.log("   Next: upload template files to S3 and verify presigned downloads.");
}

main()
  .catch((e) => {
    console.error("❌ Template seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
