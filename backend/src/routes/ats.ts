import { Router, Request, Response } from "express";
import { ATSProvider, ATSConnectionStatus, ATSSyncStatus, JobStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { decryptString, encryptString } from "../lib/secure-string.js";
import { fetchAtsJobs } from "../lib/ats/providers.js";
import logger from "../lib/logger.js";

const router = Router();

const connectSchema = z.object({
  provider: z.nativeEnum(ATSProvider),
  externalOrgId: z.string().min(2).max(255),
  accessToken: z.string().min(10).optional(),
  refreshToken: z.string().min(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug || `job-${Date.now()}`;
  let index = 1;
  while (await prisma.job.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }
  return slug;
}

router.get("/connections", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connections = await prisma.aTSConnection.findMany({
      where: { employerId: employer.id },
      include: {
        syncRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      connections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        externalOrgId: connection.externalOrgId,
        status: connection.status,
        metadata: connection.metadata,
        lastSyncedAt: connection.lastSyncedAt,
        lastSyncRun: connection.syncRuns[0] || null,
        createdAt: connection.createdAt,
      })),
    );
  } catch (error) {
    logger.error({ error }, "List ATS connections failed");
    res.status(500).json({ error: "Failed to load ATS connections" });
  }
});

router.post("/connections", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const payload = connectSchema.parse(req.body);
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.upsert({
      where: {
        employerId_provider_externalOrgId: {
          employerId: employer.id,
          provider: payload.provider,
          externalOrgId: payload.externalOrgId,
        },
      },
      create: {
        employerId: employer.id,
        provider: payload.provider,
        externalOrgId: payload.externalOrgId,
        encryptedAccessToken: payload.accessToken ? encryptString(payload.accessToken) : null,
        encryptedRefreshToken: payload.refreshToken ? encryptString(payload.refreshToken) : null,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status: ATSConnectionStatus.ACTIVE,
      },
      update: {
        encryptedAccessToken: payload.accessToken ? encryptString(payload.accessToken) : undefined,
        encryptedRefreshToken: payload.refreshToken ? encryptString(payload.refreshToken) : undefined,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status: ATSConnectionStatus.ACTIVE,
      },
    });

    res.status(201).json({
      id: connection.id,
      provider: connection.provider,
      externalOrgId: connection.externalOrgId,
      status: connection.status,
      metadata: connection.metadata,
      createdAt: connection.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Create ATS connection failed");
    res.status(500).json({ error: "Failed to save ATS connection" });
  }
});

router.delete("/connections/:id", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: {
        id: req.params.id,
        employerId: employer.id,
      },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: { status: ATSConnectionStatus.DISCONNECTED },
    });

    res.json({ message: "ATS connection disconnected" });
  } catch (error) {
    logger.error({ error }, "Delete ATS connection failed");
    res.status(500).json({ error: "Failed to disconnect ATS connection" });
  }
});

router.post("/connections/:id/sync", authenticate, authorize(Role.EMPLOYER), async (req: Request, res: Response) => {
  try {
    const employer = await prisma.employer.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });

    if (!employer) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: { id: req.params.id, employerId: employer.id },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    const syncRun = await prisma.aTSSyncRun.create({
      data: {
        connectionId: connection.id,
        status: ATSSyncStatus.RUNNING,
      },
    });

    try {
      const jobs = await fetchAtsJobs({
        provider: connection.provider,
        externalOrgId: connection.externalOrgId,
        accessToken: decryptString(connection.encryptedAccessToken),
      });

      let createdJobs = 0;
      let updatedJobs = 0;
      let dedupedJobs = 0;

      for (const job of jobs) {
        const sourceId = `${connection.provider.toLowerCase()}-${job.externalId}`;
        const existing = await prisma.job.findFirst({
          where: {
            employerId: employer.id,
            sourceId,
          },
          select: { id: true, slug: true },
        });

        const data = {
          title: job.title,
          description: job.description || "Imported from ATS",
          location: job.location || "Remote",
          type: job.type || "FULL_TIME",
          seniority: job.seniority || "Mid-level",
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency,
          tags: job.tags,
          status: JobStatus.PUBLISHED,
          publishedAt: job.postedAt || new Date(),
          visaSponsorship: job.visaSponsorship,
          relocationAssistance: job.relocationAssistance,
          eligibleCountries: job.eligibleCountries,
          jobSource: "EMPLOYER_POSTED" as const,
          sourceUrl: job.sourceUrl,
          sourceId,
          sourceName: connection.provider,
          expiresAt: job.expiresAt || null,
          lastCheckedAt: new Date(),
          isExpired: false,
          employerId: employer.id,
        };

        if (existing) {
          await prisma.job.update({
            where: { id: existing.id },
            data,
          });
          updatedJobs += 1;
          continue;
        }

        const baseSlug = slugify(`${job.title}-${connection.provider.toLowerCase()}`);
        const slug = await ensureUniqueSlug(baseSlug);
        try {
          await prisma.job.create({
            data: {
              ...data,
              slug,
            },
          });
          createdJobs += 1;
        } catch {
          dedupedJobs += 1;
        }
      }

      await prisma.aTSConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncedAt: new Date(),
          status: ATSConnectionStatus.ACTIVE,
        },
      });

      await prisma.aTSSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: ATSSyncStatus.SUCCESS,
          finishedAt: new Date(),
          pulledJobs: jobs.length,
          createdJobs,
          updatedJobs,
          dedupedJobs,
        },
      });

      res.json({
        syncRunId: syncRun.id,
        pulledJobs: jobs.length,
        createdJobs,
        updatedJobs,
        dedupedJobs,
      });
    } catch (syncError) {
      await prisma.aTSConnection.update({
        where: { id: connection.id },
        data: { status: ATSConnectionStatus.ERROR },
      });

      await prisma.aTSSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: ATSSyncStatus.FAILED,
          finishedAt: new Date(),
          errorCount: 1,
          errors: [{ message: syncError instanceof Error ? syncError.message : "Sync failed" }],
        },
      });

      res.status(500).json({
        error: syncError instanceof Error ? syncError.message : "ATS sync failed",
      });
    }
  } catch (error) {
    logger.error({ error }, "ATS sync failed");
    res.status(500).json({ error: "Failed to run ATS sync" });
  }
});

export default router;
