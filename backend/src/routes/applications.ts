import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize, requireVerifiedEmail } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role, TrustEntityType, TrustRiskLevel } from "@prisma/client";
import { createUserNotification } from "../lib/notifications.js";
import { requireAccountStanding } from "../middleware/account-standing.js";
import { assessApplicationRisk } from "../lib/trust/risk.js";
import {
  addTrustCaseAction,
  createTrustCase,
  recordTrustRiskEvent,
  refreshCandidateTrustProfile,
} from "../lib/trust/service.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import {
  maybeCreateAtsApplicationLink,
  syncApplicationStatusToAts,
} from "../lib/ats/service.js";

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
router.post(
  "/",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding(),
  requireVerifiedEmail({ roles: [Role.CANDIDATE] }),
  async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const data = applySchema.parse(req.body);

    // Check job exists and is published
    const job = await prisma.job.findUnique({
      where: { id: data.jobId },
    });

    if (!job || job.status !== JobStatus.PUBLISHED || job.isExpired) {
      recordOpsEvent({
        metricName: "application_submission_failure",
        category: "applications",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "job_not_available",
        },
      });
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
      recordOpsEvent({
        metricName: "application_submission_failure",
        category: "applications",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "duplicate_application",
        },
      });
      res.status(400).json({ error: "You have already applied to this job" });
      return;
    }

    const [trustProfile, applicationsLast24h] = await Promise.all([
      refreshCandidateTrustProfile(req.user!.userId),
      prisma.application.count({
        where: {
          candidateId: req.user!.userId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const applicationRisk = assessApplicationRisk({
      coverLetter: data.coverLetter ?? null,
      applicationsLast24h,
      candidateRiskScore: trustProfile.riskScore,
    });
    const heldForReview =
      applicationRisk.autoHold ||
      applicationRisk.level === TrustRiskLevel.HIGH ||
      applicationRisk.level === TrustRiskLevel.CRITICAL;

    const application = await prisma.application.create({
      data: {
        jobId: data.jobId,
        candidateId: req.user!.userId,
        cvUrl: data.cvUrl,
        coverLetter: data.coverLetter,
        status: ApplicationStatus.PENDING,
        riskScore: applicationRisk.score,
        riskLevel: applicationRisk.level,
        trustFlags: applicationRisk.flags,
      },
      include: {
        job: {
          select: { title: true, slug: true },
        },
      },
    });

    await maybeCreateAtsApplicationLink(application.id);

    if (applicationRisk.score > 0) {
      await recordTrustRiskEvent({
        entityType: TrustEntityType.APPLICATION,
        reasonCode: "application_risk_assessment",
        summary: `Application for "${job.title}" triggered trust checks.`,
        scoreDelta: applicationRisk.score,
        resultingScore: applicationRisk.score,
        riskLevel: applicationRisk.level,
        userId: req.user!.userId,
        employerId: job.employerId ?? null,
        jobId: job.id,
        applicationId: application.id,
        evidence: {
          flags: applicationRisk.flags,
        },
        autoHeld: heldForReview,
      });
    }

    if (heldForReview) {
      const trustCase = await createTrustCase({
        entityType: TrustEntityType.APPLICATION,
        priority: applicationRisk.level,
        title: `Application review required for ${job.title}`,
        reasonCode: "application_auto_hold",
        summary: `Application held because of ${applicationRisk.flags.join(", ") || "elevated candidate risk"}.`,
        applicationId: application.id,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "HOLD",
        reasonCode: "application_auto_hold",
        notes: "Application automatically held for trust review before employer visibility.",
        metadata: {
          flags: applicationRisk.flags,
        },
      });
    }

    if (job.employerId && !heldForReview) {
      const employer = await prisma.employer.findUnique({
        where: { id: job.employerId },
        select: { userId: true },
      });

      if (employer?.userId) {
        await createUserNotification({
          userId: employer.userId,
          type: "APPLICATION_STATUS",
          title: "New job application received",
          body: `A candidate applied for ${job.title}.`,
          channel: "applicationUpdates",
          metadata: { applicationId: application.id, jobId: job.id },
        });
      }
    }

    res.status(201).json({
      ...application,
      heldForReview,
    });
    recordOpsEvent({
      metricName: heldForReview ? "application_submission_held" : "application_submission_success",
      category: "applications",
      outcome: heldForReview ? "held" : "success",
      severity: heldForReview ? "warning" : "info",
      durationMs: Date.now() - startedAt,
      details: {
        risk_level: applicationRisk.level,
        applications_last_24h: applicationsLast24h,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      recordOpsEvent({
        metricName: "application_submission_failure",
        category: "applications",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: {
          reason: "validation_failed",
        },
      });
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Apply error:", error);
    recordOpsEvent({
      metricName: "application_submission_failure",
      category: "applications",
      outcome: "failure",
      severity: "critical",
      durationMs: Date.now() - startedAt,
      details: {
        reason: "internal_error",
      },
    });
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
      where: {
        jobId: req.params.jobId,
        riskLevel: {
          notIn: [TrustRiskLevel.HIGH, TrustRiskLevel.CRITICAL],
        },
      },
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

    const atsSync = await syncApplicationStatusToAts({
      applicationId: updatedApplication.id,
      actorUserId: req.user!.userId,
      correlationId: req.requestId ?? null,
    }).catch((syncError) => ({
      outcome: "failed",
      message: syncError instanceof Error ? syncError.message : "ATS stage sync failed",
    }));

    await createUserNotification({
      userId: application.candidateId,
      type: "APPLICATION_STATUS",
      title: "Application status updated",
      body: `Your application for ${application.job.title} is now ${data.status.toLowerCase()}.`,
      channel: "applicationUpdates",
      metadata: {
        applicationId: updatedApplication.id,
        jobId: application.jobId,
        status: data.status,
      },
    });

    res.json({
      ...updatedApplication,
      atsSync,
    });
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
