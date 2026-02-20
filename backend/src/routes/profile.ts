import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";

const router = Router();

const upsertProfileSchema = z.object({
  headline: z.string().max(200).trim().optional(),
  bio: z.string().max(5000).trim().optional(),
  skills: z.array(z.string().max(100)).max(50).optional(),
  targetRoles: z.array(z.string().max(100)).max(20).optional(),
  targetCountries: z.array(z.string().max(100)).max(54).optional(),
  yearsExperience: z.coerce.number().min(0).max(50).optional(),
  visaStatus: z.string().max(100).trim().optional(),
  linkedinUrl: z.string().url().max(500).optional().or(z.literal("")),
  githubUrl: z.string().url().max(500).optional().or(z.literal("")),
  portfolioUrl: z.string().url().max(500).optional().or(z.literal("")),
});

const resumeMetadataSchema = z.object({
  s3Key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  setActive: z.boolean().default(false),
});

// GET /api/profile — get own candidate profile
router.get("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      include: {
        resumes: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!profile) {
      // Return empty shape so frontend can detect "not yet created"
      res.json(null);
      return;
    }

    res.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/profile — upsert candidate profile
router.put("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = upsertProfileSchema.parse(req.body);

    // Normalise empty strings to null for URL fields
    const linkedinUrl = data.linkedinUrl || null;
    const githubUrl = data.githubUrl || null;
    const portfolioUrl = data.portfolioUrl || null;

    const profile = await prisma.candidateProfile.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        ...data,
        linkedinUrl,
        githubUrl,
        portfolioUrl,
        skills: data.skills ?? [],
        targetRoles: data.targetRoles ?? [],
        targetCountries: data.targetCountries ?? [],
      },
      update: {
        ...data,
        linkedinUrl,
        githubUrl,
        portfolioUrl,
        ...(data.skills !== undefined && { skills: data.skills }),
        ...(data.targetRoles !== undefined && { targetRoles: data.targetRoles }),
        ...(data.targetCountries !== undefined && { targetCountries: data.targetCountries }),
      },
      include: {
        resumes: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    res.json(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Upsert profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/profile/resumes — list resumes for own profile
router.get("/resumes", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!profile) {
      res.json([]);
      return;
    }

    const resumes = await prisma.resume.findMany({
      where: { profileId: profile.id },
      orderBy: { uploadedAt: "desc" },
    });

    res.json(resumes);
  } catch (error) {
    console.error("List resumes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/profile/resumes — register a resume after S3 upload
// The actual file upload goes to S3 via presigned URL (Track C).
// This endpoint records the metadata in the DB.
router.post("/resumes", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = resumeMetadataSchema.parse(req.body);

    // Ensure the s3Key is scoped to this user to prevent cross-user tampering
    const expectedPrefix = `resumes/${req.user!.userId}/`;
    if (!data.s3Key.startsWith(expectedPrefix)) {
      res.status(400).json({ error: "Invalid s3Key — must be scoped to your user ID" });
      return;
    }

    // Upsert profile if not yet created (creates a minimal profile shell)
    const profile = await prisma.candidateProfile.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        skills: [],
        targetRoles: [],
        targetCountries: [],
      },
      update: {},
      select: { id: true },
    });

    // If setActive, deactivate all other resumes first
    if (data.setActive) {
      await prisma.resume.updateMany({
        where: { profileId: profile.id, isActive: true },
        data: { isActive: false },
      });
    }

    const resume = await prisma.resume.create({
      data: {
        profileId: profile.id,
        s3Key: data.s3Key,
        fileName: data.fileName,
        isActive: data.setActive,
      },
    });

    res.status(201).json(resume);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Create resume error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
