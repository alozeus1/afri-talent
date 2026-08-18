import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { computeProfileCompleteness } from "../lib/profile-completeness.js";
import { refreshCandidateTrustProfile } from "../lib/trust/service.js";
import logger from "../lib/logger.js";
import { dispatch as dispatchNotification } from "../lib/notifications/dispatcher.js";
import { ACCOUNT_DELETION_WINDOW_DAYS } from "../lib/privacy/anonymize.js";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CONTROL_CHARACTER_FIELDS } from "../middleware/security.js";

const router = Router();
const RESUME_BUCKET = process.env.S3_UPLOADS_BUCKET;
const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const RESUME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
let resumeS3: S3Client | null = null;
function resumeStorage() { return resumeS3 ??= new S3Client({ region: process.env.AWS_REGION || "us-east-1" }); }

const structuredWorkHistoryItemSchema = z.object({
  company: z.string().max(160).trim().optional().or(z.literal("")),
  title: z.string().max(160).trim().optional().or(z.literal("")),
  period: z.string().max(120).trim().optional().or(z.literal("")),
  description: z.string().max(1200).trim().optional().or(z.literal("")),
});

const structuredEducationItemSchema = z.object({
  institution: z.string().max(160).trim().optional().or(z.literal("")),
  degree: z.string().max(160).trim().optional().or(z.literal("")),
  period: z.string().max(120).trim().optional().or(z.literal("")),
});

const structuredCertificationItemSchema = z.object({
  name: z.string().max(160).trim().optional().or(z.literal("")),
  issuer: z.string().max(160).trim().optional().or(z.literal("")),
  credentialUrl: z.string().url().max(500).optional().or(z.literal("")),
});

const optionalTrimmedText = (max: number) =>
  z.string().max(max).trim().nullable().optional();

const optionalUrl = z.string().url().max(500).nullable().optional().or(z.literal(""));

const upsertProfileSchema = z.object({
  headline: optionalTrimmedText(200),
  bio: optionalTrimmedText(5000),
  skills: z.array(z.string().max(100)).max(50).optional(),
  targetRoles: z.array(z.string().max(100)).max(20).optional(),
  targetCountries: z.array(z.string().max(100)).max(54).optional(),
  yearsExperience: z.coerce.number().min(0).max(50).optional(),
  visaStatus: optionalTrimmedText(100),
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  workHistory: z.array(structuredWorkHistoryItemSchema).max(20).optional(),
  educationHistory: z.array(structuredEducationItemSchema).max(12).optional(),
  certifications: z.array(structuredCertificationItemSchema).max(20).optional(),
  openToWork: z.boolean().optional(),
});

const resumeMetadataSchema = z.object({
  s3Key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  setActive: z.boolean().default(false),
});

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeWorkHistory(
  items?: Array<z.infer<typeof structuredWorkHistoryItemSchema>>,
) {
  return (items ?? [])
    .map((item) => ({
      company: normalizeOptionalText(item.company),
      title: normalizeOptionalText(item.title),
      period: normalizeOptionalText(item.period),
      description: normalizeOptionalText(item.description),
    }))
    .filter((item) => Object.values(item).some(Boolean));
}

function normalizeEducationHistory(
  items?: Array<z.infer<typeof structuredEducationItemSchema>>,
) {
  return (items ?? [])
    .map((item) => ({
      institution: normalizeOptionalText(item.institution),
      degree: normalizeOptionalText(item.degree),
      period: normalizeOptionalText(item.period),
    }))
    .filter((item) => Object.values(item).some(Boolean));
}

function normalizeCertifications(
  items?: Array<z.infer<typeof structuredCertificationItemSchema>>,
) {
  return (items ?? [])
    .map((item) => ({
      name: normalizeOptionalText(item.name),
      issuer: normalizeOptionalText(item.issuer),
      credentialUrl: normalizeOptionalText(item.credentialUrl),
    }))
    .filter((item) => Object.values(item).some(Boolean));
}

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
    const linkedinUrl = normalizeOptionalText(data.linkedinUrl);
    const githubUrl = normalizeOptionalText(data.githubUrl);
    const portfolioUrl = normalizeOptionalText(data.portfolioUrl);
    const workHistory = data.workHistory !== undefined
      ? normalizeWorkHistory(data.workHistory)
      : undefined;
    const educationHistory = data.educationHistory !== undefined
      ? normalizeEducationHistory(data.educationHistory)
      : undefined;
    const certifications = data.certifications !== undefined
      ? normalizeCertifications(data.certifications)
      : undefined;

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
        workHistory: workHistory ?? [],
        educationHistory: educationHistory ?? [],
        certifications: certifications ?? [],
      },
      update: {
        ...data,
        linkedinUrl,
        githubUrl,
        portfolioUrl,
        ...(data.skills !== undefined && { skills: data.skills }),
        ...(data.targetRoles !== undefined && { targetRoles: data.targetRoles }),
        ...(data.targetCountries !== undefined && { targetCountries: data.targetCountries }),
        ...(workHistory !== undefined && { workHistory }),
        ...(educationHistory !== undefined && { educationHistory }),
        ...(certifications !== undefined && { certifications }),
      },
      include: {
        resumes: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    const completeness = computeProfileCompleteness(profile);
    const updated = await prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompleteness: completeness },
      include: {
        resumes: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    await refreshCandidateTrustProfile(req.user!.userId).catch(() => undefined);

    res.json(updated);
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
    const keySuffix = data.s3Key.slice(expectedPrefix.length);
    if (
      !data.s3Key.startsWith(expectedPrefix) ||
      !keySuffix ||
      (res.locals[CONTROL_CHARACTER_FIELDS] as Set<string> | undefined)?.has("s3Key") ||
      keySuffix.split("/").some((segment) => segment === "." || segment === "..") ||
      /%2e/i.test(data.s3Key) ||
      Array.from(data.s3Key).some((character) => {
        const codePoint = character.codePointAt(0)!;
        return codePoint <= 0x1f || codePoint === 0x7f;
      })
    ) {
      res.status(400).json({ error: "Invalid s3Key — must be scoped to your user ID" });
      return;
    }
    if (!RESUME_BUCKET) {
      res.status(503).json({ error: "Resume uploads are not configured" });
      return;
    }
    const extension = Object.keys(RESUME_TYPES).find((value) => data.s3Key.toLowerCase().endsWith(value));
    if (!extension) {
      res.status(400).json({ error: "Invalid resume file type" });
      return;
    }
    try {
      const object = await resumeStorage().send(new HeadObjectCommand({ Bucket: RESUME_BUCKET, Key: data.s3Key }));
      if (
        !Number.isFinite(object.ContentLength) || !object.ContentLength || object.ContentLength <= 0 || object.ContentLength > RESUME_MAX_BYTES ||
        object.ContentType !== RESUME_TYPES[extension] || object.ServerSideEncryption !== "aws:kms"
      ) {
        res.status(400).json({ error: "Uploaded resume metadata is invalid" });
        return;
      }
    } catch {
      res.status(422).json({ error: "Upload has not completed or is unavailable" });
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

    const refreshedProfile = await prisma.candidateProfile.findUnique({
      where: { id: profile.id },
      include: {
        resumes: {
          select: { id: true },
        },
      },
    });

    if (refreshedProfile) {
      const completeness = computeProfileCompleteness(refreshedProfile);
      await prisma.candidateProfile.update({
        where: { id: profile.id },
        data: { profileCompleteness: completeness },
      });
      await refreshCandidateTrustProfile(req.user!.userId).catch(() => undefined);
    }

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

// GET /api/profile/privacy — get privacy settings
router.get("/privacy", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    select: { profileVisible: true },
  });
  res.json({ profileVisible: profile?.profileVisible ?? true });
});

// PUT /api/profile/privacy — update privacy settings
const privacySchema = z.object({ profileVisible: z.boolean() });

router.put("/privacy", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response): Promise<void> => {
  const result = privacySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request", issues: result.error.issues });
    return;
  }
  const userId = req.user!.userId;
  await prisma.candidateProfile.upsert({
    where: { userId },
    update: { profileVisible: result.data.profileVisible },
    create: { userId, profileVisible: result.data.profileVisible },
  });
  res.json({ message: "Privacy settings updated", profileVisible: result.data.profileVisible });
});

// POST /api/profile/delete-request — request account deletion (soft delete)
router.post("/delete-request", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, deletionRequestedAt: true, deletedAt: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.deletedAt) {
    res.status(400).json({ error: "Account is already scheduled for deletion" });
    return;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: new Date() },
  });
  logger.info({ userId: userId.slice(0, 8) }, "[privacy] account deletion requested");

  if (process.env.NODE_ENV !== "test") {
    const supportUrl =
      process.env.SUPPORT_URL ||
      `${process.env.APP_URL || process.env.FRONTEND_URL || "https://afritalent.com"}/support`;
    void dispatchNotification({
      kind: "ACCOUNT_CLOSED",
      user: { id: user.id, email: user.email, name: user.name },
      scheduledDeletionDays: ACCOUNT_DELETION_WINDOW_DAYS,
      supportUrl,
    }).catch((dispatchError) => {
      logger.warn(
        {
          userId: userId.slice(0, 8),
          error: dispatchError instanceof Error ? dispatchError.message : "unknown",
        },
        "[privacy] account-closed dispatch failed",
      );
    });
  }

  res.json({
    message: `Deletion request received. Your account will be deleted within ${ACCOUNT_DELETION_WINDOW_DAYS} days.`,
    requestedAt: new Date().toISOString(),
  });
});

// GET /api/profile/export — export all user data
router.get("/export", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const [profile, resume, applications] = await Promise.all([
    prisma.candidateProfile.findUnique({ where: { userId } }),
    prisma.userResume.findUnique({ where: { userId }, select: { createdAt: true, updatedAt: true } }),
    prisma.application.findMany({
      where: { candidateId: userId },
      select: { id: true, status: true, createdAt: true },
      take: 100,
    }),
  ]);
  res.json({
    exportedAt: new Date().toISOString(),
    userId,
    profile: profile ? { ...profile, embedding: "[omitted]" } : null,
    resume: resume ? { hasResume: true, updatedAt: resume.updatedAt } : null,
    applicationCount: applications.length,
    applicationStatuses: applications.map((a) => ({ id: a.id, status: a.status, createdAt: a.createdAt })),
  });
});

// GET /api/profile/analytics — candidate profile view analytics
router.get("/analytics", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  try {
    const profile = await prisma.candidateProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!profile) {
      res.json({
        profileViews: 0,
        viewsByWeek: [],
        resumeDownloads: 0,
      });
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Total profile views in the last 30 days
    const profileViews = await prisma.profileView.count({
      where: {
        profileId: profile.id,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Views by week for the last 4 weeks
    const viewsByWeek: { week: string; count: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);

      const count = await prisma.profileView.count({
        where: {
          profileId: profile.id,
          createdAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
      });

      viewsByWeek.push({
        week: weekStart.toISOString().split("T")[0],
        count,
      });
    }

    // Resume downloads proxy: views from employers
    const resumeDownloads = await prisma.profileView.count({
      where: {
        profileId: profile.id,
        viewerRole: "EMPLOYER",
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    res.json({
      profileViews,
      viewsByWeek,
      resumeDownloads,
    });
  } catch (error) {
    console.error("Profile analytics error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
