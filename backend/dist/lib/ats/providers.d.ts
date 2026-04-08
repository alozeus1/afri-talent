import { ATSProvider, ApplicationStatus } from "@prisma/client";
export interface NormalizedATSJob {
    externalId: string;
    title: string;
    description: string;
    location: string;
    type: string;
    seniority: string;
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    tags: string[];
    visaSponsorship: "YES" | "NO" | "UNKNOWN";
    relocationAssistance: boolean;
    eligibleCountries: string[];
    sourceUrl: string;
    postedAt?: Date;
    expiresAt?: Date;
    rawData?: Record<string, unknown>;
}
export interface AtsProviderCapabilities {
    provider: ATSProvider;
    label: string;
    jobImportSupported: boolean;
    jobImportReady: boolean;
    webhookSupported: boolean;
    webhookReady: boolean;
    stageWritebackSupported: boolean;
    stageWritebackReady: boolean;
    notes: string[];
}
export interface NormalizedAtsWebhookEvent {
    eventKey: string | null;
    eventType: string;
    externalApplicationId: string | null;
    externalCandidateId: string | null;
    externalJobId: string | null;
    stageId: string | null;
    stageName: string | null;
    shouldTriggerJobSync: boolean;
    isStageChangeEvent: boolean;
}
export interface AtsStageUpdateParams {
    provider: ATSProvider;
    externalOrgId: string;
    accessToken?: string | null;
    externalApplicationId?: string | null;
    externalCandidateId?: string | null;
    currentStageId?: string | null;
    targetStageId?: string | null;
    targetStageName?: string | null;
    metadata?: Record<string, unknown> | null;
}
export interface AtsStageUpdateResult {
    ok: boolean;
    mode: "api" | "manual";
    provider: ATSProvider;
    externalStageId?: string | null;
    externalStageName?: string | null;
    message: string;
    responseBody?: Record<string, unknown> | null;
}
export declare function providerLabel(provider: ATSProvider): string;
export declare function getAtsProviderCapabilities(params: {
    provider: ATSProvider;
    accessTokenPresent: boolean;
    webhookSecretPresent: boolean;
    metadata?: Record<string, unknown> | null;
    twoWaySyncEnabled?: boolean;
    webhookSyncEnabled?: boolean;
}): AtsProviderCapabilities;
export declare function fetchAtsJobs(params: {
    provider: ATSProvider;
    externalOrgId: string;
    accessToken?: string | null;
}): Promise<NormalizedATSJob[]>;
export declare function verifyAtsWebhookSignature(params: {
    provider: ATSProvider;
    secret: string;
    rawBody: string;
    headers: Record<string, string | string[] | undefined>;
}): boolean;
export declare function normalizeAtsWebhookPayload(params: {
    provider: ATSProvider;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
}): NormalizedAtsWebhookEvent;
export declare function mapExternalStageToApplicationStatus(stageName?: string | null): ApplicationStatus | null;
export declare function defaultStageLabelForApplicationStatus(status: ApplicationStatus): string;
export declare function pushAtsCandidateStageUpdate(params: AtsStageUpdateParams): Promise<AtsStageUpdateResult>;
//# sourceMappingURL=providers.d.ts.map