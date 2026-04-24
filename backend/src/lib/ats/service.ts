import {
  ApplicationStatus,
  ATSApplicationLinkStatus,
  ATSConnectionStatus,
  ATSHealthStatus,
  ATSProvider,
  ATSSyncStatus,
  ATSWebhookEventStatus,
  JobStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../prisma.js";
import { decryptString } from "../secure-string.js";
import { createUserNotification } from "../notifications.js";
import { recordOpsEvent } from "../ops/events.js";
import { pushDeadLetter, withRetry } from "../ops/resilience.js";
import {
  defaultStageLabelForApplicationStatus,
  fetchAtsJobs,
  getAtsProviderCapabilities,
  mapExternalStageToApplicationStatus,
  normalizeAtsWebhookPayload,
  providerLabel,
  pushAtsCandidateStageUpdate,
  verifyAtsWebhookSignature,
} from "./providers.js";

type ATSConnectionRecord = Prisma.ATSConnectionGetPayload<{
  include: {
    syncRuns: true;
  };
}>;

interface AtsHealthInput {
  status: ATSConnectionStatus;
  accessTokenPresent: boolean;
  webhookSecretPresent: boolean;
  jobImportReady: boolean;
  stageMappingsReady: boolean;
  serviceUserReady: boolean;
  webhookSyncEnabled: boolean;
  twoWaySyncEnabled: boolean;
  lastConnectionTestOk: boolean | null;
  lastSuccessfulSyncAt: Date | null;
  consecutiveFailures: number;
  lastErrorMessage: string | null;
}

interface ConnectionCredentialState {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasWebhookSecret: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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

function getConnectionMetadata(metadata: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return asRecord(metadata);
}

function getConnectionCredentialState(connection: {
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  encryptedWebhookSecret: string | null;
}): ConnectionCredentialState {
  return {
    hasAccessToken: Boolean(connection.encryptedAccessToken),
    hasRefreshToken: Boolean(connection.encryptedRefreshToken),
    hasWebhookSecret: Boolean(connection.encryptedWebhookSecret),
  };
}

function getStageMappings(metadata: Record<string, unknown>): Record<string, string> {
  const raw = asRecord(metadata.stageMappings);
  return Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""])
      .filter(([, value]) => value.length > 0),
  );
}

function hasServiceUser(metadata: Record<string, unknown>): boolean {
  return typeof metadata.performAsUserId === "string" && metadata.performAsUserId.trim().length > 0;
}

export function deriveAtsHealthStatus(input: AtsHealthInput): ATSHealthStatus {
  if (input.status === ATSConnectionStatus.ERROR || input.consecutiveFailures >= 3) {
    return ATSHealthStatus.DOWN;
  }

  if (
    !input.jobImportReady
    || (input.webhookSyncEnabled && !input.webhookSecretPresent)
    || (input.twoWaySyncEnabled && (!input.accessTokenPresent || !input.stageMappingsReady || !input.serviceUserReady))
  ) {
    return ATSHealthStatus.NEEDS_ATTENTION;
  }

  if (input.lastConnectionTestOk === false || input.consecutiveFailures > 0 || Boolean(input.lastErrorMessage)) {
    return ATSHealthStatus.DEGRADED;
  }

  if (input.lastSuccessfulSyncAt || input.lastConnectionTestOk === true || (!input.webhookSyncEnabled && !input.twoWaySyncEnabled)) {
    return ATSHealthStatus.HEALTHY;
  }

  return ATSHealthStatus.NEEDS_ATTENTION;
}

export async function createAtsAuditLog(input: {
  connectionId: string;
  actorUserId?: string | null;
  actionType: string;
  reasonCode?: string | null;
  summary: string;
  syncRunId?: string | null;
  webhookEventId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await prisma.aTSConnectionAuditLog.create({
    data: {
      connectionId: input.connectionId,
      actorUserId: input.actorUserId ?? null,
      actionType: input.actionType,
      reasonCode: input.reasonCode ?? null,
      summary: input.summary,
      syncRunId: input.syncRunId ?? null,
      webhookEventId: input.webhookEventId ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function buildConnectionBaseUrl(baseUrl: string, provider: string, connectionId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/ats/webhooks/${provider}/${connectionId}`;
}

function serializeConnection(connection: ATSConnectionRecord, baseUrl: string, recentLogSummary?: {
  failedSyncRuns: number;
  failedWebhookEvents: number;
  pendingApplicationLinks: number;
}) {
  const metadata = getConnectionMetadata(connection.metadata);
  const credentials = getConnectionCredentialState(connection);
  const capabilities = getAtsProviderCapabilities({
    provider: connection.provider,
    accessTokenPresent: credentials.hasAccessToken,
    webhookSecretPresent: credentials.hasWebhookSecret,
    metadata,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    webhookSyncEnabled: connection.webhookSyncEnabled,
  });

  return {
    id: connection.id,
    provider: connection.provider,
    providerLabel: providerLabel(connection.provider),
    displayName: connection.displayName,
    externalOrgId: connection.externalOrgId,
    status: connection.status,
    healthStatus: connection.healthStatus,
    metadata,
    credentials,
    webhookSyncEnabled: connection.webhookSyncEnabled,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    lastSyncedAt: connection.lastSyncedAt,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
    lastConnectionTestAt: connection.lastConnectionTestAt,
    lastConnectionTestOk: connection.lastConnectionTestOk,
    lastWebhookAt: connection.lastWebhookAt,
    lastErrorAt: connection.lastErrorAt,
    lastErrorMessage: connection.lastErrorMessage,
    consecutiveFailures: connection.consecutiveFailures,
    capabilities,
    recentLogSummary: recentLogSummary ?? {
      failedSyncRuns: 0,
      failedWebhookEvents: 0,
      pendingApplicationLinks: 0,
    },
    lastSyncRun: connection.syncRuns[0] || null,
    webhookUrl: buildConnectionBaseUrl(baseUrl, connection.provider, connection.id),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function refreshConnectionHealth(connectionId: string): Promise<void> {
  const connection = await prisma.aTSConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection) {
    return;
  }

  const metadata = getConnectionMetadata(connection.metadata);
  const credentials = getConnectionCredentialState(connection);
  const capabilities = getAtsProviderCapabilities({
    provider: connection.provider,
    accessTokenPresent: credentials.hasAccessToken,
    webhookSecretPresent: credentials.hasWebhookSecret,
    metadata,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    webhookSyncEnabled: connection.webhookSyncEnabled,
  });
  const healthStatus = deriveAtsHealthStatus({
    status: connection.status,
    accessTokenPresent: credentials.hasAccessToken,
    webhookSecretPresent: credentials.hasWebhookSecret,
    jobImportReady: capabilities.jobImportReady,
    stageMappingsReady: Object.keys(getStageMappings(metadata)).length > 0,
    serviceUserReady: hasServiceUser(metadata),
    webhookSyncEnabled: connection.webhookSyncEnabled,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    lastConnectionTestOk: connection.lastConnectionTestOk,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
    consecutiveFailures: connection.consecutiveFailures,
    lastErrorMessage: connection.lastErrorMessage,
  });

  if (healthStatus !== connection.healthStatus) {
    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: { healthStatus },
    });
  }
}

export async function listEmployerAtsConnections(employerId: string, baseUrl: string) {
  const connections = await prisma.aTSConnection.findMany({
    where: { employerId },
    include: {
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    connections.map(async (connection) => {
      const [failedSyncRuns, failedWebhookEvents, pendingApplicationLinks] = await Promise.all([
        prisma.aTSSyncRun.count({
          where: {
            connectionId: connection.id,
            status: { in: [ATSSyncStatus.FAILED, ATSSyncStatus.PARTIAL] },
          },
        }),
        prisma.aTSWebhookEvent.count({
          where: {
            connectionId: connection.id,
            status: ATSWebhookEventStatus.FAILED,
          },
        }),
        prisma.aTSApplicationLink.count({
          where: {
            connectionId: connection.id,
            status: { in: [ATSApplicationLinkStatus.PENDING, ATSApplicationLinkStatus.MANUAL_REVIEW] },
          },
        }),
      ]);

      return serializeConnection(connection, baseUrl, {
        failedSyncRuns,
        failedWebhookEvents,
        pendingApplicationLinks,
      });
    }),
  );
}

export async function getEmployerAtsDashboard(employerId: string, baseUrl: string) {
  const connections = await listEmployerAtsConnections(employerId, baseUrl);

  const providerBreakdown = Object.values(
    connections.reduce<Record<string, {
      provider: string;
      total: number;
      healthy: number;
      degraded: number;
      down: number;
      needsAttention: number;
    }>>((acc, connection) => {
      const current = acc[connection.provider] ?? {
        provider: connection.provider,
        total: 0,
        healthy: 0,
        degraded: 0,
        down: 0,
        needsAttention: 0,
      };
      current.total += 1;
      if (connection.healthStatus === ATSHealthStatus.HEALTHY) current.healthy += 1;
      if (connection.healthStatus === ATSHealthStatus.DEGRADED) current.degraded += 1;
      if (connection.healthStatus === ATSHealthStatus.DOWN) current.down += 1;
      if (connection.healthStatus === ATSHealthStatus.NEEDS_ATTENTION) current.needsAttention += 1;
      acc[connection.provider] = current;
      return acc;
    }, {}),
  );

  return {
    summary: {
      totalConnections: connections.length,
      healthyConnections: connections.filter((item) => item.healthStatus === ATSHealthStatus.HEALTHY).length,
      degradedConnections: connections.filter((item) => item.healthStatus === ATSHealthStatus.DEGRADED).length,
      downConnections: connections.filter((item) => item.healthStatus === ATSHealthStatus.DOWN).length,
      needsAttentionConnections: connections.filter((item) => item.healthStatus === ATSHealthStatus.NEEDS_ATTENTION).length,
      webhookEnabledConnections: connections.filter((item) => item.webhookSyncEnabled).length,
      twoWayEnabledConnections: connections.filter((item) => item.twoWaySyncEnabled).length,
      failedSyncRuns: connections.reduce((sum, item) => sum + item.recentLogSummary.failedSyncRuns, 0),
      failedWebhookEvents: connections.reduce((sum, item) => sum + item.recentLogSummary.failedWebhookEvents, 0),
    },
    providerBreakdown,
    connections,
  };
}

export async function getAtsConnectionDetailForEmployer(params: {
  connectionId: string;
  employerId: string;
  baseUrl: string;
}) {
  const connection = await prisma.aTSConnection.findFirst({
    where: {
      id: params.connectionId,
      employerId: params.employerId,
    },
    include: {
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!connection) {
    return null;
  }

  const [failedSyncRuns, failedWebhookEvents, pendingApplicationLinks] = await Promise.all([
    prisma.aTSSyncRun.count({
      where: {
        connectionId: connection.id,
        status: { in: [ATSSyncStatus.FAILED, ATSSyncStatus.PARTIAL] },
      },
    }),
    prisma.aTSWebhookEvent.count({
      where: {
        connectionId: connection.id,
        status: ATSWebhookEventStatus.FAILED,
      },
    }),
    prisma.aTSApplicationLink.count({
      where: {
        connectionId: connection.id,
        status: { in: [ATSApplicationLinkStatus.PENDING, ATSApplicationLinkStatus.MANUAL_REVIEW] },
      },
    }),
  ]);

  return serializeConnection(connection, params.baseUrl, {
    failedSyncRuns,
    failedWebhookEvents,
    pendingApplicationLinks,
  });
}

export async function getAtsConnectionLogs(params: {
  connectionId: string;
  employerId: string;
  baseUrl: string;
}) {
  const connection = await getAtsConnectionDetailForEmployer(params);
  if (!connection) {
    return null;
  }

  const [syncRuns, webhookEvents, auditLogs, applicationLinks] = await Promise.all([
    prisma.aTSSyncRun.findMany({
      where: { connectionId: params.connectionId },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.aTSWebhookEvent.findMany({
      where: { connectionId: params.connectionId },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
    prisma.aTSConnectionAuditLog.findMany({
      where: { connectionId: params.connectionId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.aTSApplicationLink.findMany({
      where: { connectionId: params.connectionId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        application: {
          include: {
            candidate: {
              select: { id: true, name: true, email: true },
            },
            job: {
              select: { id: true, title: true, slug: true },
            },
          },
        },
      },
    }),
  ]);

  const linkStats = {
    total: await prisma.aTSApplicationLink.count({ where: { connectionId: params.connectionId } }),
    synced: await prisma.aTSApplicationLink.count({
      where: { connectionId: params.connectionId, status: ATSApplicationLinkStatus.SYNCED },
    }),
    pending: await prisma.aTSApplicationLink.count({
      where: { connectionId: params.connectionId, status: ATSApplicationLinkStatus.PENDING },
    }),
    manualReview: await prisma.aTSApplicationLink.count({
      where: { connectionId: params.connectionId, status: ATSApplicationLinkStatus.MANUAL_REVIEW },
    }),
    failed: await prisma.aTSApplicationLink.count({
      where: { connectionId: params.connectionId, status: ATSApplicationLinkStatus.FAILED },
    }),
  };

  return {
    connection,
    syncRuns,
    webhookEvents,
    auditLogs,
    applicationLinks: {
      stats: linkStats,
      recent: applicationLinks,
    },
  };
}

export async function runAtsConnectionTest(params: {
  connectionId: string;
  actorUserId?: string | null;
  correlationId?: string | null;
}) {
  const connection = await prisma.aTSConnection.findUnique({
    where: { id: params.connectionId },
  });

  if (!connection) {
    throw new Error("ATS connection not found");
  }

  const metadata = getConnectionMetadata(connection.metadata);
  const credentials = getConnectionCredentialState(connection);
  const capabilities = getAtsProviderCapabilities({
    provider: connection.provider,
    accessTokenPresent: credentials.hasAccessToken,
    webhookSecretPresent: credentials.hasWebhookSecret,
    metadata,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    webhookSyncEnabled: connection.webhookSyncEnabled,
  });
  const stageMappingsReady = Object.keys(getStageMappings(metadata)).length > 0;
  const serviceUserReady = hasServiceUser(metadata);
  const warnings = [...capabilities.notes];
  let sampleJobCount = 0;
  let ok = false;
  let lastErrorMessage: string | null = null;

  try {
    const jobs = await withRetry(
      () => fetchAtsJobs({
        provider: connection.provider,
        externalOrgId: connection.externalOrgId,
        accessToken: decryptString(connection.encryptedAccessToken),
      }),
      {
        operationName: `ats_${connection.provider.toLowerCase()}_connection_test`,
        attempts: 2,
        initialDelayMs: 300,
      },
    );
    sampleJobCount = jobs.length;
    ok = capabilities.jobImportReady;
  } catch (error) {
    lastErrorMessage = error instanceof Error ? error.message : "Connection test failed";
    warnings.push(lastErrorMessage);
  }

  const healthStatus = deriveAtsHealthStatus({
    status: ok ? ATSConnectionStatus.ACTIVE : ATSConnectionStatus.ERROR,
    accessTokenPresent: credentials.hasAccessToken,
    webhookSecretPresent: credentials.hasWebhookSecret,
    jobImportReady: capabilities.jobImportReady,
    stageMappingsReady,
    serviceUserReady,
    webhookSyncEnabled: connection.webhookSyncEnabled,
    twoWaySyncEnabled: connection.twoWaySyncEnabled,
    lastConnectionTestOk: ok,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
    consecutiveFailures: ok ? 0 : connection.consecutiveFailures,
    lastErrorMessage,
  });

  await prisma.aTSConnection.update({
    where: { id: connection.id },
    data: {
      status: ok ? ATSConnectionStatus.ACTIVE : ATSConnectionStatus.ERROR,
      healthStatus,
      lastConnectionTestAt: new Date(),
      lastConnectionTestOk: ok,
      lastErrorAt: ok ? null : new Date(),
      lastErrorMessage,
      consecutiveFailures: ok ? 0 : connection.consecutiveFailures + 1,
    },
  });

  await createAtsAuditLog({
    connectionId: connection.id,
    actorUserId: params.actorUserId ?? null,
    actionType: "CONNECTION_TEST",
    reasonCode: ok ? "connection_test_passed" : "connection_test_failed",
    summary: ok
      ? `Connection test passed for ${providerLabel(connection.provider)}.`
      : `Connection test failed for ${providerLabel(connection.provider)}.`,
    metadata: {
      warnings,
      sampleJobCount,
      correlationId: params.correlationId ?? null,
    },
  });

  recordOpsEvent({
    metricName: "ats_connection_test",
    category: "integrations",
    outcome: ok ? "success" : "failure",
    severity: ok ? "info" : "warning",
    owner: "integrations",
    details: {
      provider: connection.provider,
      sample_jobs: sampleJobCount,
      health_status: healthStatus,
    },
  });

  return {
    ok,
    healthStatus,
    sampleJobCount,
    warnings,
    capabilities,
  };
}

async function importJobsFromConnection(params: {
  connectionId: string;
  employerId: string;
  provider: ATSProvider;
  externalOrgId: string;
  accessToken?: string | null;
}) {
  const startedAt = Date.now();
  const jobs = await withRetry(
    () => fetchAtsJobs({
      provider: params.provider,
      externalOrgId: params.externalOrgId,
      accessToken: params.accessToken,
    }),
    {
      operationName: `ats_${params.provider.toLowerCase()}_job_import`,
      attempts: 3,
      initialDelayMs: 400,
    },
  );

  let createdJobs = 0;
  let updatedJobs = 0;
  let dedupedJobs = 0;

  for (const job of jobs) {
    const sourceId = `${params.provider.toLowerCase()}-${job.externalId}`;
    const existing = await prisma.job.findFirst({
      where: {
        employerId: params.employerId,
        sourceId,
      },
      select: {
        id: true,
      },
    });

    const lineage = {
      provider: params.provider,
      connectionId: params.connectionId,
      externalId: job.externalId,
      sourceUrl: job.sourceUrl,
      syncedAt: new Date().toISOString(),
      rawData: job.rawData ?? null,
    };

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
      sourceName: params.provider,
      expiresAt: job.expiresAt || null,
      lastCheckedAt: new Date(),
      isExpired: false,
      employerId: params.employerId,
      sourceFirstSeenAt: existing ? undefined : new Date(),
      sourceLastSeenAt: new Date(),
      sourceLineage: lineage as Prisma.InputJsonValue,
    };

    if (existing) {
      await prisma.job.update({
        where: { id: existing.id },
        data,
      });
      updatedJobs += 1;
      continue;
    }

    const baseSlug = slugify(`${job.title}-${params.provider.toLowerCase()}`);
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

  recordOpsEvent({
    metricName: "ats_job_import",
    category: "integrations",
    outcome: "success",
    severity: "info",
    owner: "integrations",
    durationMs: Date.now() - startedAt,
    details: {
      provider: params.provider,
      pulled_jobs: jobs.length,
      created_jobs: createdJobs,
      updated_jobs: updatedJobs,
      deduped_jobs: dedupedJobs,
    },
  });

  return {
    pulledJobs: jobs.length,
    createdJobs,
    updatedJobs,
    dedupedJobs,
  };
}

export async function runAtsConnectionSync(params: {
  connectionId: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  trigger?: string;
  direction?: string;
  syncType?: string;
  retryCount?: number;
}) {
  const connection = await prisma.aTSConnection.findUnique({
    where: { id: params.connectionId },
  });

  if (!connection) {
    throw new Error("ATS connection not found");
  }

  if (connection.status === ATSConnectionStatus.DISCONNECTED) {
    throw new Error("ATS connection is disconnected");
  }

  const syncRun = await prisma.aTSSyncRun.create({
    data: {
      connectionId: connection.id,
      status: ATSSyncStatus.RUNNING,
      syncType: params.syncType ?? "JOB_IMPORT",
      direction: params.direction ?? "IMPORT",
      trigger: params.trigger ?? "MANUAL",
      correlationId: params.correlationId ?? null,
      retryCount: params.retryCount ?? 0,
    },
  });

  await createAtsAuditLog({
    connectionId: connection.id,
    actorUserId: params.actorUserId ?? null,
    actionType: "SYNC_STARTED",
    reasonCode: "ats_sync_started",
    summary: `Started ${syncRun.syncType.toLowerCase().replace(/_/g, " ")} sync for ${providerLabel(connection.provider)}.`,
    syncRunId: syncRun.id,
    metadata: {
      direction: syncRun.direction,
      trigger: syncRun.trigger,
      correlationId: syncRun.correlationId,
    },
  });

  try {
    const summary = await importJobsFromConnection({
      connectionId: connection.id,
      employerId: connection.employerId,
      provider: connection.provider,
      externalOrgId: connection.externalOrgId,
      accessToken: decryptString(connection.encryptedAccessToken),
    });

    const metadata = getConnectionMetadata(connection.metadata);
    const credentials = getConnectionCredentialState(connection);
    const capabilities = getAtsProviderCapabilities({
      provider: connection.provider,
      accessTokenPresent: credentials.hasAccessToken,
      webhookSecretPresent: credentials.hasWebhookSecret,
      metadata,
      twoWaySyncEnabled: connection.twoWaySyncEnabled,
      webhookSyncEnabled: connection.webhookSyncEnabled,
    });
    const healthStatus = deriveAtsHealthStatus({
      status: ATSConnectionStatus.ACTIVE,
      accessTokenPresent: credentials.hasAccessToken,
      webhookSecretPresent: credentials.hasWebhookSecret,
      jobImportReady: capabilities.jobImportReady,
      stageMappingsReady: Object.keys(getStageMappings(metadata)).length > 0,
      serviceUserReady: hasServiceUser(metadata),
      webhookSyncEnabled: connection.webhookSyncEnabled,
      twoWaySyncEnabled: connection.twoWaySyncEnabled,
      lastConnectionTestOk: connection.lastConnectionTestOk,
      lastSuccessfulSyncAt: new Date(),
      consecutiveFailures: 0,
      lastErrorMessage: null,
    });

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncedAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        status: ATSConnectionStatus.ACTIVE,
        healthStatus,
        lastErrorAt: null,
        lastErrorMessage: null,
        consecutiveFailures: 0,
      },
    });

    const updatedRun = await prisma.aTSSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: ATSSyncStatus.SUCCESS,
        finishedAt: new Date(),
        pulledJobs: summary.pulledJobs,
        createdJobs: summary.createdJobs,
        updatedJobs: summary.updatedJobs,
        dedupedJobs: summary.dedupedJobs,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: params.actorUserId ?? null,
      actionType: "SYNC_COMPLETED",
      reasonCode: "ats_sync_completed",
      summary: `Completed ${updatedRun.syncType.toLowerCase().replace(/_/g, " ")} sync for ${providerLabel(connection.provider)}.`,
      syncRunId: updatedRun.id,
      metadata: summary,
    });

    return {
      syncRunId: updatedRun.id,
      ...summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ATS sync failed";

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: {
        status: ATSConnectionStatus.ERROR,
        healthStatus: ATSHealthStatus.DOWN,
        lastErrorAt: new Date(),
        lastErrorMessage: message,
        consecutiveFailures: connection.consecutiveFailures + 1,
      },
    });

    await prisma.aTSSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: ATSSyncStatus.FAILED,
        finishedAt: new Date(),
        errorCount: 1,
        errors: [{ message }] as Prisma.InputJsonValue,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: params.actorUserId ?? null,
      actionType: "SYNC_FAILED",
      reasonCode: "ats_sync_failed",
      summary: `Sync failed for ${providerLabel(connection.provider)}.`,
      syncRunId: syncRun.id,
      metadata: {
        error: message,
      },
    });

    await pushDeadLetter({
      category: "webhook",
      source: `ats:${connection.provider.toLowerCase()}:sync`,
      reasonCode: "ats_sync_failed",
      error,
      payload: {
        connectionId: connection.id,
        syncRunId: syncRun.id,
      },
    });

    recordOpsEvent({
      metricName: "ats_job_import",
      category: "integrations",
      outcome: "failure",
      severity: "warning",
      owner: "integrations",
      details: {
        provider: connection.provider,
        error: message,
      },
    });

    throw error;
  }
}

export async function retryAtsConnectionSync(params: {
  connectionId: string;
  actorUserId?: string | null;
  correlationId?: string | null;
}) {
  const latestFailure = await prisma.aTSSyncRun.findFirst({
    where: {
      connectionId: params.connectionId,
      status: { in: [ATSSyncStatus.FAILED, ATSSyncStatus.PARTIAL] },
    },
    orderBy: { startedAt: "desc" },
  });

  return runAtsConnectionSync({
    connectionId: params.connectionId,
    actorUserId: params.actorUserId ?? null,
    correlationId: params.correlationId ?? latestFailure?.correlationId ?? null,
    trigger: "RETRY",
    direction: latestFailure?.direction ?? "IMPORT",
    syncType: latestFailure?.syncType ?? "JOB_IMPORT",
    retryCount: (latestFailure?.retryCount ?? 0) + 1,
  });
}

function parseExternalJobId(sourceId: string | null | undefined, provider: string): string | null {
  if (!sourceId) {
    return null;
  }
  const prefix = `${provider.toLowerCase()}-`;
  if (!sourceId.startsWith(prefix)) {
    return sourceId;
  }
  return sourceId.slice(prefix.length) || null;
}

export async function maybeCreateAtsApplicationLink(applicationId: string): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          sourceId: true,
          sourceName: true,
          employerId: true,
        },
      },
    },
  });

  if (!application?.job.employerId || !application.job.sourceName) {
    return;
  }

  const provider = application.job.sourceName;
  if (!["GREENHOUSE", "LEVER", "WORKABLE"].includes(provider)) {
    return;
  }

  const connection = await prisma.aTSConnection.findFirst({
    where: {
      employerId: application.job.employerId,
      provider: provider as ATSProvider,
      status: { not: ATSConnectionStatus.DISCONNECTED },
    },
  });

  if (!connection) {
    return;
  }

  const externalJobId = parseExternalJobId(application.job.sourceId, provider);
  const metadata = getConnectionMetadata(connection.metadata);
  const stageMappings = getStageMappings(metadata);
  const linkStatus =
    connection.twoWaySyncEnabled && Object.keys(stageMappings).length > 0
      ? ATSApplicationLinkStatus.PENDING
      : ATSApplicationLinkStatus.MANUAL_REVIEW;

  await prisma.aTSApplicationLink.upsert({
    where: { applicationId: application.id },
    create: {
      connectionId: connection.id,
      applicationId: application.id,
      externalJobId,
      status: linkStatus,
      metadata: {
        provider,
        jobTitle: application.job.title,
      },
    },
    update: {
      connectionId: connection.id,
      externalJobId,
      status: linkStatus,
      metadata: {
        provider,
        jobTitle: application.job.title,
      },
    },
  });
}

export async function syncApplicationStatusToAts(params: {
  applicationId: string;
  actorUserId?: string | null;
  correlationId?: string | null;
}) {
  const link = await prisma.aTSApplicationLink.findUnique({
    where: { applicationId: params.applicationId },
    include: {
      connection: true,
      application: {
        include: {
          job: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!link) {
    return {
      outcome: "not_linked",
      message: "Application is not linked to an ATS connection.",
    };
  }

  const connection = link.connection;
  const metadata = getConnectionMetadata(connection.metadata);
  const stageMappings = getStageMappings(metadata);
  const targetStageId = stageMappings[link.application.status];

  const syncRun = await prisma.aTSSyncRun.create({
    data: {
      connectionId: connection.id,
      status: ATSSyncStatus.RUNNING,
      syncType: "APPLICATION_STAGE",
      direction: "EXPORT",
      trigger: "LOCAL_STATUS_CHANGE",
      correlationId: params.correlationId ?? null,
    },
  });

  if (!connection.twoWaySyncEnabled || !targetStageId) {
    const reason = !connection.twoWaySyncEnabled
      ? "Two-way sync is disabled for this connection."
      : "No stage mapping found for the current application status.";

    await prisma.aTSApplicationLink.update({
      where: { id: link.id },
      data: {
        status: ATSApplicationLinkStatus.MANUAL_REVIEW,
        lastSyncError: reason,
      },
    });

    await prisma.aTSSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: ATSSyncStatus.PARTIAL,
        finishedAt: new Date(),
        warnings: [{ message: reason }] as Prisma.InputJsonValue,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: params.actorUserId ?? null,
      actionType: "STAGE_SYNC_SKIPPED",
      reasonCode: !connection.twoWaySyncEnabled ? "two_way_sync_disabled" : "missing_stage_mapping",
      summary: `Skipped ATS stage sync for ${link.application.job.title}.`,
      syncRunId: syncRun.id,
      metadata: {
        applicationStatus: link.application.status,
        reason,
      },
    });

    return {
      outcome: "manual_review",
      message: reason,
    };
  }

  try {
    const result = await withRetry(
      () => pushAtsCandidateStageUpdate({
        provider: connection.provider,
        externalOrgId: connection.externalOrgId,
        accessToken: decryptString(connection.encryptedAccessToken),
        externalApplicationId: link.externalApplicationId,
        externalCandidateId: link.externalCandidateId,
        currentStageId: link.externalStageId,
        targetStageId,
        targetStageName: defaultStageLabelForApplicationStatus(link.application.status),
        metadata,
      }),
      {
        operationName: `ats_${connection.provider.toLowerCase()}_stage_writeback`,
        attempts: 2,
        initialDelayMs: 300,
      },
    );

    if (!result.ok) {
      await prisma.aTSApplicationLink.update({
        where: { id: link.id },
        data: {
          status: ATSApplicationLinkStatus.MANUAL_REVIEW,
          lastSyncError: result.message,
        },
      });

      await prisma.aTSSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: ATSSyncStatus.PARTIAL,
          finishedAt: new Date(),
          warnings: [{ message: result.message }] as Prisma.InputJsonValue,
        },
      });

      await createAtsAuditLog({
        connectionId: connection.id,
        actorUserId: params.actorUserId ?? null,
        actionType: "STAGE_SYNC_SKIPPED",
        reasonCode: "provider_manual_fallback",
        summary: `Provider returned manual fallback for ${link.application.job.title}.`,
        syncRunId: syncRun.id,
        metadata: {
          applicationStatus: link.application.status,
          message: result.message,
        },
      });

      return {
        outcome: "manual_review",
        message: result.message,
      };
    }

    await prisma.aTSApplicationLink.update({
      where: { id: link.id },
      data: {
        status: ATSApplicationLinkStatus.SYNCED,
        externalStageId: result.externalStageId ?? targetStageId,
        externalStageName: result.externalStageName ?? defaultStageLabelForApplicationStatus(link.application.status),
        lastOutboundSyncAt: new Date(),
        lastSyncError: null,
      },
    });

    await prisma.aTSSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: ATSSyncStatus.SUCCESS,
        finishedAt: new Date(),
        pushedCandidates: 1,
        updatedStages: 1,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: params.actorUserId ?? null,
      actionType: "STAGE_SYNC_COMPLETED",
      reasonCode: "stage_writeback_completed",
      summary: `Updated provider stage for ${link.application.job.title}.`,
      syncRunId: syncRun.id,
      metadata: {
        applicationStatus: link.application.status,
        targetStageId,
        targetStageName: result.externalStageName ?? defaultStageLabelForApplicationStatus(link.application.status),
      },
    });

    return {
      outcome: "synced",
      message: result.message,
      result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ATS stage writeback failed";

    await prisma.aTSApplicationLink.update({
      where: { id: link.id },
      data: {
        status: ATSApplicationLinkStatus.FAILED,
        lastSyncError: message,
      },
    });

    await prisma.aTSSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: ATSSyncStatus.FAILED,
        finishedAt: new Date(),
        errorCount: 1,
        errors: [{ message }] as Prisma.InputJsonValue,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actorUserId: params.actorUserId ?? null,
      actionType: "STAGE_SYNC_FAILED",
      reasonCode: "stage_writeback_failed",
      summary: `Failed to push application status to ${providerLabel(connection.provider)}.`,
      syncRunId: syncRun.id,
      metadata: {
        applicationStatus: link.application.status,
        error: message,
      },
    });

    return {
      outcome: "failed",
      message,
    };
  }
}

export async function processAtsWebhook(params: {
  provider: string;
  connectionId: string;
  rawBody: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  queryToken?: string | null;
  correlationId?: string | null;
}) {
  const provider = params.provider.toUpperCase();
  if (!["GREENHOUSE", "LEVER", "WORKABLE"].includes(provider)) {
    throw new Error("Unsupported ATS provider");
  }

  const connection = await prisma.aTSConnection.findUnique({
    where: { id: params.connectionId },
  });

  if (!connection || connection.provider !== provider) {
    throw new Error("ATS webhook connection not found");
  }

  const webhookSecret = decryptString(connection.encryptedWebhookSecret);
  if (connection.webhookSyncEnabled) {
    if (!webhookSecret) {
      throw new Error("Webhook secret is not configured");
    }

    const headerSecret = Array.isArray(params.headers["x-afritalent-ats-secret"])
      ? params.headers["x-afritalent-ats-secret"][0]
      : params.headers["x-afritalent-ats-secret"];
    const queryToken = params.queryToken ?? null;
    const greenhouseVerified = verifyAtsWebhookSignature({
      provider: connection.provider,
      secret: webhookSecret,
      rawBody: params.rawBody,
      headers: params.headers,
    });
    const sharedSecretVerified = webhookSecret === headerSecret || webhookSecret === queryToken;

    if (!greenhouseVerified && !sharedSecretVerified) {
      throw new Error("Webhook signature verification failed");
    }
  }

  const normalized = normalizeAtsWebhookPayload({
    provider: connection.provider,
    headers: params.headers,
    body: params.body,
  });

  let webhookEvent;
  try {
    webhookEvent = await prisma.aTSWebhookEvent.create({
      data: {
        connectionId: connection.id,
        provider: connection.provider,
        eventType: normalized.eventType,
        eventKey: normalized.eventKey,
        status: ATSWebhookEventStatus.RECEIVED,
        httpHeaders: params.headers as Prisma.InputJsonValue,
        payload: params.body as Prisma.InputJsonValue,
        metadata: {
          correlationId: params.correlationId ?? null,
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        duplicate: true,
        eventType: normalized.eventType,
      };
    }
    throw error;
  }

  await createAtsAuditLog({
    connectionId: connection.id,
    actionType: "WEBHOOK_RECEIVED",
    reasonCode: "ats_webhook_received",
    summary: `Received ${normalized.eventType} webhook from ${providerLabel(connection.provider)}.`,
    webhookEventId: webhookEvent.id,
    metadata: {
      eventKey: normalized.eventKey,
    },
  });

  try {
    if (normalized.shouldTriggerJobSync) {
      const syncResult = await runAtsConnectionSync({
        connectionId: connection.id,
        correlationId: params.correlationId ?? normalized.eventKey,
        trigger: "WEBHOOK",
        direction: "IMPORT",
        syncType: "JOB_IMPORT",
      });

      await prisma.aTSWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: ATSWebhookEventStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      await prisma.aTSConnection.update({
        where: { id: connection.id },
        data: {
          lastWebhookAt: new Date(),
        },
      });

      return {
        duplicate: false,
        eventType: normalized.eventType,
        syncResult,
      };
    }

    if (normalized.isStageChangeEvent) {
      const linkWhereClauses: Prisma.ATSApplicationLinkWhereInput[] = [];
      if (normalized.externalApplicationId) {
        linkWhereClauses.push({ externalApplicationId: normalized.externalApplicationId });
      }
      if (normalized.externalCandidateId) {
        linkWhereClauses.push({ externalCandidateId: normalized.externalCandidateId });
      }

      const syncRun = await prisma.aTSSyncRun.create({
        data: {
          connectionId: connection.id,
          status: ATSSyncStatus.RUNNING,
          syncType: "APPLICATION_STAGE",
          direction: "IMPORT",
          trigger: "WEBHOOK",
          correlationId: params.correlationId ?? normalized.eventKey ?? null,
        },
      });

      const link = linkWhereClauses.length > 0
        ? await prisma.aTSApplicationLink.findFirst({
          where: {
            connectionId: connection.id,
            OR: linkWhereClauses,
          },
          include: {
            application: {
              include: {
                job: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        })
        : null;

      if (!link) {
        await prisma.aTSWebhookEvent.update({
          where: { id: webhookEvent.id },
          data: {
            status: ATSWebhookEventStatus.IGNORED,
            processedAt: new Date(),
            metadata: {
              reason: "no_matching_application_link",
            },
          },
        });

        await prisma.aTSSyncRun.update({
          where: { id: syncRun.id },
          data: {
            status: ATSSyncStatus.PARTIAL,
            finishedAt: new Date(),
            warnings: [{ message: "No matching ATS application link found." }] as Prisma.InputJsonValue,
          },
        });

        return {
          duplicate: false,
          eventType: normalized.eventType,
          ignored: true,
        };
      }

      const mappedStatus = mapExternalStageToApplicationStatus(normalized.stageName);
      const shouldUpdateApplication = mappedStatus && mappedStatus !== link.application.status;

      await prisma.aTSApplicationLink.update({
        where: { id: link.id },
        data: {
          externalApplicationId: normalized.externalApplicationId ?? link.externalApplicationId,
          externalCandidateId: normalized.externalCandidateId ?? link.externalCandidateId,
          externalStageId: normalized.stageId ?? link.externalStageId,
          externalStageName: normalized.stageName ?? link.externalStageName,
          lastInboundSyncAt: new Date(),
          status: ATSApplicationLinkStatus.SYNCED,
          lastSyncError: null,
        },
      });

      if (shouldUpdateApplication && mappedStatus) {
        await prisma.application.update({
          where: { id: link.applicationId },
          data: {
            status: mappedStatus,
            notes: normalized.stageName
              ? `Updated from ${providerLabel(connection.provider)} webhook: ${normalized.stageName}.`
              : link.application.notes,
          },
        });

        await createUserNotification({
          userId: link.application.candidateId,
          type: "APPLICATION_STATUS",
          title: "Application status updated",
          body: `Your application for ${link.application.job.title} is now ${mappedStatus.toLowerCase()}.`,
          channel: "applicationUpdates",
          metadata: {
            applicationId: link.applicationId,
            status: mappedStatus,
            source: connection.provider,
          },
        });
      }

      await prisma.aTSWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: ATSWebhookEventStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      await prisma.aTSSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: ATSSyncStatus.SUCCESS,
          finishedAt: new Date(),
          processedEvents: 1,
          updatedStages: shouldUpdateApplication ? 1 : 0,
        },
      });

      await prisma.aTSConnection.update({
        where: { id: connection.id },
        data: {
          lastWebhookAt: new Date(),
          status: ATSConnectionStatus.ACTIVE,
        },
      });

      await createAtsAuditLog({
        connectionId: connection.id,
        actionType: "WEBHOOK_STAGE_SYNC",
        reasonCode: "ats_stage_event_processed",
        summary: `Processed stage webhook for ${link.application.job.title}.`,
        webhookEventId: webhookEvent.id,
        syncRunId: syncRun.id,
        metadata: {
          stageName: normalized.stageName,
          mappedStatus,
        },
      });

      return {
        duplicate: false,
        eventType: normalized.eventType,
        updatedApplication: shouldUpdateApplication,
      };
    }

    await prisma.aTSWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: ATSWebhookEventStatus.IGNORED,
        processedAt: new Date(),
      },
    });

    return {
      duplicate: false,
      eventType: normalized.eventType,
      ignored: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ATS webhook processing failed";

    await prisma.aTSWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: ATSWebhookEventStatus.FAILED,
        processedAt: new Date(),
        errorMessage: message,
      },
    });

    await prisma.aTSConnection.update({
      where: { id: connection.id },
      data: {
        status: ATSConnectionStatus.ERROR,
        healthStatus: ATSHealthStatus.DOWN,
        lastWebhookAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: message,
        consecutiveFailures: connection.consecutiveFailures + 1,
      },
    });

    await createAtsAuditLog({
      connectionId: connection.id,
      actionType: "WEBHOOK_FAILED",
      reasonCode: "ats_webhook_failed",
      summary: `Webhook processing failed for ${providerLabel(connection.provider)}.`,
      webhookEventId: webhookEvent.id,
      metadata: {
        error: message,
      },
    });

    await pushDeadLetter({
      category: "webhook",
      source: `ats:${connection.provider.toLowerCase()}:webhook`,
      reasonCode: "ats_webhook_failed",
      error,
      payload: {
        connectionId: connection.id,
        webhookEventId: webhookEvent.id,
      },
    });

    throw error;
  } finally {
    await refreshConnectionHealth(connection.id);
  }
}

export async function getAdminAtsDashboard(baseUrl: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [connections, recentFailedSyncs, recentFailedWebhooks] = await Promise.all([
    prisma.aTSConnection.findMany({
      include: {
        employer: {
          select: {
            id: true,
            companyName: true,
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
        syncRuns: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.aTSSyncRun.findMany({
      where: {
        status: { in: [ATSSyncStatus.FAILED, ATSSyncStatus.PARTIAL] },
        startedAt: { gte: since },
      },
      include: {
        connection: {
          include: {
            employer: {
              select: {
                companyName: true,
                user: {
                  select: { email: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
    prisma.aTSWebhookEvent.findMany({
      where: {
        status: ATSWebhookEventStatus.FAILED,
        receivedAt: { gte: since },
      },
      include: {
        connection: {
          include: {
            employer: {
              select: {
                companyName: true,
                user: {
                  select: { email: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 12,
    }),
  ]);

  const serializedConnections = await Promise.all(
    connections.map(async (connection) => {
      const [failedSyncRuns, failedWebhookEvents, pendingApplicationLinks] = await Promise.all([
        prisma.aTSSyncRun.count({
          where: { connectionId: connection.id, status: { in: [ATSSyncStatus.FAILED, ATSSyncStatus.PARTIAL] } },
        }),
        prisma.aTSWebhookEvent.count({
          where: { connectionId: connection.id, status: ATSWebhookEventStatus.FAILED },
        }),
        prisma.aTSApplicationLink.count({
          where: {
            connectionId: connection.id,
            status: { in: [ATSApplicationLinkStatus.PENDING, ATSApplicationLinkStatus.MANUAL_REVIEW] },
          },
        }),
      ]);

      return {
        ...serializeConnection(connection, baseUrl, {
          failedSyncRuns,
          failedWebhookEvents,
          pendingApplicationLinks,
        }),
        employer: connection.employer,
      };
    }),
  );

  return {
    summary: {
      totalConnections: serializedConnections.length,
      healthyConnections: serializedConnections.filter((item) => item.healthStatus === ATSHealthStatus.HEALTHY).length,
      degradedConnections: serializedConnections.filter((item) => item.healthStatus === ATSHealthStatus.DEGRADED).length,
      downConnections: serializedConnections.filter((item) => item.healthStatus === ATSHealthStatus.DOWN).length,
      needsAttentionConnections: serializedConnections.filter((item) => item.healthStatus === ATSHealthStatus.NEEDS_ATTENTION).length,
      webhookEnabledConnections: serializedConnections.filter((item) => item.webhookSyncEnabled).length,
      twoWayEnabledConnections: serializedConnections.filter((item) => item.twoWaySyncEnabled).length,
      failedSyncRunsLast7Days: recentFailedSyncs.length,
      failedWebhooksLast7Days: recentFailedWebhooks.length,
    },
    providerBreakdown: Object.values(
      serializedConnections.reduce<Record<string, {
        provider: string;
        label: string;
        total: number;
        healthy: number;
        degraded: number;
        down: number;
        needsAttention: number;
      }>>((acc, connection) => {
        const row = acc[connection.provider] ?? {
          provider: connection.provider,
          label: connection.providerLabel,
          total: 0,
          healthy: 0,
          degraded: 0,
          down: 0,
          needsAttention: 0,
        };
        row.total += 1;
        if (connection.healthStatus === ATSHealthStatus.HEALTHY) row.healthy += 1;
        if (connection.healthStatus === ATSHealthStatus.DEGRADED) row.degraded += 1;
        if (connection.healthStatus === ATSHealthStatus.DOWN) row.down += 1;
        if (connection.healthStatus === ATSHealthStatus.NEEDS_ATTENTION) row.needsAttention += 1;
        acc[connection.provider] = row;
        return acc;
      }, {}),
    ),
    connections: serializedConnections,
    recentFailedSyncs,
    recentFailedWebhooks,
  };
}
