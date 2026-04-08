import { ATSConnectionStatus, ATSHealthStatus, Prisma } from "@prisma/client";
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
export declare function deriveAtsHealthStatus(input: AtsHealthInput): ATSHealthStatus;
export declare function createAtsAuditLog(input: {
    connectionId: string;
    actorUserId?: string | null;
    actionType: string;
    reasonCode?: string | null;
    summary: string;
    syncRunId?: string | null;
    webhookEventId?: string | null;
    metadata?: Record<string, unknown> | null;
}): Promise<void>;
export declare function refreshConnectionHealth(connectionId: string): Promise<void>;
export declare function listEmployerAtsConnections(employerId: string, baseUrl: string): Promise<{
    id: string;
    provider: import(".prisma/client").$Enums.ATSProvider;
    providerLabel: string;
    displayName: string | null;
    externalOrgId: string;
    status: import(".prisma/client").$Enums.ATSConnectionStatus;
    healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
    metadata: Record<string, unknown>;
    credentials: ConnectionCredentialState;
    webhookSyncEnabled: boolean;
    twoWaySyncEnabled: boolean;
    lastSyncedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastConnectionTestAt: Date | null;
    lastConnectionTestOk: boolean | null;
    lastWebhookAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
    consecutiveFailures: number;
    capabilities: import("./providers.js").AtsProviderCapabilities;
    recentLogSummary: {
        failedSyncRuns: number;
        failedWebhookEvents: number;
        pendingApplicationLinks: number;
    };
    lastSyncRun: {
        cursor: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ATSSyncStatus;
        metadata: Prisma.JsonValue | null;
        startedAt: Date;
        trigger: string;
        connectionId: string;
        syncType: string;
        direction: string;
        correlationId: string | null;
        finishedAt: Date | null;
        pulledJobs: number;
        createdJobs: number;
        updatedJobs: number;
        dedupedJobs: number;
        processedEvents: number;
        pushedCandidates: number;
        updatedStages: number;
        retryCount: number;
        errorCount: number;
        errors: Prisma.JsonValue | null;
        warnings: Prisma.JsonValue | null;
    };
    webhookUrl: string;
    createdAt: Date;
    updatedAt: Date;
}[]>;
export declare function getEmployerAtsDashboard(employerId: string, baseUrl: string): Promise<{
    summary: {
        totalConnections: number;
        healthyConnections: number;
        degradedConnections: number;
        downConnections: number;
        needsAttentionConnections: number;
        webhookEnabledConnections: number;
        twoWayEnabledConnections: number;
        failedSyncRuns: number;
        failedWebhookEvents: number;
    };
    providerBreakdown: {
        provider: string;
        total: number;
        healthy: number;
        degraded: number;
        down: number;
        needsAttention: number;
    }[];
    connections: {
        id: string;
        provider: import(".prisma/client").$Enums.ATSProvider;
        providerLabel: string;
        displayName: string | null;
        externalOrgId: string;
        status: import(".prisma/client").$Enums.ATSConnectionStatus;
        healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
        metadata: Record<string, unknown>;
        credentials: ConnectionCredentialState;
        webhookSyncEnabled: boolean;
        twoWaySyncEnabled: boolean;
        lastSyncedAt: Date | null;
        lastSuccessfulSyncAt: Date | null;
        lastConnectionTestAt: Date | null;
        lastConnectionTestOk: boolean | null;
        lastWebhookAt: Date | null;
        lastErrorAt: Date | null;
        lastErrorMessage: string | null;
        consecutiveFailures: number;
        capabilities: import("./providers.js").AtsProviderCapabilities;
        recentLogSummary: {
            failedSyncRuns: number;
            failedWebhookEvents: number;
            pendingApplicationLinks: number;
        };
        lastSyncRun: {
            cursor: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ATSSyncStatus;
            metadata: Prisma.JsonValue | null;
            startedAt: Date;
            trigger: string;
            connectionId: string;
            syncType: string;
            direction: string;
            correlationId: string | null;
            finishedAt: Date | null;
            pulledJobs: number;
            createdJobs: number;
            updatedJobs: number;
            dedupedJobs: number;
            processedEvents: number;
            pushedCandidates: number;
            updatedStages: number;
            retryCount: number;
            errorCount: number;
            errors: Prisma.JsonValue | null;
            warnings: Prisma.JsonValue | null;
        };
        webhookUrl: string;
        createdAt: Date;
        updatedAt: Date;
    }[];
}>;
export declare function getAtsConnectionDetailForEmployer(params: {
    connectionId: string;
    employerId: string;
    baseUrl: string;
}): Promise<{
    id: string;
    provider: import(".prisma/client").$Enums.ATSProvider;
    providerLabel: string;
    displayName: string | null;
    externalOrgId: string;
    status: import(".prisma/client").$Enums.ATSConnectionStatus;
    healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
    metadata: Record<string, unknown>;
    credentials: ConnectionCredentialState;
    webhookSyncEnabled: boolean;
    twoWaySyncEnabled: boolean;
    lastSyncedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastConnectionTestAt: Date | null;
    lastConnectionTestOk: boolean | null;
    lastWebhookAt: Date | null;
    lastErrorAt: Date | null;
    lastErrorMessage: string | null;
    consecutiveFailures: number;
    capabilities: import("./providers.js").AtsProviderCapabilities;
    recentLogSummary: {
        failedSyncRuns: number;
        failedWebhookEvents: number;
        pendingApplicationLinks: number;
    };
    lastSyncRun: {
        cursor: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ATSSyncStatus;
        metadata: Prisma.JsonValue | null;
        startedAt: Date;
        trigger: string;
        connectionId: string;
        syncType: string;
        direction: string;
        correlationId: string | null;
        finishedAt: Date | null;
        pulledJobs: number;
        createdJobs: number;
        updatedJobs: number;
        dedupedJobs: number;
        processedEvents: number;
        pushedCandidates: number;
        updatedStages: number;
        retryCount: number;
        errorCount: number;
        errors: Prisma.JsonValue | null;
        warnings: Prisma.JsonValue | null;
    };
    webhookUrl: string;
    createdAt: Date;
    updatedAt: Date;
} | null>;
export declare function getAtsConnectionLogs(params: {
    connectionId: string;
    employerId: string;
    baseUrl: string;
}): Promise<{
    connection: {
        id: string;
        provider: import(".prisma/client").$Enums.ATSProvider;
        providerLabel: string;
        displayName: string | null;
        externalOrgId: string;
        status: import(".prisma/client").$Enums.ATSConnectionStatus;
        healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
        metadata: Record<string, unknown>;
        credentials: ConnectionCredentialState;
        webhookSyncEnabled: boolean;
        twoWaySyncEnabled: boolean;
        lastSyncedAt: Date | null;
        lastSuccessfulSyncAt: Date | null;
        lastConnectionTestAt: Date | null;
        lastConnectionTestOk: boolean | null;
        lastWebhookAt: Date | null;
        lastErrorAt: Date | null;
        lastErrorMessage: string | null;
        consecutiveFailures: number;
        capabilities: import("./providers.js").AtsProviderCapabilities;
        recentLogSummary: {
            failedSyncRuns: number;
            failedWebhookEvents: number;
            pendingApplicationLinks: number;
        };
        lastSyncRun: {
            cursor: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ATSSyncStatus;
            metadata: Prisma.JsonValue | null;
            startedAt: Date;
            trigger: string;
            connectionId: string;
            syncType: string;
            direction: string;
            correlationId: string | null;
            finishedAt: Date | null;
            pulledJobs: number;
            createdJobs: number;
            updatedJobs: number;
            dedupedJobs: number;
            processedEvents: number;
            pushedCandidates: number;
            updatedStages: number;
            retryCount: number;
            errorCount: number;
            errors: Prisma.JsonValue | null;
            warnings: Prisma.JsonValue | null;
        };
        webhookUrl: string;
        createdAt: Date;
        updatedAt: Date;
    };
    syncRuns: {
        cursor: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ATSSyncStatus;
        metadata: Prisma.JsonValue | null;
        startedAt: Date;
        trigger: string;
        connectionId: string;
        syncType: string;
        direction: string;
        correlationId: string | null;
        finishedAt: Date | null;
        pulledJobs: number;
        createdJobs: number;
        updatedJobs: number;
        dedupedJobs: number;
        processedEvents: number;
        pushedCandidates: number;
        updatedStages: number;
        retryCount: number;
        errorCount: number;
        errors: Prisma.JsonValue | null;
        warnings: Prisma.JsonValue | null;
    }[];
    webhookEvents: {
        id: string;
        status: import(".prisma/client").$Enums.ATSWebhookEventStatus;
        metadata: Prisma.JsonValue | null;
        provider: import(".prisma/client").$Enums.ATSProvider;
        eventType: string;
        processedAt: Date | null;
        errorMessage: string | null;
        payload: Prisma.JsonValue;
        connectionId: string;
        eventKey: string | null;
        httpHeaders: Prisma.JsonValue | null;
        receivedAt: Date;
    }[];
    auditLogs: {
        id: string;
        createdAt: Date;
        metadata: Prisma.JsonValue | null;
        reasonCode: string | null;
        actionType: string;
        summary: string;
        connectionId: string;
        actorUserId: string | null;
        syncRunId: string | null;
        webhookEventId: string | null;
    }[];
    applicationLinks: {
        stats: {
            total: number;
            synced: number;
            pending: number;
            manualReview: number;
            failed: number;
        };
        recent: ({
            application: {
                job: {
                    id: string;
                    title: string;
                    slug: string;
                };
                candidate: {
                    id: string;
                    name: string;
                    email: string;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import(".prisma/client").$Enums.ApplicationStatus;
                notes: string | null;
                riskScore: number;
                riskLevel: import(".prisma/client").$Enums.TrustRiskLevel;
                candidateId: string;
                jobId: string;
                trustFlags: Prisma.JsonValue | null;
                cvUrl: string | null;
                coverLetter: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.ATSApplicationLinkStatus;
            metadata: Prisma.JsonValue | null;
            applicationId: string;
            externalStageId: string | null;
            externalStageName: string | null;
            connectionId: string;
            externalJobId: string | null;
            externalApplicationId: string | null;
            externalCandidateId: string | null;
            lastOutboundSyncAt: Date | null;
            lastInboundSyncAt: Date | null;
            lastSyncError: string | null;
        })[];
    };
} | null>;
export declare function runAtsConnectionTest(params: {
    connectionId: string;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<{
    ok: boolean;
    healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
    sampleJobCount: number;
    warnings: string[];
    capabilities: import("./providers.js").AtsProviderCapabilities;
}>;
export declare function runAtsConnectionSync(params: {
    connectionId: string;
    actorUserId?: string | null;
    correlationId?: string | null;
    trigger?: string;
    direction?: string;
    syncType?: string;
    retryCount?: number;
}): Promise<{
    pulledJobs: number;
    createdJobs: number;
    updatedJobs: number;
    dedupedJobs: number;
    syncRunId: string;
}>;
export declare function retryAtsConnectionSync(params: {
    connectionId: string;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<{
    pulledJobs: number;
    createdJobs: number;
    updatedJobs: number;
    dedupedJobs: number;
    syncRunId: string;
}>;
export declare function maybeCreateAtsApplicationLink(applicationId: string): Promise<void>;
export declare function syncApplicationStatusToAts(params: {
    applicationId: string;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<{
    outcome: string;
    message: string;
    result?: undefined;
} | {
    outcome: string;
    message: string;
    result: import("./providers.js").AtsStageUpdateResult;
}>;
export declare function processAtsWebhook(params: {
    provider: string;
    connectionId: string;
    rawBody: string;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    queryToken?: string | null;
    correlationId?: string | null;
}): Promise<{
    duplicate: boolean;
    eventType: string;
    syncResult?: undefined;
    ignored?: undefined;
    updatedApplication?: undefined;
} | {
    duplicate: boolean;
    eventType: string;
    syncResult: {
        pulledJobs: number;
        createdJobs: number;
        updatedJobs: number;
        dedupedJobs: number;
        syncRunId: string;
    };
    ignored?: undefined;
    updatedApplication?: undefined;
} | {
    duplicate: boolean;
    eventType: string;
    ignored: boolean;
    syncResult?: undefined;
    updatedApplication?: undefined;
} | {
    duplicate: boolean;
    eventType: string;
    updatedApplication: boolean | null;
    syncResult?: undefined;
    ignored?: undefined;
}>;
export declare function getAdminAtsDashboard(baseUrl: string): Promise<{
    summary: {
        totalConnections: number;
        healthyConnections: number;
        degradedConnections: number;
        downConnections: number;
        needsAttentionConnections: number;
        webhookEnabledConnections: number;
        twoWayEnabledConnections: number;
        failedSyncRunsLast7Days: number;
        failedWebhooksLast7Days: number;
    };
    providerBreakdown: {
        provider: string;
        label: string;
        total: number;
        healthy: number;
        degraded: number;
        down: number;
        needsAttention: number;
    }[];
    connections: {
        employer: {
            user: {
                id: string;
                name: string;
                email: string;
            };
            id: string;
            companyName: string;
        };
        id: string;
        provider: import(".prisma/client").$Enums.ATSProvider;
        providerLabel: string;
        displayName: string | null;
        externalOrgId: string;
        status: import(".prisma/client").$Enums.ATSConnectionStatus;
        healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
        metadata: Record<string, unknown>;
        credentials: ConnectionCredentialState;
        webhookSyncEnabled: boolean;
        twoWaySyncEnabled: boolean;
        lastSyncedAt: Date | null;
        lastSuccessfulSyncAt: Date | null;
        lastConnectionTestAt: Date | null;
        lastConnectionTestOk: boolean | null;
        lastWebhookAt: Date | null;
        lastErrorAt: Date | null;
        lastErrorMessage: string | null;
        consecutiveFailures: number;
        capabilities: import("./providers.js").AtsProviderCapabilities;
        recentLogSummary: {
            failedSyncRuns: number;
            failedWebhookEvents: number;
            pendingApplicationLinks: number;
        };
        lastSyncRun: {
            cursor: string | null;
            id: string;
            status: import(".prisma/client").$Enums.ATSSyncStatus;
            metadata: Prisma.JsonValue | null;
            startedAt: Date;
            trigger: string;
            connectionId: string;
            syncType: string;
            direction: string;
            correlationId: string | null;
            finishedAt: Date | null;
            pulledJobs: number;
            createdJobs: number;
            updatedJobs: number;
            dedupedJobs: number;
            processedEvents: number;
            pushedCandidates: number;
            updatedStages: number;
            retryCount: number;
            errorCount: number;
            errors: Prisma.JsonValue | null;
            warnings: Prisma.JsonValue | null;
        };
        webhookUrl: string;
        createdAt: Date;
        updatedAt: Date;
    }[];
    recentFailedSyncs: ({
        connection: {
            employer: {
                user: {
                    name: string;
                    email: string;
                };
                companyName: string;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.ATSConnectionStatus;
            metadata: Prisma.JsonValue | null;
            provider: import(".prisma/client").$Enums.ATSProvider;
            lastSyncedAt: Date | null;
            employerId: string;
            displayName: string | null;
            externalOrgId: string;
            encryptedAccessToken: string | null;
            encryptedRefreshToken: string | null;
            encryptedWebhookSecret: string | null;
            healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
            webhookSyncEnabled: boolean;
            twoWaySyncEnabled: boolean;
            lastSuccessfulSyncAt: Date | null;
            lastConnectionTestAt: Date | null;
            lastConnectionTestOk: boolean | null;
            lastWebhookAt: Date | null;
            lastErrorAt: Date | null;
            lastErrorMessage: string | null;
            consecutiveFailures: number;
        };
    } & {
        cursor: string | null;
        id: string;
        status: import(".prisma/client").$Enums.ATSSyncStatus;
        metadata: Prisma.JsonValue | null;
        startedAt: Date;
        trigger: string;
        connectionId: string;
        syncType: string;
        direction: string;
        correlationId: string | null;
        finishedAt: Date | null;
        pulledJobs: number;
        createdJobs: number;
        updatedJobs: number;
        dedupedJobs: number;
        processedEvents: number;
        pushedCandidates: number;
        updatedStages: number;
        retryCount: number;
        errorCount: number;
        errors: Prisma.JsonValue | null;
        warnings: Prisma.JsonValue | null;
    })[];
    recentFailedWebhooks: ({
        connection: {
            employer: {
                user: {
                    name: string;
                    email: string;
                };
                companyName: string;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.ATSConnectionStatus;
            metadata: Prisma.JsonValue | null;
            provider: import(".prisma/client").$Enums.ATSProvider;
            lastSyncedAt: Date | null;
            employerId: string;
            displayName: string | null;
            externalOrgId: string;
            encryptedAccessToken: string | null;
            encryptedRefreshToken: string | null;
            encryptedWebhookSecret: string | null;
            healthStatus: import(".prisma/client").$Enums.ATSHealthStatus;
            webhookSyncEnabled: boolean;
            twoWaySyncEnabled: boolean;
            lastSuccessfulSyncAt: Date | null;
            lastConnectionTestAt: Date | null;
            lastConnectionTestOk: boolean | null;
            lastWebhookAt: Date | null;
            lastErrorAt: Date | null;
            lastErrorMessage: string | null;
            consecutiveFailures: number;
        };
    } & {
        id: string;
        status: import(".prisma/client").$Enums.ATSWebhookEventStatus;
        metadata: Prisma.JsonValue | null;
        provider: import(".prisma/client").$Enums.ATSProvider;
        eventType: string;
        processedAt: Date | null;
        errorMessage: string | null;
        payload: Prisma.JsonValue;
        connectionId: string;
        eventKey: string | null;
        httpHeaders: Prisma.JsonValue | null;
        receivedAt: Date;
    })[];
}>;
export {};
//# sourceMappingURL=service.d.ts.map