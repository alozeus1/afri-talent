import { describe, expect, it } from "vitest";
import { ATSConnectionStatus } from "@prisma/client";
import { getAtsProviderCapabilities, mapExternalStageToApplicationStatus, normalizeAtsWebhookPayload, verifyAtsWebhookSignature, } from "../lib/ats/providers.js";
import { deriveAtsHealthStatus } from "../lib/ats/service.js";
import crypto from "crypto";
describe("ATS integration orchestration", () => {
    it("marks connections as needing attention when two-way sync is enabled without stage mappings", () => {
        const health = deriveAtsHealthStatus({
            status: ATSConnectionStatus.ACTIVE,
            accessTokenPresent: true,
            webhookSecretPresent: true,
            jobImportReady: true,
            stageMappingsReady: false,
            serviceUserReady: true,
            webhookSyncEnabled: true,
            twoWaySyncEnabled: true,
            lastConnectionTestOk: true,
            lastSuccessfulSyncAt: new Date(),
            consecutiveFailures: 0,
            lastErrorMessage: null,
        });
        expect(health).toBe("NEEDS_ATTENTION");
    });
    it("marks stable connections as healthy when import is ready and there are no failures", () => {
        const health = deriveAtsHealthStatus({
            status: ATSConnectionStatus.ACTIVE,
            accessTokenPresent: true,
            webhookSecretPresent: true,
            jobImportReady: true,
            stageMappingsReady: true,
            serviceUserReady: true,
            webhookSyncEnabled: true,
            twoWaySyncEnabled: true,
            lastConnectionTestOk: true,
            lastSuccessfulSyncAt: new Date(),
            consecutiveFailures: 0,
            lastErrorMessage: null,
        });
        expect(health).toBe("HEALTHY");
    });
    it("requires a Workable token before import is considered ready", () => {
        const capabilities = getAtsProviderCapabilities({
            provider: "WORKABLE",
            accessTokenPresent: false,
            webhookSecretPresent: true,
            metadata: {},
            webhookSyncEnabled: true,
            twoWaySyncEnabled: false,
        });
        expect(capabilities.jobImportReady).toBe(false);
        expect(capabilities.notes[0]).toContain("API token");
    });
    it("normalizes inbound stage-change webhook payloads into common ids", () => {
        const normalized = normalizeAtsWebhookPayload({
            provider: "GREENHOUSE",
            headers: {
                "x-event-type": "application_updated",
            },
            body: {
                id: "evt-123",
                payload: {
                    application: {
                        id: 987,
                        current_stage: {
                            id: 555,
                            name: "Onsite interview",
                        },
                        candidate: {
                            id: 321,
                        },
                    },
                },
            },
        });
        expect(normalized.eventKey).toBe("evt-123");
        expect(normalized.externalApplicationId).toBe("987");
        expect(normalized.externalCandidateId).toBe("321");
        expect(normalized.stageId).toBe("555");
        expect(normalized.stageName).toBe("Onsite interview");
        expect(normalized.isStageChangeEvent).toBe(true);
    });
    it("maps external stage names to local application statuses", () => {
        expect(mapExternalStageToApplicationStatus("Final Interview")).toBe("SHORTLISTED");
        expect(mapExternalStageToApplicationStatus("Hired")).toBe("ACCEPTED");
        expect(mapExternalStageToApplicationStatus("Rejected")).toBe("REJECTED");
    });
    it("verifies Greenhouse webhook signatures using the shared secret", () => {
        const rawBody = JSON.stringify({ ping: "pong" });
        const secret = "super-secret";
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        const valid = verifyAtsWebhookSignature({
            provider: "GREENHOUSE",
            secret,
            rawBody,
            headers: {
                signature: `sha256 ${signature}`,
            },
        });
        expect(valid).toBe(true);
    });
});
//# sourceMappingURL=ats-service.test.js.map