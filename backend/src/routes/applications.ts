import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize, requireVerifiedEmail } from "../middleware/auth.js";
import {
  ApplicationStatus,
  JobStatus,
  Role,
  SubmissionProofKind,
  SubmissionStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TrustEntityType,
  TrustRiskLevel,
} from "@prisma/client";
import {
  REQUIRED_ACKNOWLEDGEMENTS,
  gateSubmit,
  validateAcknowledgements,
} from "../lib/apply/state-machine.js";
import { dispatchApply } from "../lib/apply/dispatch.js";
import { dispatch as dispatchNotification } from "../lib/notifications/dispatcher.js";
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
        select: {
          userId: true,
          companyName: true,
          user: { select: { email: true, name: true } },
        },
      });

      if (employer?.userId && employer.user) {
        const candidate = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { name: true },
        });
        const appBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com";
        void dispatchNotification({
          kind: "NEW_APPLICATION",
          employer: {
            userId: employer.userId,
            email: employer.user.email,
            name: employer.user.name || employer.companyName,
          },
          candidateName: candidate?.name ?? "A candidate",
          jobTitle: job.title,
          jobId: job.id,
          applicationId: application.id,
          applicationUrl: `${appBaseUrl}/employer/applications/${application.id}`,
        }).catch(() => undefined);
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

    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.user!.userId },
      select: { plan: true, status: true },
    }).catch(() => null);
    const canViewFullCandidates =
      subscription?.status === SubscriptionStatus.ACTIVE &&
      (subscription.plan === SubscriptionPlan.EMPLOYER_BASIC || subscription.plan === SubscriptionPlan.EMPLOYER_PREMIUM);

    if (!canViewFullCandidates) {
      res.json(
        applications.map((application, index) => ({
          ...application,
          cvUrl: null,
          coverLetter: null,
          candidate: {
            id: application.candidate.id,
            name: `Candidate ${index + 1}`,
            email: "Upgrade to unlock candidate contact details",
          },
          locked: true,
          upgradeRequired: true,
        })),
      );
      return;
    }

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
      include: {
        job: { include: { employer: { select: { companyName: true } } } },
        candidate: { select: { id: true, email: true, name: true } },
      },
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

    const appBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com";
    await dispatchNotification({
      kind: "APPLICATION_STATUS_CHANGED",
      candidate: {
        id: application.candidate.id,
        email: application.candidate.email,
        name: application.candidate.name,
      },
      jobTitle: application.job.title,
      companyName: application.job.employer?.companyName ?? "Employer",
      status: data.status,
      jobUrl: `${appBaseUrl}/candidate/applications/${updatedApplication.id}`,
      applicationId: updatedApplication.id,
      jobId: application.jobId,
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

// ─────────────────────────────────────────────────────────────────────────────
// §5.7 — apply pathway consent gate (Draft → Preview → Submit).
//
// Three new endpoints replace the single confirm:true flag with an explicit
// state machine. Each track (PR Q/R/S/T) plugs into the dispatcher in
// lib/apply/dispatch.ts — this PR ships the gate + the ASSISTED_REDIRECT
// branch, the rest stub-fail to FAILED with a forward-pointer.
// ─────────────────────────────────────────────────────────────────────────────

const draftSchema = z.object({
  jobId: z.string().uuid(),
  cvUrl: z.string().url().refine(validateCvUrl).optional(),
  coverLetter: z.string().optional(),
});

const submitSchema = z.object({
  acknowledgements: z.array(z.string()).min(REQUIRED_ACKNOWLEDGEMENTS.length),
});

// POST /api/applications/draft — create the Application in DRAFTING and
// surface the rendered content for the candidate's preview screen.
router.post(
  "/draft",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding(),
  requireVerifiedEmail({ roles: [Role.CANDIDATE] }),
  async (req: Request, res: Response) => {
    try {
      const data = draftSchema.parse(req.body);

      const job = await prisma.job.findUnique({ where: { id: data.jobId } });
      if (!job || job.status !== JobStatus.PUBLISHED || job.isExpired) {
        res.status(404).json({ error: "Job not found or not available" });
        return;
      }

      const existing = await prisma.application.findFirst({
        where: { jobId: data.jobId, candidateId: req.user!.userId },
      });
      if (existing) {
        // Re-open the existing draft so the candidate can preview/submit it
        // instead of creating a sibling row that would violate the
        // (jobId, candidateId) unique constraint.
        if (existing.submissionStatus === SubmissionStatus.SUBMITTED) {
          res.status(409).json({
            error: "Already submitted",
            code: "ALREADY_SUBMITTED",
            applicationId: existing.id,
          });
          return;
        }
        res.status(200).json({
          applicationId: existing.id,
          submissionStatus: existing.submissionStatus,
          preview: {
            jobId: existing.jobId,
            cvUrl: data.cvUrl ?? existing.cvUrl,
            coverLetter: data.coverLetter ?? existing.coverLetter,
            applyStrategy: job.applyStrategy,
            applyFormDomain: job.applyFormDomain,
            applyEmailDetected: job.applyEmailDetected,
            requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
          },
          reused: true,
        });
        return;
      }

      const application = await prisma.application.create({
        data: {
          jobId: data.jobId,
          candidateId: req.user!.userId,
          cvUrl: data.cvUrl,
          coverLetter: data.coverLetter,
          status: ApplicationStatus.PENDING,
          submissionStatus: SubmissionStatus.DRAFTING,
        },
      });

      recordOpsEvent({
        metricName: "apply_pathway_draft",
        category: "applications",
        outcome: "success",
        severity: "info",
        details: { applicationId: application.id, applyStrategy: job.applyStrategy ?? "unset" },
      });

      res.status(201).json({
        applicationId: application.id,
        submissionStatus: application.submissionStatus,
        preview: {
          jobId: job.id,
          cvUrl: application.cvUrl,
          coverLetter: application.coverLetter,
          applyStrategy: job.applyStrategy,
          applyFormDomain: job.applyFormDomain,
          applyEmailDetected: job.applyEmailDetected,
          requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid draft payload", details: error.issues });
        return;
      }
      console.error("Draft error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/applications/:id/preview — read-only view of the draft so the
// candidate's preview screen can refresh without a POST.
router.get(
  "/:id/preview",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response) => {
    try {
      const application = await prisma.application.findUnique({
        where: { id: req.params.id },
        include: { job: { select: { id: true, applyStrategy: true, applyFormDomain: true, applyEmailDetected: true, title: true, sourceName: true } } },
      });
      if (!application || application.candidateId !== req.user!.userId) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      res.json({
        applicationId: application.id,
        submissionStatus: application.submissionStatus,
        submittedAt: application.submittedAt,
        submissionAttempts: application.submissionAttempts,
        lastSubmissionError: application.lastSubmissionError,
        preview: {
          jobId: application.job.id,
          jobTitle: application.job.title,
          company: application.job.sourceName,
          cvUrl: application.cvUrl,
          coverLetter: application.coverLetter,
          applyStrategy: application.job.applyStrategy,
          applyFormDomain: application.job.applyFormDomain,
          applyEmailDetected: application.job.applyEmailDetected,
          requiredAcknowledgements: REQUIRED_ACKNOWLEDGEMENTS,
        },
      });
    } catch (error) {
      console.error("Preview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/applications/:id/submit — commit: validate ack, move state,
// dispatch to the per-track handler, settle.
router.post(
  "/:id/submit",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid submit payload", details: parsed.error.issues });
        return;
      }
      const ack = validateAcknowledgements(parsed.data.acknowledgements);
      if (!ack.ok) {
        res.status(400).json({
          error: "Acknowledgements required",
          code: "ACKNOWLEDGEMENTS_REQUIRED",
          missing: ack.missing,
          required: REQUIRED_ACKNOWLEDGEMENTS,
        });
        return;
      }

      const application = await prisma.application.findUnique({
        where: { id: req.params.id },
        include: {
          job: {
            select: {
              id: true,
              applyStrategy: true,
              applyEmailDetected: true,
              applyFormDomain: true,
              sourceUrl: true,
              applicationUrl: true,
            },
          },
        },
      });
      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }
      if (application.candidateId !== req.user!.userId) {
        res.status(403).json({ error: "Not authorised for this application" });
        return;
      }

      const gate = gateSubmit(application.submissionStatus);
      if (!gate.ok) {
        res.status(409).json({
          error: "Cannot submit in current state",
          code: gate.reason,
          submissionStatus: application.submissionStatus,
        });
        return;
      }

      // Move to SUBMITTING + bump attempts. The dispatcher runs INSIDE this
      // state so concurrent submits short-circuit on the gateSubmit check.
      const submitting = await prisma.application.update({
        where: { id: application.id },
        data: {
          submissionStatus: SubmissionStatus.SUBMITTING,
          submissionAttempts: { increment: 1 },
          lastSubmissionError: null,
        },
      });

      // applyStrategy may still be null for pre-PR-O rows that haven't been
      // backfilled; the dispatcher's ?? "ASSISTED_REDIRECT" below keeps the
      // candidate moving.
      const result = await dispatchApply({
        applicationId: submitting.id,
        applyStrategy: application.job.applyStrategy ?? "ASSISTED_REDIRECT",
        applyEmailDetected: application.job.applyEmailDetected,
        applyFormDomain: application.job.applyFormDomain,
        sourceUrl: application.job.sourceUrl,
        applicationUrl: application.job.applicationUrl,
      });

      if (result.ok) {
        const settled = await prisma.application.update({
          where: { id: submitting.id },
          data: {
            submissionStatus: SubmissionStatus.SUBMITTED,
            submittedAt: new Date(),
            submissionProofKind: result.proofKind,
            submissionProofRef: result.proofRef,
            submissionProvider: result.provider ?? null,
            submissionProviderApplicationId: result.providerApplicationId ?? null,
            lastSubmissionError: null,
          },
        });
        recordOpsEvent({
          metricName: "apply_pathway_submit",
          category: "applications",
          outcome: "success",
          severity: "info",
          durationMs: Date.now() - startedAt,
          details: {
            applicationId: settled.id,
            applyStrategy: application.job.applyStrategy,
            proofKind: result.proofKind,
          },
        });
        res.status(200).json({
          applicationId: settled.id,
          submissionStatus: settled.submissionStatus,
          submittedAt: settled.submittedAt,
          submissionProofKind: settled.submissionProofKind,
        });
        return;
      }

      const failed = await prisma.application.update({
        where: { id: submitting.id },
        data: {
          submissionStatus: SubmissionStatus.FAILED,
          lastSubmissionError: result.error,
        },
      });
      recordOpsEvent({
        metricName: "apply_pathway_submit",
        category: "applications",
        outcome: "failure",
        severity: "warning",
        durationMs: Date.now() - startedAt,
        details: { applicationId: failed.id, error: result.error, applyStrategy: application.job.applyStrategy ?? "unset" },
      });
      res.status(202).json({
        applicationId: failed.id,
        submissionStatus: failed.submissionStatus,
        lastSubmissionError: failed.lastSubmissionError,
      });
    } catch (error) {
      console.error("Submit error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
