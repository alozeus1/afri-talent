import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize, requireVerifiedEmail } from "../middleware/auth.js";
import { ApplicationStatus, JobStatus, Role, type Job } from "@prisma/client";
import { generateQuickCoverLetter } from "../lib/ai/cover-letter.js";
import { computeProfileCompleteness } from "../lib/profile-completeness.js";
import { requireAccountStanding } from "../middleware/account-standing.js";
import {
  SubmitGuardError,
  assertCanSubmitApplication,
  assessSubmissionRisk,
  recordSubmissionTrust,
  riskFieldsFor,
} from "../lib/apply/submit-guard.js";

const router = Router();

const quickApplySchema = z.object({
  jobId: z.string().uuid(),
  /**
   * Explicit consent that the candidate has reviewed the application
   * content (cover letter + CV) and wants to submit it on their behalf.
   * Must be `true`. Missing or false returns 400 / CONSENT_REQUIRED.
   */
  confirm: z.literal(true, "Consent required: set confirm=true to submit."),
  /**
   * The cover letter the candidate reviewed (and possibly edited) in the
   * preview step. When present it is stored verbatim instead of drafting a
   * fresh one, so the employer sees exactly what the candidate approved.
   */
  coverLetter: z.string().trim().min(1).max(5000).optional(),
});

const previewSchema = z.object({
  jobId: z.string().uuid(),
});

type QuickApplyResume = { id: string; name: string } | null;

/**
 * Loads the candidate profile and works out which resume will be attached.
 * Prefers the active uploaded resume (cvUrl = its S3 key); falls back to the
 * resume-builder document (no cvUrl, employers read its text via
 * GET /api/applications/:id/cv).
 */
async function loadApplicantContext(userId: string) {
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    include: {
      // Only scanner-cleared uploads may be attached (fail-closed on
      // PENDING_SCAN / QUARANTINED / REJECTED).
      resumes: {
        where: { isActive: true, securityStatus: "CLEAN" },
        take: 1,
      },
    },
  });
  if (!profile) return null;

  const activeResume = profile.resumes[0];
  let resume: QuickApplyResume = null;
  let cvUrl: string | null = null;
  if (activeResume) {
    resume = { id: activeResume.id, name: activeResume.fileName };
    cvUrl = activeResume.s3Key;
  } else {
    const builtResume = await prisma.userResume.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (builtResume) {
      resume = { id: builtResume.id, name: "AfriTalent resume (resume builder)" };
    }
  }
  return { profile, resume, cvUrl };
}

type ApplicantContext = NonNullable<Awaited<ReturnType<typeof loadApplicantContext>>>;

async function draftCoverLetter(
  userId: string,
  job: Job,
  profile: ApplicantContext["profile"],
): Promise<string | undefined> {
  const companyName =
    job.employerId
      ? (await prisma.employer.findUnique({ where: { id: job.employerId }, select: { companyName: true } }))?.companyName ?? job.sourceName ?? "the company"
      : job.sourceName ?? "the company";

  try {
    const clResult = await generateQuickCoverLetter({
      candidateName: (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? "Candidate",
      headline: profile.headline,
      skills: profile.skills,
      bio: profile.bio,
      yearsExperience: profile.yearsExperience,
      jobTitle: job.title,
      companyName,
      jobDescription: job.description,
    });
    logger.info({ jobId: job.id, source: clResult.source }, "[quick-apply] cover letter generated");
    return clResult.coverLetter;
  } catch (err) {
    logger.warn({ err }, "[quick-apply] cover letter generation failed, applying without");
    return profile.headline
      ? `${profile.headline}${profile.skills.length ? ` | Skills: ${profile.skills.join(", ")}` : ""}`
      : undefined;
  }
}

// POST /api/quick-apply/preview — draft the cover letter and show which
// resume will be attached, without creating an application. Same guards as
// submit so the candidate never reviews something they cannot send.
router.post(
  "/preview",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding(),
  requireVerifiedEmail({ roles: [Role.CANDIDATE] }),
  async (req: Request, res: Response) => {
    try {
      const data = previewSchema.parse(req.body);
      const guard = await assertCanSubmitApplication({ userId: req.user!.userId, jobId: data.jobId });
      const context = await loadApplicantContext(req.user!.userId);
      if (!context) {
        res.status(400).json({ error: "Candidate profile not found. Please complete your profile first." });
        return;
      }
      const coverLetter = await draftCoverLetter(req.user!.userId, guard.job, context.profile);
      res.json({ coverLetter: coverLetter ?? "", resume: context.resume });
    } catch (error) {
      if (error instanceof SubmitGuardError) {
        res.status(error.httpStatus).json(error.toJSON());
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.issues });
        return;
      }
      logger.error({ err: error }, "[quick-apply] preview failed");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/quick-apply — Quick apply to a job using profile data
router.post(
  "/",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding(),
  requireVerifiedEmail({ roles: [Role.CANDIDATE] }),
  async (req: Request, res: Response) => {
  try {
    const data = quickApplySchema.parse(req.body);

    // Shared guard: job published + not expired, dedupe, apply caps, daily
    // cap, verified email and account standing. Runs before any AI spend.
    const guard = await assertCanSubmitApplication({ userId: req.user!.userId, jobId: data.jobId });
    const job = guard.job;

    const context = await loadApplicantContext(req.user!.userId);
    if (!context) {
      res.status(400).json({ error: "Candidate profile not found. Please complete your profile first." });
      return;
    }
    const { cvUrl } = context;

    // Use the letter the candidate reviewed in the preview step; only draft
    // one here for older clients that submit without previewing.
    const coverLetter =
      data.coverLetter ?? (await draftCoverLetter(req.user!.userId, job, context.profile));

    const risk = assessSubmissionRisk(guard, coverLetter);
    const application = await prisma.application.create({
      data: {
        jobId: data.jobId,
        candidateId: req.user!.userId,
        cvUrl,
        coverLetter,
        notes: "[Quick Apply]",
        status: ApplicationStatus.PENDING,
        ...riskFieldsFor(risk),
      },
      include: {
        job: {
          select: { title: true, slug: true },
        },
      },
    });
    await recordSubmissionTrust({
      userId: req.user!.userId,
      job,
      applicationId: application.id,
      risk,
    });

    res.status(201).json({ ...application, heldForReview: risk.heldForReview });
  } catch (error) {
    if (error instanceof SubmitGuardError) {
      res.status(error.httpStatus).json(error.toJSON());
      return;
    }
    if (error instanceof z.ZodError) {
      const consentIssue = error.issues.find(
        (i) => Array.isArray(i.path) && i.path.includes("confirm")
      );
      if (consentIssue) {
        res.status(400).json({
          error:
            "Explicit consent is required before AfriTalent submits an application on your behalf.",
          code: "CONSENT_REQUIRED",
        });
        return;
      }
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

    const context = await loadApplicantContext(req.user!.userId);

    if (!context) {
      res.json({
        eligible: false,
        reason: "No candidate profile found",
        profileCompleteness: 0,
        hasActiveResume: false,
      });
      return;
    }

    // An attached resume is recommended but optional: candidates without one
    // can still apply with their profile and a reviewed cover letter (the
    // modal prompts them to upload or build a resume first).
    const hasActiveResume = context.resume !== null;
    // The stored score is only refreshed on profile saves, so seeded or
    // imported profiles can read 0 while being complete. Use the live score.
    const profileCompleteness = Math.max(
      context.profile.profileCompleteness ?? 0,
      computeProfileCompleteness({ ...context.profile, resumes: context.profile.resumes ?? [] }),
    );
    const eligible = profileCompleteness >= 30;
    const reason = eligible ? undefined : "Profile completeness must be at least 30%";

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
