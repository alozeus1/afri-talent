import crypto from "crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  AbuseReportReason,
  AssessmentStatus,
  CandidateSkillVerificationMethod,
  CandidateSkillVerificationStatus,
  Prisma,
  Role,
  TrustEntityType,
  TrustRiskLevel,
  VerificationArtifactType,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireAccountStanding } from "../middleware/account-standing.js";
import {
  addTrustCaseAction,
  candidateTrustSummary,
  createTrustCase,
  employerTrustSummary,
  ensureCandidateTrustProfile,
  ensureEmployerTrustProfile,
  recordTrustRiskEvent,
  refreshCandidateTrustProfile,
  refreshEmployerTrustProfile,
  scoreDeltaForReport,
  trustPriorityForReport,
} from "../lib/trust/service.js";
import { assessContentRisk, riskLevelForScore } from "../lib/trust/risk.js";
import { createUserNotification } from "../lib/notifications.js";

const router = Router();

const phoneNumberSchema = z
  .string()
  .trim()
  .min(8)
  .max(20)
  .regex(/^\+?[1-9][0-9]{7,14}$/, "Enter a valid international phone number.");

const employerProfileSchema = z.object({
  website: z.string().trim().max(500).optional().or(z.literal("")),
  linkedInCompanyUrl: z.string().trim().max(500).optional().or(z.literal("")),
});

const employerArtifactSchema = z.object({
  type: z.enum([
    VerificationArtifactType.BUSINESS_REGISTRATION,
    VerificationArtifactType.DOMAIN_OWNERSHIP,
    VerificationArtifactType.LINKEDIN_COMPANY,
  ]),
  fileKey: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(255).optional(),
  externalUrl: z.string().trim().url().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const candidateArtifactSchema = z.object({
  type: z.enum([
    VerificationArtifactType.IDENTITY_DOCUMENT,
    VerificationArtifactType.CERTIFICATION,
    VerificationArtifactType.EMPLOYMENT_PROOF,
  ]),
  fileKey: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(255).optional(),
  externalUrl: z.string().trim().url().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const candidateSkillVerificationSchema = z
  .object({
    skillName: z.string().trim().min(2).max(120),
    method: z.enum([
      CandidateSkillVerificationMethod.CERTIFICATE,
      CandidateSkillVerificationMethod.PORTFOLIO,
      CandidateSkillVerificationMethod.ASSESSMENT,
    ]),
    evidenceLabel: z.string().trim().max(200).optional(),
    fileKey: z.string().trim().max(500).optional(),
    fileName: z.string().trim().max(255).optional(),
    externalUrl: z.string().trim().url().max(500).optional(),
    assessmentId: z.string().uuid().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === CandidateSkillVerificationMethod.CERTIFICATE && !value.fileKey && !value.externalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fileKey"],
        message: "Upload a certificate or provide a public credential URL.",
      });
    }

    if (value.method === CandidateSkillVerificationMethod.PORTFOLIO && !value.externalUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["externalUrl"],
        message: "Add a public portfolio, GitHub, or work sample link.",
      });
    }
  });

const phoneOtpRequestSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

const phoneOtpVerifySchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

const reportSchema = z
  .object({
    reason: z.nativeEnum(AbuseReportReason),
    details: z.string().trim().max(4000).optional(),
    reportedUserId: z.string().uuid().optional(),
    employerId: z.string().uuid().optional(),
    targetJobId: z.string().uuid().optional(),
    targetApplicationId: z.string().uuid().optional(),
    targetThreadId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.reportedUserId ||
          value.employerId ||
          value.targetJobId ||
          value.targetApplicationId ||
          value.targetThreadId,
      ),
    {
      message: "Choose what you are reporting.",
      path: ["reason"],
    },
  );

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function mapArtifact(artifact: {
  id: string;
  type: VerificationArtifactType;
  status: string;
  fileName: string | null;
  externalUrl: string | null;
  reviewerNotes: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: artifact.id,
    type: artifact.type,
    status: artifact.status,
    fileName: artifact.fileName,
    externalUrl: artifact.externalUrl,
    reviewerNotes: artifact.reviewerNotes,
    submittedAt: artifact.submittedAt,
    reviewedAt: artifact.reviewedAt,
  };
}

function mapVerifiedSkill(skill: {
  id: string;
  skillName: string;
  method: CandidateSkillVerificationMethod;
  status: CandidateSkillVerificationStatus;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
  score: number | null;
  confidenceNote: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  partner?: {
    id: string;
    name: string;
    organizationType: string;
  } | null;
}) {
  return {
    id: skill.id,
    skillName: skill.skillName,
    method: skill.method,
    status: skill.status,
    evidenceLabel: skill.evidenceLabel,
    evidenceUrl: skill.evidenceUrl,
    score: skill.score,
    confidenceNote: skill.confidenceNote,
    verifiedAt: skill.verifiedAt,
    createdAt: skill.createdAt,
    partner: skill.partner
      ? {
        id: skill.partner.id,
        name: skill.partner.name,
        organizationType: skill.partner.organizationType,
      }
      : null,
  };
}

function mapPartnerMarker(marker: {
  id: string;
  markerType: string;
  status: string;
  label: string;
  description: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  partner: {
    id: string;
    name: string;
    country: string;
    organizationType: string;
  };
}) {
  return {
    id: marker.id,
    markerType: marker.markerType,
    status: marker.status,
    label: marker.label,
    description: marker.description,
    issuedAt: marker.issuedAt,
    expiresAt: marker.expiresAt,
    createdAt: marker.createdAt,
    partner: marker.partner,
  };
}

async function deliverPhoneOtp(phoneNumber: string, code: string): Promise<{ previewCode?: string }> {
  if (process.env.NODE_ENV === "production") {
    logger.warn(
      { phoneNumber },
      "Phone verification requested without an SMS provider configured. Integrate Twilio or a local SMS gateway before production rollout.",
    );
    return {};
  }

  logger.info({ phoneNumber, code }, "Phone verification OTP generated");
  return { previewCode: code };
}

function validationFailure(res: Response, error: z.ZodError) {
  res.status(400).json({ error: "Validation failed", details: error.issues });
}

router.get(
  "/employer/summary",
  authenticate,
  authorize(Role.EMPLOYER),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const employer = await prisma.employer.findUnique({
        where: { userId: req.user!.userId },
        include: {
          user: {
            select: {
              email: true,
              emailVerified: true,
            },
          },
          verificationArtifacts: {
            orderBy: { submittedAt: "desc" },
            take: 10,
          },
          trustProfile: true,
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              status: true,
              riskLevel: true,
              createdAt: true,
            },
          },
        },
      });

      if (!employer) {
        res.status(404).json({ error: "Employer profile not found" });
        return;
      }

      const trustProfile = await refreshEmployerTrustProfile(employer.id);

      res.json({
        employer: {
          id: employer.id,
          companyName: employer.companyName,
          website: employer.website,
          location: employer.location,
          bio: employer.bio,
          email: employer.user.email,
          emailVerified: employer.user.emailVerified,
        },
        trust: employerTrustSummary(trustProfile),
        linkedInCompanyUrl: trustProfile.linkedInCompanyUrl,
        artifacts: employer.verificationArtifacts.map(mapArtifact),
        recentJobs: employer.jobs,
      });
    } catch (error) {
      logger.error({ error }, "Employer trust summary error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.put(
  "/employer/profile",
  authenticate,
  authorize(Role.EMPLOYER),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = employerProfileSchema.parse(req.body);
      const employer = await prisma.employer.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });

      if (!employer) {
        res.status(404).json({ error: "Employer profile not found" });
        return;
      }

      await ensureEmployerTrustProfile(employer.id);

      await prisma.$transaction([
        prisma.employer.update({
          where: { id: employer.id },
          data: {
            website: data.website?.trim() ? data.website.trim() : null,
          },
        }),
        prisma.employerTrustProfile.update({
          where: { employerId: employer.id },
          data: {
            linkedInCompanyUrl: data.linkedInCompanyUrl?.trim()
              ? data.linkedInCompanyUrl.trim()
              : null,
          },
        }),
      ]);

      const trustProfile = await refreshEmployerTrustProfile(employer.id);
      res.json({
        trust: employerTrustSummary(trustProfile),
        linkedInCompanyUrl: trustProfile.linkedInCompanyUrl,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Employer trust profile update error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/employer/artifacts",
  authenticate,
  authorize(Role.EMPLOYER),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = employerArtifactSchema.parse(req.body);
      const employer = await prisma.employer.findUnique({
        where: { userId: req.user!.userId },
        include: { trustProfile: true },
      });

      if (!employer) {
        res.status(404).json({ error: "Employer profile not found" });
        return;
      }

      if (!data.fileKey && !data.externalUrl) {
        res.status(400).json({ error: "Upload a document or provide a supporting URL." });
        return;
      }

      const artifact = await prisma.verificationArtifact.create({
        data: {
          employerId: employer.id,
          type: data.type,
          fileKey: data.fileKey ?? null,
          fileName: data.fileName ?? null,
          externalUrl: data.externalUrl ?? null,
          metadata: data.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      const trustCase = await createTrustCase({
        entityType: TrustEntityType.EMPLOYER,
        priority: TrustRiskLevel.MEDIUM,
        title: `Employer verification review: ${data.type.replaceAll("_", " ").toLowerCase()}`,
        reasonCode: "verification_artifact_submitted",
        summary: `Employer ${employer.companyName} submitted ${data.type.toLowerCase()} evidence for review.`,
        employerTrustProfileId: employer.trustProfile?.id ?? null,
        artifactId: artifact.id,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "NOTE",
        reasonCode: "artifact_submitted",
        notes: "Employer submitted verification evidence for review.",
      });

      const trustProfile = await refreshEmployerTrustProfile(employer.id);
      res.status(201).json({
        artifact: mapArtifact(artifact),
        trust: employerTrustSummary(trustProfile),
        caseId: trustCase.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Employer artifact submission error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/candidate/summary",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const [candidateProfile, trustProfile, artifacts, skillVerifications, partnerMarkers, assessments] = await Promise.all([
        prisma.candidateProfile.findUnique({
          where: { userId: req.user!.userId },
          select: {
            headline: true,
            bio: true,
            skills: true,
            targetRoles: true,
            targetCountries: true,
            yearsExperience: true,
            visaStatus: true,
            openToWork: true,
            profileCompleteness: true,
            linkedinUrl: true,
            githubUrl: true,
            portfolioUrl: true,
            workHistory: true,
            educationHistory: true,
            certifications: true,
          },
        }),
        refreshCandidateTrustProfile(req.user!.userId),
        prisma.verificationArtifact.findMany({
          where: { userId: req.user!.userId },
          orderBy: { submittedAt: "desc" },
          take: 10,
        }),
        prisma.candidateVerifiedSkill.findMany({
          where: { userId: req.user!.userId },
          orderBy: [
            { status: "asc" },
            { verifiedAt: "desc" },
            { createdAt: "desc" },
          ],
          take: 20,
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                organizationType: true,
              },
            },
          },
        }),
        prisma.candidatePartnerMarker.findMany({
          where: { userId: req.user!.userId },
          orderBy: [
            { status: "asc" },
            { issuedAt: "desc" },
            { createdAt: "desc" },
          ],
          take: 20,
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                country: true,
                organizationType: true,
              },
            },
          },
        }),
        prisma.skillAssessment.findMany({
          where: { userId: req.user!.userId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            skillName: true,
            provider: true,
            status: true,
            score: true,
            level: true,
            percentile: true,
            resultUrl: true,
            completedAt: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
      ]);

      res.json({
        profile: candidateProfile,
        trust: candidateTrustSummary(trustProfile),
        artifacts: artifacts.map(mapArtifact),
        skillVerifications: skillVerifications.map(mapVerifiedSkill),
        partnerMarkers: partnerMarkers.map(mapPartnerMarker),
        assessments,
      });
    } catch (error) {
      logger.error({ error }, "Candidate trust summary error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/candidate/phone/request-otp",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = phoneOtpRequestSchema.parse(req.body);
      const trustProfile = await ensureCandidateTrustProfile(req.user!.userId);
      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.phoneVerificationChallenge.updateMany({
        where: {
          candidateTrustProfileId: trustProfile.id,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
        },
      });

      await prisma.phoneVerificationChallenge.create({
        data: {
          candidateTrustProfileId: trustProfile.id,
          phoneNumber: data.phoneNumber,
          otpHash: hashOtp(code),
          expiresAt,
        },
      });

      const delivery = await deliverPhoneOtp(data.phoneNumber, code);
      res.status(201).json({
        message: "Verification code created.",
        expiresAt,
        ...(delivery.previewCode ? { previewCode: delivery.previewCode } : {}),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Phone OTP request error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/candidate/phone/verify-otp",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = phoneOtpVerifySchema.parse(req.body);
      const trustProfile = await ensureCandidateTrustProfile(req.user!.userId);
      const challenge = await prisma.phoneVerificationChallenge.findFirst({
        where: {
          candidateTrustProfileId: trustProfile.id,
          phoneNumber: data.phoneNumber,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });

      if (!challenge) {
        res.status(404).json({ error: "No active verification code found for this phone number." });
        return;
      }

      if (challenge.expiresAt < new Date()) {
        await prisma.phoneVerificationChallenge.update({
          where: { id: challenge.id },
          data: { status: "EXPIRED" },
        });
        res.status(400).json({ error: "The verification code has expired. Request a new one." });
        return;
      }

      if (challenge.otpHash !== hashOtp(data.code)) {
        const attempts = challenge.attempts + 1;
        await prisma.phoneVerificationChallenge.update({
          where: { id: challenge.id },
          data: {
            attempts,
            status: attempts >= 5 ? "EXPIRED" : "PENDING",
          },
        });
        res.status(400).json({ error: "Incorrect verification code." });
        return;
      }

      await prisma.$transaction([
        prisma.phoneVerificationChallenge.update({
          where: { id: challenge.id },
          data: {
            status: "VERIFIED",
            verifiedAt: new Date(),
          },
        }),
        prisma.candidateTrustProfile.update({
          where: { userId: req.user!.userId },
          data: {
            phoneNumber: data.phoneNumber,
            phoneVerifiedAt: new Date(),
          },
        }),
      ]);

      const refreshedTrustProfile = await refreshCandidateTrustProfile(req.user!.userId);
      await createUserNotification({
        userId: req.user!.userId,
        type: "VERIFICATION",
        title: "Phone verified",
        body: "Your phone verification is complete. Employers will now see a stronger trust signal on your profile.",
        channel: "applicationUpdates",
      });

      res.json({
        message: "Phone number verified.",
        trust: candidateTrustSummary(refreshedTrustProfile),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Phone OTP verification error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/candidate/artifacts",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = candidateArtifactSchema.parse(req.body);
      await ensureCandidateTrustProfile(req.user!.userId);

      if (!data.fileKey && !data.externalUrl) {
        res.status(400).json({ error: "Upload a document or provide a supporting URL." });
        return;
      }

      const artifact = await prisma.verificationArtifact.create({
        data: {
          userId: req.user!.userId,
          type: data.type,
          fileKey: data.fileKey ?? null,
          fileName: data.fileName ?? null,
          externalUrl: data.externalUrl ?? null,
          metadata: data.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      const trustProfile = await prisma.candidateTrustProfile.findUnique({
        where: { userId: req.user!.userId },
        select: { id: true },
      });

      const trustCase = await createTrustCase({
        entityType: TrustEntityType.CANDIDATE,
        priority: TrustRiskLevel.MEDIUM,
        title: `Candidate verification review: ${data.type.replaceAll("_", " ").toLowerCase()}`,
        reasonCode: "verification_artifact_submitted",
        summary: `Candidate submitted ${data.type.toLowerCase()} evidence for review.`,
        candidateTrustProfileId: trustProfile?.id ?? null,
        artifactId: artifact.id,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "NOTE",
        reasonCode: "artifact_submitted",
        notes: "Candidate submitted verification evidence for review.",
      });

      const refreshedTrustProfile = await refreshCandidateTrustProfile(req.user!.userId);
      res.status(201).json({
        artifact: mapArtifact(artifact),
        trust: candidateTrustSummary(refreshedTrustProfile),
        caseId: trustCase.id,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Candidate artifact submission error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/candidate/skills",
  authenticate,
  authorize(Role.CANDIDATE),
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = candidateSkillVerificationSchema.parse(req.body);
      const [trustProfile, candidateProfile] = await Promise.all([
        ensureCandidateTrustProfile(req.user!.userId),
        prisma.candidateProfile.findUnique({
          where: { userId: req.user!.userId },
          select: {
            linkedinUrl: true,
            githubUrl: true,
            portfolioUrl: true,
          },
        }),
      ]);

      let artifactId: string | null = null;
      let trustCaseId: string | null = null;
      let verificationStatus: CandidateSkillVerificationStatus = CandidateSkillVerificationStatus.PENDING;
      let confidenceNote: string | null = null;
      let verifiedAt: Date | null = null;
      let score: number | null = null;
      let assessmentId: string | null = null;

      if (data.method === CandidateSkillVerificationMethod.ASSESSMENT) {
        const assessment = await prisma.skillAssessment.findFirst({
          where: {
            userId: req.user!.userId,
            ...(data.assessmentId ? { id: data.assessmentId } : {}),
            skillName: {
              equals: data.skillName,
              mode: "insensitive",
            },
            status: AssessmentStatus.COMPLETED,
          },
          orderBy: { completedAt: "desc" },
        });

        if (!assessment) {
          res.status(400).json({ error: "Complete an assessment for this skill before submitting it for verification." });
          return;
        }

        assessmentId = assessment.id;
        score = assessment.score ?? null;
        verificationStatus =
          (assessment.score ?? 0) >= 70
            ? CandidateSkillVerificationStatus.VERIFIED
            : CandidateSkillVerificationStatus.REJECTED;
        confidenceNote =
          verificationStatus === CandidateSkillVerificationStatus.VERIFIED
            ? "Assessment score met the verification threshold."
            : "Assessment score did not meet the current verification threshold.";
        verifiedAt =
          verificationStatus === CandidateSkillVerificationStatus.VERIFIED
            ? assessment.completedAt ?? new Date()
            : null;
      }

      if (data.method === CandidateSkillVerificationMethod.CERTIFICATE) {
        const artifact = await prisma.verificationArtifact.create({
          data: {
            userId: req.user!.userId,
            type: VerificationArtifactType.CERTIFICATION,
            fileKey: data.fileKey ?? null,
            fileName: data.fileName ?? null,
            externalUrl: data.externalUrl ?? null,
            metadata: {
              ...(data.metadata ?? {}),
              skillName: data.skillName,
              evidenceLabel: data.evidenceLabel ?? null,
            } as Prisma.InputJsonValue,
          },
        });
        artifactId = artifact.id;
      }

      const existingSkill = await prisma.candidateVerifiedSkill.findFirst({
        where: {
          userId: req.user!.userId,
          skillName: {
            equals: data.skillName,
            mode: "insensitive",
          },
          method: data.method,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      const savedSkill = existingSkill
        ? await prisma.candidateVerifiedSkill.update({
          where: { id: existingSkill.id },
          data: {
            status: verificationStatus,
            evidenceLabel: data.evidenceLabel ?? null,
            evidenceUrl: data.externalUrl ?? null,
            artifactId,
            assessmentId,
            score,
            confidenceNote,
            verifiedAt,
            metadata: {
              ...(data.metadata ?? {}),
              portfolioMatchesProfile:
                data.method === CandidateSkillVerificationMethod.PORTFOLIO
                  ? Boolean(
                    data.externalUrl &&
                    [
                      candidateProfile?.portfolioUrl,
                      candidateProfile?.githubUrl,
                      candidateProfile?.linkedinUrl,
                    ].includes(data.externalUrl),
                  )
                  : undefined,
            } as Prisma.InputJsonValue,
          },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                organizationType: true,
              },
            },
          },
        })
        : await prisma.candidateVerifiedSkill.create({
          data: {
            userId: req.user!.userId,
            skillName: data.skillName,
            method: data.method,
            status: verificationStatus,
            evidenceLabel: data.evidenceLabel ?? null,
            evidenceUrl: data.externalUrl ?? null,
            artifactId,
            assessmentId,
            score,
            confidenceNote,
            verifiedAt,
            metadata: {
              ...(data.metadata ?? {}),
              portfolioMatchesProfile:
                data.method === CandidateSkillVerificationMethod.PORTFOLIO
                  ? Boolean(
                    data.externalUrl &&
                    [
                      candidateProfile?.portfolioUrl,
                      candidateProfile?.githubUrl,
                      candidateProfile?.linkedinUrl,
                    ].includes(data.externalUrl),
                  )
                  : undefined,
            } as Prisma.InputJsonValue,
          },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                organizationType: true,
              },
            },
          },
        });

      if (verificationStatus === CandidateSkillVerificationStatus.PENDING) {
        const trustCase = await createTrustCase({
          entityType: TrustEntityType.CANDIDATE,
          priority: TrustRiskLevel.MEDIUM,
          title: `Candidate skill verification review: ${data.skillName}`,
          reasonCode: "candidate_skill_verification_submitted",
          summary: `Candidate submitted ${data.method.toLowerCase()} evidence for ${data.skillName}.`,
          candidateTrustProfileId: trustProfile.id,
          artifactId,
        });

        await addTrustCaseAction({
          caseId: trustCase.id,
          actorId: req.user!.userId,
          actionType: "NOTE",
          reasonCode: "candidate_skill_submitted",
          notes: `Submitted ${data.method.toLowerCase()} evidence for ${data.skillName}.`,
        });

        trustCaseId = trustCase.id;
      }

      const refreshedTrustProfile = await refreshCandidateTrustProfile(req.user!.userId);
      res.status(201).json({
        skillVerification: mapVerifiedSkill(savedSkill),
        trust: candidateTrustSummary(refreshedTrustProfile),
        caseId: trustCaseId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Candidate skill verification submission error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/reports",
  authenticate,
  requireAccountStanding({ allowLimited: true }),
  async (req: Request, res: Response) => {
    try {
      const data = reportSchema.parse(req.body);
      const scoreDelta = scoreDeltaForReport(data.reason);
      const priority = trustPriorityForReport(data.reason);

      let entityType: TrustEntityType = TrustEntityType.USER;
      let reportData: {
        reporterUserId: string;
        reason: AbuseReportReason;
        details?: string | null;
        reportedUserId?: string | null;
        employerId?: string | null;
        targetJobId?: string | null;
        targetApplicationId?: string | null;
        targetThreadId?: string | null;
      } = {
        reporterUserId: req.user!.userId,
        reason: data.reason,
        details: data.details ?? null,
      };

      let title = "Trust report submitted";
      let summary = data.details?.slice(0, 240) ?? "User-submitted trust and safety report.";
      let riskEventScore = scoreDelta;
      let caseTarget: {
        employerTrustProfileId?: string | null;
        candidateTrustProfileId?: string | null;
        jobId?: string | null;
        applicationId?: string | null;
        threadId?: string | null;
      } = {};

      if (data.targetJobId) {
        const job = await prisma.job.findUnique({
          where: { id: data.targetJobId },
          include: {
            employer: {
              include: {
                trustProfile: {
                  select: { id: true },
                },
              },
            },
          },
        });

        if (!job) {
          res.status(404).json({ error: "Job not found" });
          return;
        }

        entityType = TrustEntityType.JOB;
        reportData = {
          ...reportData,
          targetJobId: job.id,
          employerId: job.employerId ?? null,
          reportedUserId: job.employer?.userId ?? null,
        };
        title = `Reported job: ${job.title}`;
        summary = data.details?.slice(0, 240) ?? `A job was reported for ${data.reason.toLowerCase().replaceAll("_", " ")}.`;
        riskEventScore = Math.min(100, job.riskScore + scoreDelta);
        caseTarget = {
          employerTrustProfileId: job.employer?.trustProfile?.id ?? null,
          jobId: job.id,
        };

        if (priority === TrustRiskLevel.HIGH || priority === TrustRiskLevel.CRITICAL) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "PENDING_REVIEW",
              riskScore: Math.min(100, job.riskScore + scoreDelta),
              riskLevel: riskLevelForScore(job.riskScore + scoreDelta),
              trustFlags: Array.isArray(job.trustFlags)
                ? [...job.trustFlags, `report:${data.reason}`]
                : [`report:${data.reason}`],
            },
          });
        }
      } else if (data.targetApplicationId) {
        const application = await prisma.application.findUnique({
          where: { id: data.targetApplicationId },
          include: {
            candidate: {
              include: {
                candidateTrustProfile: {
                  select: { id: true },
                },
              },
            },
          },
        });

        if (!application) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        entityType = TrustEntityType.APPLICATION;
        reportData = {
          ...reportData,
          targetApplicationId: application.id,
          reportedUserId: application.candidateId,
        };
        title = `Reported application ${application.id.slice(0, 8)}`;
        summary = data.details?.slice(0, 240) ?? "An employer reported a suspicious candidate application.";
        riskEventScore = Math.min(100, application.riskScore + scoreDelta);
        caseTarget = {
          candidateTrustProfileId: application.candidate.candidateTrustProfile?.id ?? null,
          applicationId: application.id,
        };
      } else if (data.targetThreadId) {
        const thread = await prisma.messageThread.findUnique({
          where: { id: data.targetThreadId },
          include: {
            participants: {
              select: { userId: true },
            },
          },
        });

        if (!thread) {
          res.status(404).json({ error: "Conversation not found" });
          return;
        }

        const reportedUserId =
          thread.participants.find((participant) => participant.userId !== req.user!.userId)?.userId ?? null;

        entityType = TrustEntityType.MESSAGE;
        reportData = {
          ...reportData,
          targetThreadId: thread.id,
          reportedUserId,
        };
        title = `Reported conversation ${thread.id.slice(0, 8)}`;
        summary = data.details?.slice(0, 240) ?? "A conversation was reported for suspicious behaviour.";
        riskEventScore = scoreDelta;
        caseTarget = {
          threadId: thread.id,
        };
      } else if (data.employerId) {
        const employer = await prisma.employer.findUnique({
          where: { id: data.employerId },
          include: {
            trustProfile: {
              select: { id: true },
            },
          },
        });

        if (!employer) {
          res.status(404).json({ error: "Employer not found" });
          return;
        }

        entityType = TrustEntityType.EMPLOYER;
        reportData = {
          ...reportData,
          employerId: employer.id,
          reportedUserId: employer.userId,
        };
        title = `Reported employer: ${employer.companyName}`;
        summary = data.details?.slice(0, 240) ?? "An employer profile was reported for trust review.";
        riskEventScore = scoreDelta;
        caseTarget = {
          employerTrustProfileId: employer.trustProfile?.id ?? null,
        };
      } else if (data.reportedUserId) {
        const user = await prisma.user.findUnique({
          where: { id: data.reportedUserId },
          include: {
            candidateTrustProfile: {
              select: { id: true },
            },
            employer: {
              include: {
                trustProfile: {
                  select: { id: true },
                },
              },
            },
          },
        });

        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        entityType = user.role === Role.CANDIDATE ? TrustEntityType.CANDIDATE : TrustEntityType.USER;
        reportData = {
          ...reportData,
          reportedUserId: user.id,
          employerId: user.employer?.id ?? null,
        };
        title = `Reported profile: ${user.name}`;
        summary = data.details?.slice(0, 240) ?? "A profile was reported for trust review.";
        riskEventScore = scoreDelta;
        caseTarget = {
          employerTrustProfileId: user.employer?.trustProfile?.id ?? null,
          candidateTrustProfileId: user.candidateTrustProfile?.id ?? null,
        };
      }

      if (reportData.reportedUserId === req.user!.userId) {
        res.status(400).json({ error: "You cannot report your own account." });
        return;
      }

      const report = await prisma.abuseReport.create({
        data: reportData,
      });

      const trustCase = await createTrustCase({
        entityType,
        priority,
        title,
        reasonCode: data.reason,
        summary,
        reportId: report.id,
        ...caseTarget,
      });

      await addTrustCaseAction({
        caseId: trustCase.id,
        actorId: req.user!.userId,
        actionType: "NOTE",
        reasonCode: `report_${data.reason.toLowerCase()}`,
        notes: data.details ?? "Report submitted by a user.",
      });

      await recordTrustRiskEvent({
        entityType,
        reasonCode: `report_${data.reason.toLowerCase()}`,
        summary,
        scoreDelta,
        resultingScore: riskEventScore,
        riskLevel: priority,
        userId: reportData.reportedUserId ?? null,
        employerId: reportData.employerId ?? null,
        jobId: reportData.targetJobId ?? null,
        applicationId: reportData.targetApplicationId ?? null,
        threadId: reportData.targetThreadId ?? null,
        evidence: {
          reportId: report.id,
          reason: data.reason,
          details: data.details ?? null,
        },
        autoHeld: priority === TrustRiskLevel.HIGH || priority === TrustRiskLevel.CRITICAL,
      });

      if (reportData.employerId) {
        await refreshEmployerTrustProfile(reportData.employerId).catch(() => undefined);
      }

      if (reportData.reportedUserId) {
        const reported = await prisma.user.findUnique({
          where: { id: reportData.reportedUserId },
          include: {
            employer: {
              select: { id: true },
            },
          },
        });

        if (reported?.role === Role.CANDIDATE) {
          await refreshCandidateTrustProfile(reported.id).catch(() => undefined);
        }

        if (reported?.role === Role.EMPLOYER && reported.employer?.id) {
          await refreshEmployerTrustProfile(reported.employer.id).catch(() => undefined);
        }
      }

      res.status(201).json({
        reportId: report.id,
        caseId: trustCase.id,
        message: "Thanks for reporting this. Our trust and safety team will review it.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        validationFailure(res, error);
        return;
      }
      logger.error({ error }, "Trust report submission error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get("/messaging-guidance", authenticate, async (_req: Request, res: Response) => {
  const contentRisk = assessContentRisk(
    "Keep conversations on-platform. Never pay fees. Do not move to WhatsApp or Telegram before trust is established.",
  );
  res.json({
    headline: "Stay safe by keeping hiring conversations on AfriTalent",
    tips: [
      "Never pay application, processing, equipment, or training fees.",
      "Be cautious if someone asks to move immediately to WhatsApp, Telegram, or private email.",
      "Report impersonation, fake jobs, salary bait, or pressure tactics right away.",
      "Premium employers can only see verified-candidate filters when backed by real trust checks.",
    ],
    rulePreview: {
      riskScore: contentRisk.score,
      blockedPatterns: contentRisk.flags,
    },
  });
});

export default router;
