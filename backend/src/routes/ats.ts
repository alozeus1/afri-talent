import { Router, Request, Response } from "express";
import { ATSProvider, ATSConnectionStatus, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { encryptString } from "../lib/secure-string.js";
import logger from "../lib/logger.js";
import {
  createAtsAuditLog,
  getAtsConnectionDetailForEmployer,
  getAtsConnectionLogs,
  getEmployerAtsDashboard,
  listEmployerAtsConnections,
  refreshConnectionHealth,
  retryAtsConnectionSync,
  runAtsConnectionSync,
  runAtsConnectionTest,
} from "../lib/ats/service.js";

const router = Router();

router.use(authenticate, authorize(Role.EMPLOYER));

const optionalTrimmedString = (minimumLength = 1) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().min(minimumLength).optional(),
  );

const connectSchema = z.object({
  provider: z.nativeEnum(ATSProvider),
  externalOrgId: z.string().trim().min(2).max(255),
  displayName: optionalTrimmedString(2),
  accessToken: optionalTrimmedString(8),
  refreshToken: optionalTrimmedString(8),
  webhookSecret: optionalTrimmedString(6),
  webhookSyncEnabled: z.boolean().optional(),
  twoWaySyncEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateConnectionSchema = z.object({
  externalOrgId: z.string().trim().min(2).max(255).optional(),
  displayName: optionalTrimmedString(2),
  accessToken: optionalTrimmedString(8),
  refreshToken: optionalTrimmedString(8),
  webhookSecret: optionalTrimmedString(6),
  clearAccessToken: z.boolean().optional(),
  clearRefreshToken: z.boolean().optional(),
  clearWebhookSecret: z.boolean().optional(),
  webhookSyncEnabled: z.boolean().optional(),
  twoWaySyncEnabled: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

async function getEmployerId(userId: string): Promise<string | null> {
  const employer = await prisma.employer.findUnique({
    where: { userId },
    select: { id: true },
  });

  return employer?.id ?? null;
}

router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const dashboard = await getEmployerAtsDashboard(employerId, getBaseUrl(req));
    res.json(dashboard);
  } catch (error) {
    logger.error({ error }, "ATS dashboard failed");
    res.status(500).json({ error: "Failed to load ATS dashboard" });
  }
});

router.get("/connections", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connections = await listEmployerAtsConnections(employerId, getBaseUrl(req));
    res.json(connections);
  } catch (error) {
    logger.error({ error }, "List ATS connections failed");
    res.status(500).json({ error: "Failed to load ATS connections" });
  }
});

router.post("/connections", async (req: Request, res: Response) => {
  try {
    const payload = connectSchema.parse(req.body);
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.upsert({
      where: {
        employerId_provider_externalOrgId: {
          employerId,
          provider: payload.provider,
          externalOrgId: payload.externalOrgId,
        },
      },
      create: {
        employerId,
        provider: payload.provider,
        externalOrgId: payload.externalOrgId,
        displayName: payload.displayName,
        encryptedAccessToken: payload.accessToken ? encryptString(payload.accessToken) : null,
        encryptedRefreshToken: payload.refreshToken ? encryptString(payload.refreshToken) : null,
        encryptedWebhookSecret: payload.webhookSecret ? encryptString(payload.webhookSecret) : null,
        webhookSyncEnabled: payload.webhookSyncEnabled ?? false,
        twoWaySyncEnabled: payload.twoWaySyncEnabled ?? false,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status: ATSConnectionStatus.ACTIVE,
      },
      update: {
        displayName: payload.displayName ?? undefined,
        encryptedAccessToken: payload.accessToken ? encryptString(payload.accessToken) : undefined,
        encryptedRefreshToken: payload.refreshToken ? encryptString(payload.refreshToken) : undefined,
        encryptedWebhookSecret: payload.webhookSecret ? encryptString(payload.webhookSecret) : undefined,
        webhookSyncEnabled: payload.webhookSyncEnabled ?? undefined,
        twoWaySyncEnabled: payload.twoWaySyncEnabled ?? undefined,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status: ATSConnectionStatus.ACTIVE,
      },
    });

    await refreshConnectionHealth(connection.id);
    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      actionType: "CONNECTION_SAVED",
      reasonCode: "ats_connection_saved",
      summary: `Saved ${payload.provider} integration for ${payload.externalOrgId}.`,
      metadata: {
        webhookSyncEnabled: payload.webhookSyncEnabled ?? false,
        twoWaySyncEnabled: payload.twoWaySyncEnabled ?? false,
      },
    });

    const detail = await getAtsConnectionDetailForEmployer({
      connectionId: connection.id,
      employerId,
      baseUrl: getBaseUrl(req),
    });

    res.status(201).json(detail);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }

    logger.error({ error }, "Create ATS connection failed");
    res.status(500).json({ error: "Failed to save ATS connection" });
  }
});

router.put("/connections/:id", async (req: Request, res: Response) => {
  try {
    const payload = updateConnectionSchema.parse(req.body);
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: {
        id: req.params.id,
        employerId,
      },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: {
        externalOrgId: payload.externalOrgId ?? undefined,
        displayName: payload.displayName ?? undefined,
        encryptedAccessToken: payload.clearAccessToken
          ? null
          : payload.accessToken
            ? encryptString(payload.accessToken)
            : undefined,
        encryptedRefreshToken: payload.clearRefreshToken
          ? null
          : payload.refreshToken
            ? encryptString(payload.refreshToken)
            : undefined,
        encryptedWebhookSecret: payload.clearWebhookSecret
          ? null
          : payload.webhookSecret
            ? encryptString(payload.webhookSecret)
            : undefined,
        webhookSyncEnabled: payload.webhookSyncEnabled ?? undefined,
        twoWaySyncEnabled: payload.twoWaySyncEnabled ?? undefined,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
        status: ATSConnectionStatus.ACTIVE,
      },
    });

    await refreshConnectionHealth(connection.id);
    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      actionType: "CONNECTION_UPDATED",
      reasonCode: "ats_connection_updated",
      summary: `Updated ${connection.provider} integration settings.`,
      metadata: {
        clearedAccessToken: payload.clearAccessToken ?? false,
        clearedRefreshToken: payload.clearRefreshToken ?? false,
        clearedWebhookSecret: payload.clearWebhookSecret ?? false,
        webhookSyncEnabled: payload.webhookSyncEnabled ?? connection.webhookSyncEnabled,
        twoWaySyncEnabled: payload.twoWaySyncEnabled ?? connection.twoWaySyncEnabled,
      },
    });

    const detail = await getAtsConnectionDetailForEmployer({
      connectionId: connection.id,
      employerId,
      baseUrl: getBaseUrl(req),
    });

    res.json(detail);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }

    logger.error({ error }, "Update ATS connection failed");
    res.status(500).json({ error: "Failed to update ATS connection" });
  }
});

router.get("/connections/:id/logs", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const logs = await getAtsConnectionLogs({
      connectionId: req.params.id,
      employerId,
      baseUrl: getBaseUrl(req),
    });

    if (!logs) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    res.json(logs);
  } catch (error) {
    logger.error({ error }, "ATS logs failed");
    res.status(500).json({ error: "Failed to load ATS logs" });
  }
});

router.post("/connections/:id/test", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: { id: req.params.id, employerId },
      select: { id: true },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    const result = await runAtsConnectionTest({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      correlationId: req.requestId ?? null,
    });

    const detail = await getAtsConnectionDetailForEmployer({
      connectionId: connection.id,
      employerId,
      baseUrl: getBaseUrl(req),
    });

    res.json({
      ...result,
      connection: detail,
    });
  } catch (error) {
    logger.error({ error }, "ATS connection test failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Connection test failed" });
  }
});

router.post("/connections/:id/sync", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: { id: req.params.id, employerId },
      select: { id: true },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    const result = await runAtsConnectionSync({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      correlationId: req.requestId ?? null,
      trigger: "MANUAL",
      direction: "IMPORT",
      syncType: "JOB_IMPORT",
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, "ATS sync failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run ATS sync" });
  }
});

router.post("/connections/:id/retry", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: { id: req.params.id, employerId },
      select: { id: true },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    const result = await retryAtsConnectionSync({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      correlationId: req.requestId ?? null,
    });

    res.json(result);
  } catch (error) {
    logger.error({ error }, "ATS retry failed");
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to retry ATS sync" });
  }
});

router.delete("/connections/:id", async (req: Request, res: Response) => {
  try {
    const employerId = await getEmployerId(req.user!.userId);
    if (!employerId) {
      res.status(404).json({ error: "Employer profile not found" });
      return;
    }

    const connection = await prisma.aTSConnection.findFirst({
      where: {
        id: req.params.id,
        employerId,
      },
    });

    if (!connection) {
      res.status(404).json({ error: "ATS connection not found" });
      return;
    }

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: {
        status: ATSConnectionStatus.DISCONNECTED,
        healthStatus: "NEEDS_ATTENTION",
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: req.user!.userId,
      actionType: "CONNECTION_DISCONNECTED",
      reasonCode: "ats_connection_disconnected",
      summary: `Disconnected ${connection.provider} integration.`,
    });

    res.json({ message: "ATS connection disconnected" });
  } catch (error) {
    logger.error({ error }, "Delete ATS connection failed");
    res.status(500).json({ error: "Failed to disconnect ATS connection" });
  }
});

export default router;
