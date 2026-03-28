import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize, requireVerifiedEmail } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role } from "@prisma/client";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";

const router = Router();

const quickApplySchema = z.object({
  jobId: z.string().uuid(),
});

// POST /api/quick-apply — Quick apply to a job using profile data
router.post(
  "/",
  authenticate,
  authorize(Role.CANDIDATE),
  requireVerifiedEmail({ roles: [Role.CANDIDATE] }),
  async (req: Request, res: Response) => {
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

    // Generate AI-powered cover letter specific to this job
    const companyName =
      job.employerId
        ? (await prisma.employer.findUnique({ where: { id: job.employerId }, select: { companyName: true } }))?.companyName ?? job.sourceName ?? "the company"
        : job.sourceName ?? "the company";

    let coverLetter: string | undefined;
    try {
      const clResult = await generateQuickCoverLetter({
        candidateName: (await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } }))?.name ?? "Candidate",
        headline: profile.headline,
        skills: profile.skills,
        bio: profile.bio,
        yearsExperience: profile.yearsExperience,
        jobTitle: job.title,
        companyName,
        jobDescription: job.description,
      });
      coverLetter = clResult.coverLetter;
      logger.info({ jobId: data.jobId, source: clResult.source }, "[quick-apply] cover letter generated");
    } catch (err) {
      logger.warn({ err }, "[quick-apply] cover letter generation failed, applying without");
      coverLetter = profile.headline
        ? `${profile.headline} | Skills: ${profile.skills.join(", ")}`
        : undefined;
    }

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
