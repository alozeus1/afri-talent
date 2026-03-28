import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  AbuseReportStatus,
  JobStatus,
  ModerationActionType,
  Role,
  TrustEntityType,
  TrustCaseStatus,
  TrustRiskLevel,
  VerificationArtifactStatus,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  addTrustCaseAction,
  createTrustCase,
  refreshCandidateTrustProfile,
  refreshEmployerTrustProfile,
} from "../lib/trust/service.js";
import { createUserNotification } from "../lib/notifications.js";
import { verificationEmail } from "../lib/email.js";

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

const artifactReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "NEEDS_MORE_INFO"]),
  reasonCode: z.string().trim().min(3).max(100),
  reviewerNotes: z.string().trim().max(2000).optional(),
});

const caseActionSchema = z.object({
  actionType: z.nativeEnum(ModerationActionType),
  reasonCode: z.string().trim().min(3).max(100),
  notes: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(TrustCaseStatus).optional(),
  priority: z.nativeEnum(TrustRiskLevel).optional(),
});

const reportActionSchema = z.object({
  status: z.enum(["TRIAGED", "RESOLVED", "DISMISSED"]),
  reasonCode: z.string().trim().min(3).max(100),
  notes: z.string().trim().max(2000).optional(),
  actionType: z.nativeEnum(ModerationActionType).optional(),
});

function validationFailure(res: Response, error: z.ZodError) {
  res.status(400).json({ error: "Validation failed", details: error.issues });
}

function inferCaseStatus(actionType: ModerationActionType): TrustCaseStatus {
  switch (actionType) {
    case ModerationActionType.NOTE:
      return TrustCaseStatus.IN_REVIEW;
    case ModerationActionType.ESCALATE:
      return TrustCaseStatus.IN_REVIEW;
    case ModerationActionType.REJECT:
      return TrustCaseStatus.DISMISSED;
    default:
      return TrustCaseStatus.ACTIONED;
  }
}

async function resolveCaseTargetUser(caseRecord: any) {
  if (!caseRecord) {
    return null;
  }

  if (caseRecord.candidateTrustProfile?.userId) {
    return caseRecord.candidateTrustProfile.userId;
  }

  if (caseRecord.employerTrustProfile?.employer?.userId) {
    return caseRecord.employerTrustProfile.employer.userId;
  }

  if (caseRecord.application?.candidateId) {
    return caseRecord.application.candidateId;
  }

  if (caseRecord.job?.employer?.userId) {
    return caseRecord.job.employer.userId;
  }

  if (caseRecord.report?.reportedUserId) {
    return caseRecord.report.reportedUserId;
  }

  return null;
}

async function applyCaseActionEffects(caseRecord: any, action: z.infer<typeof caseActionSchema>) {
  if (!caseRecord) return;

  const targetUserId = await resolveCaseTargetUser(caseRecord);

  switch (action.actionType) {
    case ModerationActionType.HOLD:
      if (caseRecord.jobId) {
        await prisma.job.update({
          where: { id: caseRecord.jobId },
          data: { status: JobStatus.PENDING_REVIEW },
        });
      }
      break;
    case ModerationActionType.APPROVE:
      if (caseRecord.jobId) {
        await prisma.job.update({
          where: { id: caseRecord.jobId },
          data: {
            status: JobStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
      }
      if (caseRecord.artifactId) {
        await prisma.verificationArtifact.update({
          where: { id: caseRecord.artifactId },
          data: {
            status: VerificationArtifactStatus.APPROVED,
          },
        });
      }
      break;
    case ModerationActionType.REJECT:
      if (caseRecord.jobId) {
        await prisma.job.update({
          where: { id: caseRecord.jobId },
          data: { status: JobStatus.REJECTED },
        });
      }
      if (caseRecord.artifactId) {
        await prisma.verificationArtifact.update({
          where: { id: caseRecord.artifactId },
          data: {
            status: VerificationArtifactStatus.REJECTED,
          },
        });
      }
      break;
    case ModerationActionType.LIMIT:
      if (targetUserId) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: {
            accountRestrictionStatus: "LIMITED",
            accountRestrictionReason: action.notes ?? "Limited pending trust review.",
            accountRestrictedAt: new Date(),
          },
        });
      }
      break;
    case ModerationActionType.SUSPEND:
      if (targetUserId) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: {
            accountRestrictionStatus: "SUSPENDED",
            accountRestrictionReason: action.notes ?? "Suspended pending trust review.",
            accountRestrictedAt: new Date(),
          },
        });
      }
      break;
    case ModerationActionType.REINSTATE:
      if (targetUserId) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: {
            accountRestrictionStatus: "ACTIVE",
            accountRestrictionReason: null,
            accountRestrictedAt: null,
          },
        });
      }
      break;
    case ModerationActionType.ESCALATE:
      await prisma.trustCase.update({
        where: { id: caseRecord.id },
        data: {
          priority: action.priority ?? TrustRiskLevel.CRITICAL,
        },
      });
      break;
    case ModerationActionType.NOTE:
    default:
      break;
  }

  if (caseRecord.employerTrustProfile?.employer?.id) {
    await refreshEmployerTrustProfile(caseRecord.employerTrustProfile.employer.id).catch(() => undefined);
  }

  if (caseRecord.candidateTrustProfile?.userId) {
    await refreshCandidateTrustProfile(caseRecord.candidateTrustProfile.userId).catch(() => undefined);
  }
}

router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const [
      pendingVerificationArtifacts,
      openRiskCases,
      openReports,
      limitedAccounts,
      suspendedAccounts,
      heldJobs,
    ] = await Promise.all([
      prisma.verificationArtifact.count({
        where: {
          status: {
            in: [VerificationArtifactStatus.PENDING, VerificationArtifactStatus.NEEDS_MORE_INFO],
          },
        },
      }),
      prisma.trustCase.count({
        where: {
          status: {
            in: [TrustCaseStatus.OPEN, TrustCaseStatus.IN_REVIEW],
          },
        },
      }),
      prisma.abuseReport.count({
        where: {
          status: {
            in: ["OPEN", "TRIAGED"],
          },
        },
      }),
      prisma.user.count({
        where: { accountRestrictionStatus: "LIMITED" },
      }),
      prisma.user.count({
        where: { accountRestrictionStatus: "SUSPENDED" },
      }),
      prisma.job.count({
        where: {
          status: JobStatus.PENDING_REVIEW,
        },
      }),
    ]);

    res.json({
      pendingVerificationArtifacts,
      openRiskCases,
      openReports,
      limitedAccounts,
      suspendedAccounts,
      heldJobs,
    });
  } catch (error) {
    logger.error({ error }, "Admin trust dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verification-queue", async (req: Request, res: Response) => {
  try {
    const subject = typeof req.query.subject === "string" ? req.query.subject : "ALL";
    const status = typeof req.query.status === "string" ? req.query.status : "PENDING";

    const where: Record<string, unknown> = {
      status:
        status === "ALL"
          ? undefined
          : status === "PENDING"
            ? { in: [VerificationArtifactStatus.PENDING, VerificationArtifactStatus.NEEDS_MORE_INFO] }
            : status,
    };

    if (subject === "EMPLOYER") {
      where.employerId = { not: null };
    } else if (subject === "CANDIDATE") {
      where.userId = { not: null };
    }

    const queue = await prisma.verificationArtifact.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        employer: {
          select: { id: true, companyName: true, userId: true },
        },
        reviewer: {
          select: { id: true, name: true },
        },
        trustCase: {
          include: {
            actions: {
              orderBy: { createdAt: "desc" },
              include: {
                actor: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    });

    res.json({ queue });
  } catch (error) {
    logger.error({ error }, "Verification queue error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/artifacts/:id/review", async (req: Request, res: Response) => {
  try {
    const data = artifactReviewSchema.parse(req.body);
    const artifact = await prisma.verificationArtifact.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        employer: {
          select: { id: true, companyName: true, userId: true },
        },
        trustCase: {
          select: { id: true },
        },
      },
    });

    if (!artifact) {
      res.status(404).json({ error: "Verification artifact not found" });
      return;
    }

    const updated = await prisma.verificationArtifact.update({
      where: { id: artifact.id },
      data: {
        status: data.status,
        reviewerId: req.user!.userId,
        reviewedAt: new Date(),
        reviewerNotes: data.reviewerNotes ?? null,
      },
    });

    const trustCase =
      artifact.trustCase ??
      (await createTrustCase({
        entityType: artifact.employerId ? TrustEntityType.EMPLOYER : TrustEntityType.CANDIDATE,
        priority: TrustRiskLevel.MEDIUM,
        title: `Verification review for ${artifact.type.toLowerCase()}`,
        reasonCode: data.reasonCode,
        summary: data.reviewerNotes ?? "Verification artifact reviewed by an admin.",
        artifactId: artifact.id,
      }));

    await addTrustCaseAction({
      caseId: trustCase.id,
      actorId: req.user!.userId,
      actionType:
        data.status === VerificationArtifactStatus.APPROVED
          ? ModerationActionType.APPROVE
          : data.status === VerificationArtifactStatus.REJECTED
            ? ModerationActionType.REJECT
            : ModerationActionType.NOTE,
      reasonCode: data.reasonCode,
      notes: data.reviewerNotes ?? undefined,
    });

    await prisma.trustCase.update({
      where: { id: trustCase.id },
      data: {
        status:
          data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
            ? TrustCaseStatus.IN_REVIEW
            : data.status === VerificationArtifactStatus.REJECTED
              ? TrustCaseStatus.DISMISSED
              : TrustCaseStatus.ACTIONED,
        assignedAdminId: req.user!.userId,
      },
    });

    if (artifact.employerId) {
      await refreshEmployerTrustProfile(artifact.employerId).catch(() => undefined);

      if (artifact.employer?.userId) {
        await createUserNotification({
          userId: artifact.employer.userId,
          type: "VERIFICATION",
          title:
            data.status === VerificationArtifactStatus.APPROVED
              ? "Employer verification approved"
              : data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
                ? "Employer verification needs more information"
                : "Employer verification rejected",
          body:
            data.status === VerificationArtifactStatus.APPROVED
              ? "Your employer verification evidence was approved."
              : data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
                ? "Please review the feedback on your employer verification submission."
                : "Your employer verification evidence was rejected.",
          channel: "applicationUpdates",
          metadata: { artifactId: artifact.id, status: data.status },
        });
      }

      if (artifact.employer) {
        const employerUser = await prisma.user.findUnique({
          where: { id: artifact.employer.userId },
          select: { email: true },
        });

        if (employerUser?.email) {
        await verificationEmail({
          to: employerUser.email,
          companyName: artifact.employer.companyName,
          status:
            data.status === VerificationArtifactStatus.APPROVED
              ? "VERIFIED"
              : data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
                ? "PENDING"
                : "UNVERIFIED",
          portalUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/employer/trust`,
        }).catch(() => undefined);
        }
      }
    }

    if (artifact.userId) {
      await refreshCandidateTrustProfile(artifact.userId).catch(() => undefined);
      await createUserNotification({
        userId: artifact.userId,
        type: "VERIFICATION",
        title:
          data.status === VerificationArtifactStatus.APPROVED
            ? "Candidate verification approved"
            : data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
              ? "Candidate verification needs more information"
              : "Candidate verification rejected",
        body:
          data.status === VerificationArtifactStatus.APPROVED
            ? "Your verification evidence was approved."
            : data.status === VerificationArtifactStatus.NEEDS_MORE_INFO
              ? "Please review the notes on your verification submission."
              : "Your verification evidence was rejected.",
        channel: "applicationUpdates",
        metadata: { artifactId: artifact.id, status: data.status },
      }).catch(() => undefined);
    }

    res.json({ artifact: updated, caseId: trustCase.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      validationFailure(res, error);
      return;
    }
    logger.error({ error }, "Artifact review error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/risk-queue", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "ACTIVE";
    const where =
      status === "ALL"
        ? {}
        : {
            status: {
              in: [TrustCaseStatus.OPEN, TrustCaseStatus.IN_REVIEW, TrustCaseStatus.ACTIONED],
            },
          };

    const queue = await prisma.trustCase.findMany({
      where,
      include: {
        assignedAdmin: {
          select: { id: true, name: true },
        },
        employerTrustProfile: {
          include: {
            employer: {
              select: { id: true, companyName: true, userId: true },
            },
          },
        },
        candidateTrustProfile: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        job: {
          include: {
            employer: {
              select: { id: true, companyName: true, userId: true },
            },
          },
        },
        application: {
          select: {
            id: true,
            candidateId: true,
            jobId: true,
          },
        },
        report: {
          select: {
            id: true,
            reason: true,
            status: true,
            reportedUserId: true,
          },
        },
        artifact: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
        actions: {
          orderBy: { createdAt: "desc" },
          include: {
            actor: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    res.json({ queue });
  } catch (error) {
    logger.error({ error }, "Risk queue error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/cases/:id/actions", async (req: Request, res: Response) => {
  try {
    const data = caseActionSchema.parse(req.body);
    const trustCase = await prisma.trustCase.findUnique({
      where: { id: req.params.id },
      include: {
        employerTrustProfile: {
          include: {
            employer: {
              select: { id: true, companyName: true, userId: true },
            },
          },
        },
        candidateTrustProfile: {
          select: {
            id: true,
            userId: true,
          },
        },
        job: {
          include: {
            employer: {
              select: { id: true, companyName: true, userId: true },
            },
          },
        },
        application: {
          select: {
            id: true,
            candidateId: true,
          },
        },
        report: {
          select: {
            id: true,
            reportedUserId: true,
          },
        },
        artifact: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!trustCase) {
      res.status(404).json({ error: "Trust case not found" });
      return;
    }

    const action = await addTrustCaseAction({
      caseId: trustCase.id,
      actorId: req.user!.userId,
      actionType: data.actionType,
      reasonCode: data.reasonCode,
      notes: data.notes,
    });

    await applyCaseActionEffects(trustCase, data);

    const updatedCase = await prisma.trustCase.update({
      where: { id: trustCase.id },
      data: {
        status: data.status ?? inferCaseStatus(data.actionType),
        priority: data.priority ?? trustCase.priority,
        assignedAdminId: req.user!.userId,
        closedAt:
          (data.status ?? inferCaseStatus(data.actionType)) === TrustCaseStatus.ACTIONED ||
          (data.status ?? inferCaseStatus(data.actionType)) === TrustCaseStatus.DISMISSED
            ? new Date()
            : null,
      },
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
          include: {
            actor: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    res.json({ trustCase: updatedCase, action });
  } catch (error) {
    if (error instanceof z.ZodError) {
      validationFailure(res, error);
      return;
    }
    logger.error({ error }, "Trust case action error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "OPEN";
    const where =
      status === "ALL"
        ? undefined
        : status === "ACTIVE"
          ? {
              status: {
                in: [AbuseReportStatus.OPEN, AbuseReportStatus.TRIAGED],
              },
            }
          : {
              status: status as AbuseReportStatus,
            };

    const reports = await prisma.abuseReport.findMany({
      where,
      include: {
        reporter: {
          select: { id: true, name: true, email: true },
        },
        reportedUser: {
          select: { id: true, name: true, email: true, role: true },
        },
        employer: {
          select: { id: true, companyName: true, userId: true },
        },
        targetJob: {
          select: { id: true, title: true, status: true },
        },
        targetApplication: {
          select: { id: true, status: true },
        },
        assignedAdmin: {
          select: { id: true, name: true },
        },
        trustCase: {
          include: {
            actions: {
              orderBy: { createdAt: "desc" },
              include: {
                actor: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ reports });
  } catch (error) {
    logger.error({ error }, "Abuse reports queue error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reports/:id/action", async (req: Request, res: Response) => {
  try {
    const data = reportActionSchema.parse(req.body);
    const report = await prisma.abuseReport.findUnique({
      where: { id: req.params.id },
      include: {
        trustCase: {
          include: {
            employerTrustProfile: {
              include: {
                employer: {
                  select: { id: true, companyName: true, userId: true },
                },
              },
            },
            candidateTrustProfile: {
              select: {
                id: true,
                userId: true,
              },
            },
            job: {
              include: {
                employer: {
                  select: { id: true, companyName: true, userId: true },
                },
              },
            },
            application: {
              select: {
                id: true,
                candidateId: true,
              },
            },
            report: {
              select: {
                id: true,
                reportedUserId: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const updatedReport = await prisma.abuseReport.update({
      where: { id: report.id },
      data: {
        status: data.status,
        assignedAdminId: req.user!.userId,
        triagedAt: data.status === "TRIAGED" ? new Date() : report.triagedAt ?? new Date(),
        resolvedAt: data.status === "RESOLVED" || data.status === "DISMISSED" ? new Date() : null,
        resolutionNotes: data.notes ?? report.resolutionNotes,
      },
    });

    if (report.trustCase) {
      await addTrustCaseAction({
        caseId: report.trustCase.id,
        actorId: req.user!.userId,
        actionType: data.actionType ?? ModerationActionType.NOTE,
        reasonCode: data.reasonCode,
        notes: data.notes,
      });

      if (data.actionType) {
        await applyCaseActionEffects(report.trustCase, {
          actionType: data.actionType,
          reasonCode: data.reasonCode,
          notes: data.notes,
          status:
            data.status === "DISMISSED"
              ? TrustCaseStatus.DISMISSED
              : data.status === "RESOLVED"
                ? TrustCaseStatus.ACTIONED
                : TrustCaseStatus.IN_REVIEW,
        });
      }

      await prisma.trustCase.update({
        where: { id: report.trustCase.id },
        data: {
          status:
            data.status === "DISMISSED"
              ? TrustCaseStatus.DISMISSED
              : data.status === "RESOLVED"
                ? TrustCaseStatus.ACTIONED
                : TrustCaseStatus.IN_REVIEW,
          assignedAdminId: req.user!.userId,
          closedAt: data.status === "RESOLVED" || data.status === "DISMISSED" ? new Date() : null,
        },
      });
    }

    res.json({ report: updatedReport });
  } catch (error) {
    if (error instanceof z.ZodError) {
      validationFailure(res, error);
      return;
    }
    logger.error({ error }, "Abuse report action error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
