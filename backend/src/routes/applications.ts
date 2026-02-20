import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role } from "@prisma/client";

const router = Router();

// Parse allowed CV domains from env (empty = any HTTPS accepted)
const ALLOWED_CV_DOMAINS = process.env.ALLOWED_CV_DOMAINS
  ? process.env.ALLOWED_CV_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean)
  : [];

function validateCvUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (ALLOWED_CV_DOMAINS.length > 0) {
      return ALLOWED_CV_DOMAINS.some((domain) => parsed.hostname.endsWith(domain));
    }
    return true;
  } catch {
    return false;
  }
}

const applySchema = z.object({
  jobId: z.string().uuid(),
  cvUrl: z
    .string()
    .url()
    .refine(validateCvUrl, {
      message: ALLOWED_CV_DOMAINS.length > 0
        ? `CV URL must use HTTPS and be from an allowed domain: ${ALLOWED_CV_DOMAINS.join(", ")}`
        : "CV URL must use HTTPS",
    })
    .optional(),
  coverLetter: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["REVIEWING", "SHORTLISTED", "REJECTED", "ACCEPTED"]),
  notes: z.string().optional(),
});

// POST /api/applications - Candidate: apply to job
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const data = applySchema.parse(req.body);

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
      res.status(400).json({ error: "You have already applied to this job" });
      return;
    }

    const application = await prisma.application.create({
      data: {
        jobId: data.jobId,
        candidateId: req.user!.userId,
        cvUrl: data.cvUrl,
        coverLetter: data.coverLetter,
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
    console.error("Apply error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/my - Candidate: list own applications
router.get("/my", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const applications = await prisma.application.findMany({
      where: { candidateId: req.user!.userId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            slug: true,
            location: true,
            type: true,
            employer: {
              select: { companyName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(applications);
  } catch (error) {
    console.error("My applications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/job/:jobId - Employer: list applications for a job
router.get("/job/:jobId", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    // Verify job belongs to employer
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, employerId: employer.id },
    });

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const applications = await prisma.application.findMany({
      where: { jobId: req.params.jobId },
      include: {
        candidate: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(applications);
  } catch (error) {
    console.error("Job applications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/applications/:id/status - Employer: update application status
router.put("/:id/status", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const data = updateStatusSchema.parse(req.body);

    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!employer) {
      res.status(400).json({ error: "Employer profile not found" });
      return;
    }

    // Verify application's job belongs to employer
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { job: true },
    });

    if (!application || application.job.employerId !== employer.id) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    const updatedApplication = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        status: data.status as ApplicationStatus,
        notes: data.notes,
      },
    });

    res.json(updatedApplication);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Update application status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/applications/:id - Get single application
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: {
        job: {
          include: {
            employer: {
              select: { companyName: true, id: true },
            },
          },
        },
        candidate: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!application) {
      res.status(404).json({ error: "Application not found" });
      return;
    }

    // Check authorization
    const isCandidate = req.user!.userId === application.candidateId;
    const isEmployer = req.user!.role === Role.EMPLOYER;
    const isAdmin = req.user!.role === Role.ADMIN;

    if (isEmployer) {
      const employer = await prisma.employer.findUnique({ where: { userId: req.user!.userId } });
      if (!employer || application.job.employerId !== employer.id) {
        res.status(403).json({ error: "Not authorized to view this application" });
        return;
      }
    }

    if (!isCandidate && !isEmployer && !isAdmin) {
      res.status(403).json({ error: "Not authorized to view this application" });
      return;
    }

    res.json(application);
  } catch (error) {
    console.error("Get application error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
