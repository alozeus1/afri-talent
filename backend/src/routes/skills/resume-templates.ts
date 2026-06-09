import { Router, Request, Response } from "express";
import { z } from "zod";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { getUserEntitlements } from "../../lib/billing/entitlements.js";
import { Role, SubscriptionPlan } from "@prisma/client";
import { fillTemplate } from "../../lib/ai/skills/template-filler.js";

const router = Router();

const BUCKET = process.env.S3_UPLOADS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const DOWNLOAD_URL_EXPIRY_SECONDS = 300; // 5 minutes
const THUMBNAIL_URL_EXPIRY_SECONDS = 3600; // 1 hour

async function getPresignedThumbnailUrl(thumbnailUrl: string): Promise<string> {
  // If it's already a full HTTP URL that isn't an S3 object key, return as-is
  if (!thumbnailUrl || !BUCKET) return thumbnailUrl || "";

  // If it looks like an S3 URL, extract the key and generate a presigned URL
  const s3UrlPattern = /^https?:\/\/[^/]+\.s3[.-]/;
  if (s3UrlPattern.test(thumbnailUrl)) {
    try {
      const url = new URL(thumbnailUrl);
      const key = url.pathname.replace(/^\//, "");
      const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
      return await getSignedUrl(getS3Client(), command, {
        expiresIn: THUMBNAIL_URL_EXPIRY_SECONDS,
      });
    } catch {
      return thumbnailUrl;
    }
  }

  // Otherwise assume it's an S3 key
  if (!thumbnailUrl.includes("://")) {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: thumbnailUrl });
    return await getSignedUrl(getS3Client(), command, {
      expiresIn: THUMBNAIL_URL_EXPIRY_SECONDS,
    });
  }

  return thumbnailUrl;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

// ── GET /api/skills/resume-templates ─────────────────────────────────────────
// List active templates with user eligibility metadata.
// Auth: CANDIDATE (any plan — FREE can preview)
router.get(
  "/",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const entitlements = await getUserEntitlements(userId);
      const plan = entitlements.plan;

      const templates = await prisma.resumeTemplate.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          files: {
            select: {
              id: true,
              format: true,
              s3Key: true,
              externalUrl: true,
              fileSizeBytes: true,
            },
          },
          _count: {
            select: { downloads: true },
          },
        },
      });

      // Compute user's downloads this month for quota enforcement
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const userDownloadsThisMonth = await prisma.templateDownload.count({
        where: {
          userId,
          downloadedAt: { gte: startOfMonth },
        },
      });

      const quota = entitlements.templateDownloadsPerMonth;
      const canDownload =
        quota === null || // unlimited
        userDownloadsThisMonth < quota;

      const enriched = await Promise.all(
        templates.map(async (t) => {
          const planRank: Record<SubscriptionPlan, number> = {
            FREE: 0,
            BASIC: 1,
            PROFESSIONAL: 2,
            EMPLOYER_FREE: 0,
            EMPLOYER_BASIC: 1,
            EMPLOYER_PREMIUM: 2,
          };
          const isLocked = planRank[plan] < planRank[t.minPlan];
          const thumbnailUrl = await getPresignedThumbnailUrl(t.thumbnailUrl);

          return {
            id: t.id,
            name: t.name,
            description: t.description,
            thumbnailUrl,
            tags: t.tags,
            bestFor: t.bestFor,
            minPlan: t.minPlan,
            sortOrder: t.sortOrder,
            files: t.files,
            isLocked,
            totalDownloads: t._count.downloads,
          };
        })
      );

      res.json({
        templates: enriched,
        userPlan: plan,
        userDownloadsThisMonth,
        quota,
        canDownload,
      });
    } catch (error) {
      logger.error({ error }, "[resume-templates] Failed to list templates");
      res.status(500).json({ error: "Failed to list templates" });
    }
  }
);

// ── GET /api/skills/resume-templates/:id/download ────────────────────────────
// Returns a presigned S3 URL for downloading a template file.
// Auth: CANDIDATE + plan check + quota check
const downloadParamsSchema = z.object({
  id: z.string().uuid(),
});

const downloadQuerySchema = z.object({
  format: z.enum(["HTML", "PDF", "DOCX", "GOOGLE_DOCS", "CANVA"]).default("HTML"),
});

router.get(
  "/:id/download",
  authenticate,
  authorize(Role.CANDIDATE),
  async (req: Request, res: Response) => {
    try {
      const { id } = downloadParamsSchema.parse(req.params);
      const { format } = downloadQuerySchema.parse(req.query);

      const userId = req.user!.userId;
      const entitlements = await getUserEntitlements(userId);
      const plan = entitlements.plan;
      const quota = entitlements.templateDownloadsPerMonth;

      const template = await prisma.resumeTemplate.findUnique({
        where: { id },
        include: { files: true },
      });

      if (!template || !template.isActive) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      // Plan check
      const planRank: Record<SubscriptionPlan, number> = {
        FREE: 0,
        BASIC: 1,
        PROFESSIONAL: 2,
        EMPLOYER_FREE: 0,
        EMPLOYER_BASIC: 1,
        EMPLOYER_PREMIUM: 2,
      };
      if (planRank[plan] < planRank[template.minPlan]) {
        res.status(403).json({
          error: "This template requires a higher subscription plan",
          requiredPlan: template.minPlan,
          currentPlan: plan,
        });
        return;
      }

      // Quota check
      if (quota !== null) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const downloadsThisMonth = await prisma.templateDownload.count({
          where: {
            userId,
            downloadedAt: { gte: startOfMonth },
          },
        });

        if (downloadsThisMonth >= quota) {
          res.status(403).json({
            error: "Monthly template download limit reached",
            quota,
            downloadsThisMonth,
          });
          return;
        }
      }

      // Find the requested file format
      const file = template.files.find((f) => f.format === format);
      if (!file) {
        res.status(404).json({ error: `Template not available in ${format} format` });
        return;
      }

      // External URL (Canva, Google Docs) — no presigned needed
      if (file.externalUrl) {
        await prisma.templateDownload.create({
          data: {
            userId,
            templateId: id,
            format,
            source: "gallery",
          },
        });
        res.json({ downloadUrl: file.externalUrl, expiresAt: null });
        return;
      }

      if (!file.s3Key || !BUCKET) {
        res.status(503).json({ error: "Template file storage is not configured" });
        return;
      }

      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: file.s3Key,
      });

      const presignedUrl = await getSignedUrl(getS3Client(), command, {
        expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
      });

      // Log download
      await prisma.templateDownload.create({
        data: {
          userId,
          templateId: id,
          format,
          source: "gallery",
        },
      });

      res.json({
        downloadUrl: presignedUrl,
        expiresAt: new Date(Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000).toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: error.flatten() });
        return;
      }
      logger.error({ error }, "[resume-templates] Failed to generate download URL");
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  }
);

// ── POST /api/skills/resume-templates/:id/fill ───────────────────────────────
// Auto-fill an HTML template with the user's saved resume data.
// Auth: CANDIDATE + PROFESSIONAL only
const fillParamsSchema = z.object({
  id: z.string().uuid(),
});

router.post(
  "/:id/fill",
  authenticate,
  authorize(Role.CANDIDATE),
  requirePlan(SubscriptionPlan.PROFESSIONAL),
  async (req: Request, res: Response) => {
    try {
      const { id } = fillParamsSchema.parse(req.params);
      const userId = req.user!.userId;

      const template = await prisma.resumeTemplate.findUnique({
        where: { id },
        include: { files: true },
      });

      if (!template || !template.isActive) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      // Find HTML file
      const htmlFile = template.files.find((f) => f.format === "HTML" && f.s3Key);
      if (!htmlFile || !htmlFile.s3Key || !BUCKET) {
        res.status(503).json({ error: "Template HTML source is not configured" });
        return;
      }

      // Fetch the HTML template from S3
      const getCmd = new GetObjectCommand({ Bucket: BUCKET, Key: htmlFile.s3Key });
      const response = await getS3Client().send(getCmd);
      const templateHtml = await response.Body?.transformToString("utf-8");
      if (!templateHtml) {
        res.status(500).json({ error: "Failed to read template source" });
        return;
      }

      // Fetch user's saved resume
      const userResume = await prisma.userResume.findUnique({ where: { userId } });
      if (!userResume) {
        res.status(404).json({ error: "No saved resume found. Generate and save a resume first." });
        return;
      }

      const resumeContent = userResume.content as Record<string, unknown>;
      const sections = resumeContent.sections as Record<string, unknown>;

      // Fetch user and profile for contact details
      const [user, candidateProfile] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { name: true, phoneNumber: true } }),
        prisma.candidateProfile.findUnique({ where: { userId } }),
      ]);

      const filledHtml = fillTemplate(templateHtml, {
        fullName: user?.name || "",
        email: req.user!.email,
        phone: user?.phoneNumber || undefined,
        location: candidateProfile?.targetCountries?.[0] || undefined,
        linkedinUrl: candidateProfile?.linkedinUrl || undefined,
        githubUrl: candidateProfile?.githubUrl || undefined,
        portfolioUrl: candidateProfile?.portfolioUrl || undefined,
        resume: {
          sections: {
            summary: String(sections?.summary || ""),
            skills: Array.isArray(sections?.skills) ? sections.skills as string[] : [],
            experience: Array.isArray(sections?.experience)
              ? (sections.experience as Array<Record<string, unknown>>).map((e) => ({
                  company: String(e.company || ""),
                  title: String(e.title || ""),
                  period: String(e.period || ""),
                  bullets: Array.isArray(e.bullets) ? e.bullets as string[] : [],
                }))
              : [],
            education: Array.isArray(sections?.education)
              ? (sections.education as Array<Record<string, unknown>>).map((e) => ({
                  institution: String(e.institution || ""),
                  degree: String(e.degree || ""),
                  period: String(e.period || ""),
                }))
              : [],
            certifications: Array.isArray(sections?.certifications)
              ? sections.certifications as string[]
              : [],
          },
          rawText: userResume.rawText,
          source: "ai",
        },
      });

      // Upload filled file to S3 (temporary, 1-hour TTL via lifecycle or manual cleanup)
      const filledKey = `templates/filled/${userId}/${id}-${Date.now()}.html`;
      const putCmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: filledKey,
        Body: filledHtml,
        ContentType: "text/html",
      });
      await getS3Client().send(putCmd);

      // Generate presigned URL
      const presignedUrl = await getSignedUrl(
        getS3Client(),
        new GetObjectCommand({ Bucket: BUCKET, Key: filledKey }),
        { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS }
      );

      // Log download
      await prisma.templateDownload.create({
        data: {
          userId,
          templateId: id,
          format: "HTML",
          source: "resume_builder",
        },
      });

      res.json({
        downloadUrl: presignedUrl,
        expiresAt: new Date(Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000).toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: error.flatten() });
        return;
      }
      logger.error({ error }, "[resume-templates] Failed to fill template");
      res.status(500).json({ error: "Failed to fill template" });
    }
  }
);

export default router;
