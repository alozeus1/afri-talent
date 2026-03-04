import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role } from "@prisma/client";

const router = Router();

const quickApplySchema = z.object({
  jobId: z.string().uuid(),
});

// POST /api/quick-apply — Quick apply to a job using profile data
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = quickApplySchema.parse(req.body);

    // Check job exists and is published
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
    });

    if (!job || job.status !== JobStatus.PUBLISHED) {
      res.status(404).json({ error: "Job not found or not available" });
      return;
    }

    // Check if already applied
    const existingApplication = await prisma.application.findFirst({
      where: {
        jobId: data.jobId,
        candidateId: req.user!.userId,
      },
    });

    if (existingApplication) {
      res.status(400).json({ error: "Already applied" });
      return;
    }

    // Pull candidate profile data
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      include: {
        resumes: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!profile) {
      res.status(400).json({ error: "Candidate profile not found. Please complete your profile first." });
      return;
    }

    // Use active resume's s3Key as cvUrl
    const activeResume = profile.resumes[0];
    const cvUrl = activeResume?.s3Key ?? null;

    // Build cover letter summary from profile
    const coverLetter = profile.headline
      ? `${profile.headline} | Skills: ${profile.skills.join(", ")}`
      : undefined;

    const application = await prisma.application.create({
      data: {
        jobId: data.jobId,
        candidateId: req.user!.userId,
        cvUrl,
        coverLetter,
        status: ApplicationStatus.PENDING,
      },
      include: {
        job: {
          select: { title: true, slug: true },
        },
      },
    });

    res.status(201).json(application);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Quick apply error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/quick-apply/eligible/:jobId — Check if candidate can quick-apply
router.get("/eligible/:jobId", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Check job exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== JobStatus.PUBLISHED) {
      res.status(404).json({ error: "Job not found or not available" });
      return;
    }

    // Check if already applied
    const existingApplication = await prisma.application.findFirst({
      where: {
        jobId,
        candidateId: req.user!.userId,
      },
    });

    if (existingApplication) {
      res.json({
        eligible: false,
        reason: "Already applied to this job",
        profileCompleteness: 0,
        hasActiveResume: false,
      });
      return;
    }

    // Get candidate profile
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      include: {
        resumes: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!profile) {
      res.json({
        eligible: false,
        reason: "No candidate profile found",
        profileCompleteness: 0,
        hasActiveResume: false,
      });
      return;
    }

    const hasActiveResume = profile.resumes.length > 0;
    const profileCompleteness = profile.profileCompleteness;

    // Require at least some profile completeness and an active resume
    const eligible = profileCompleteness >= 30 && hasActiveResume;
    const reason = !hasActiveResume
      ? "No active resume uploaded"
      : profileCompleteness < 30
        ? "Profile completeness must be at least 30%"
        : undefined;

    res.json({
      eligible,
      reason,
      profileCompleteness,
      hasActiveResume,
    });
  } catch (error) {
    console.error("Quick apply eligibility error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
