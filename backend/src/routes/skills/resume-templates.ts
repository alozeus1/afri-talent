import { Router, Request, Response } from "express";
import { z } from "zod";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authenticate, authorize } from "../../middleware/auth.js";
import { skillsLimiter } from "../../middleware/security.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { getUserEntitlements } from "../../lib/billing/entitlements.js";
import { Role, SubscriptionPlan } from "@prisma/client";

const router = Router();

const BUCKET = process.env.S3_UPLOADS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const DOWNLOAD_URL_EXPIRY_SECONDS = 300; // 5 minutes

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
  skillsLimiter,
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

      const enriched = templates.map((t) => {
        const planRank: Record<SubscriptionPlan, number> = {
          FREE: 0,
          BASIC: 1,
          PROFESSIONAL: 2,
          EMPLOYER_FREE: 0,
          EMPLOYER_BASIC: 1,
          EMPLOYER_PREMIUM: 2,
        };
        const isLocked = planRank[plan] < planRank[t.minPlan];

        return {
          id: t.id,
          name: t.name,
          description: t.description,
          thumbnailUrl: t.thumbnailUrl,
          tags: t.tags,
          bestFor: t.bestFor,
          minPlan: t.minPlan,
          sortOrder: t.sortOrder,
          files: t.files,
          isLocked,
          totalDownloads: t._count.downloads,
        };
      });

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
  skillsLimiter,
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

export default router;
