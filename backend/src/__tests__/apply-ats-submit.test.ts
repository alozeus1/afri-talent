import { vi, describe, it, expect, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => {
    process.env.S3_UPLOADS_BUCKET = "test-bucket";
    return {
        s3Send: vi.fn(),
    };
});

vi.mock("../lib/prisma.js", () => ({
    default: {
        application: { findUnique: vi.fn(), update: vi.fn() },
        aTSConnection: { findFirst: vi.fn() },
        aTSApplicationLink: { upsert: vi.fn() },
        resume: { findFirst: vi.fn() },
        $disconnect: vi.fn(),
    },
}));

vi.mock("../lib/secure-string.js", () => ({
    decryptString: vi.fn((v: string | null) => (v ? v.replace("enc:", "") : null)),
    encryptString: vi.fn((v: string) => `enc:${v}`),
}));

vi.mock("@aws-sdk/client-s3", () => {
    class FakeCommand {
        input: unknown;
        constructor(input: unknown) {
            this.input = input;
        }
    }
    return {
        S3Client: class {
            send = hoisted.s3Send;
        },
        GetObjectCommand: class extends FakeCommand {},
    };
});

const queueState: { queue: { add: ReturnType<typeof vi.fn> } | null } = { queue: null };
vi.mock("../lib/queues/apply-queues.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../lib/queues/apply-queues.js")>();
    return {
        ...actual,
        getApplyQueue: vi.fn(() => queueState.queue),
        isApplyQueuesEnabled: vi.fn(() => Boolean(queueState.queue)),
    };
});

import prisma from "../lib/prisma.js";
import { dispatchApply } from "../lib/apply/dispatch.js";
import { settleAtsApplication } from "../lib/apply/ats-submit.js";
import {
    ApplyStrategy,
    ATSConnectionStatus,
    SubmissionProofKind,
    SubmissionStatus,
} from "@prisma/client";

const findApplication = vi.mocked(prisma.application.findUnique);
const updateApplication = vi.mocked(prisma.application.update);
const findConnection = vi.mocked(prisma.aTSConnection.findFirst);
const upsertLink = vi.mocked(prisma.aTSApplicationLink.upsert);
const findResume = vi.mocked(prisma.resume.findFirst);

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function application(sourceId: string) {
    return {
        id: "app-1",
        coverLetter: "I build reliable systems.",
        candidate: {
            id: "cand-1",
            name: "Ada Obi",
            email: "ada@example.com",
            phoneNumber: "+2348000000000",
        },
        job: { id: "job-1", title: "Senior Engineer", sourceId, employerId: "emp-1" },
    };
}

function connection() {
    return {
        id: "conn-1",
        externalOrgId: "acme",
        encryptedAccessToken: "enc:vendor-token",
        status: ATSConnectionStatus.ACTIVE,
    };
}

function okResponse(payload: unknown) {
    return {
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
    };
}

function dispatchInput(strategy: ApplyStrategy) {
    return {
        applicationId: "app-1",
        applyStrategy: strategy,
        applyEmailDetected: null,
        applyFormDomain: null,
        sourceUrl: null,
        applicationUrl: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    queueState.queue = null;
    findConnection.mockResolvedValue(connection() as never);
    findResume.mockResolvedValue(null as never);
    upsertLink.mockResolvedValue({} as never);
    updateApplication.mockResolvedValue({} as never);
});

describe("dispatchApply — ATS_API_* (PR S)", () => {
    it("Greenhouse: submits via the Job Board API with Basic auth and returns the ATS_ID proof", async () => {
        findApplication.mockResolvedValue(application("greenhouse-123") as never);
        fetchMock.mockResolvedValue(okResponse({ id: 999 }));

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_GREENHOUSE));

        expect(result).toMatchObject({
            ok: true,
            proofKind: SubmissionProofKind.ATS_ID,
            proofRef: "999",
            provider: "greenhouse",
            providerApplicationId: "999",
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(String(url)).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123");
        expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
        const form = init.body as FormData;
        expect(form.get("first_name")).toBe("Ada");
        expect(form.get("last_name")).toBe("Obi");
        expect(form.get("email")).toBe("ada@example.com");
        expect(form.get("cover_letter_text")).toBe("I build reliable systems.");
    });

    it("Lever: submits via the Postings API with the key query param", async () => {
        findApplication.mockResolvedValue(application("lever-posting-9") as never);
        fetchMock.mockResolvedValue(okResponse({ applicationId: "lv-1", candidateId: "lc-1" }));

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_LEVER));

        expect(result).toMatchObject({ ok: true, proofRef: "lv-1", provider: "lever" });
        const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
        expect(String(url)).toBe("https://api.lever.co/v0/postings/acme/posting-9?key=vendor-token");
        const form = init.body as FormData;
        expect(form.get("name")).toBe("Ada Obi");
        expect(form.get("comments")).toBe("I build reliable systems.");
    });

    it("Workable: posts a JSON candidate with Bearer auth and base64 resume when available", async () => {
        findApplication.mockResolvedValue(application("workable-SHORT1") as never);
        findResume.mockResolvedValue({ s3Key: "resumes/cand-1/cv.pdf", fileName: "cv.pdf" } as never);
        hoisted.s3Send.mockResolvedValue({
            Body: { transformToByteArray: async () => new Uint8Array([37, 80, 68, 70]) },
        });
        fetchMock.mockResolvedValue(okResponse({ candidate: { id: "wk-7" } }));

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_WORKABLE));

        expect(result).toMatchObject({ ok: true, proofRef: "wk-7", provider: "workable" });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(String(url)).toBe("https://acme.workable.com/spi/v3/jobs/SHORT1/candidates");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer vendor-token");
        const body = JSON.parse(init.body as string) as {
            candidate: { email: string; resume?: { name: string; data: string } };
        };
        expect(body.candidate.email).toBe("ada@example.com");
        expect(body.candidate.resume?.data).toBe(Buffer.from([37, 80, 68, 70]).toString("base64"));
    });

    it("fails cleanly when the employer has no active connection", async () => {
        findApplication.mockResolvedValue(application("greenhouse-123") as never);
        findConnection.mockResolvedValue(null as never);

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_GREENHOUSE));

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/no active GREENHOUSE connection/i) });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces vendor rejections as failures", async () => {
        findApplication.mockResolvedValue(application("greenhouse-123") as never);
        fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "missing required field" });

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_GREENHOUSE));

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/Greenhouse.*422/i) });
    });

    it("ATS_API_ASHBY remains stub-failed (no ATSProvider support)", async () => {
        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_ASHBY));
        expect(result).toEqual({ ok: false, error: expect.stringMatching(/ashby/i) });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("queue path: enqueues with a stable jobId and parks in SUBMITTING", async () => {
        queueState.queue = { add: vi.fn().mockResolvedValue({}) };

        const result = await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_GREENHOUSE));

        expect(queueState.queue.add).toHaveBeenCalledWith(
            "submit-ats-application",
            { applicationId: "app-1", strategy: ApplyStrategy.ATS_API_GREENHOUSE },
            { jobId: "apply-ats-app-1" },
        );
        expect(result).toMatchObject({
            ok: true,
            proofRef: "queued:app-1",
            nextStatus: SubmissionStatus.SUBMITTING,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("records the ATSApplicationLink as SYNCED with the vendor ids", async () => {
        findApplication.mockResolvedValue(application("greenhouse-123") as never);
        fetchMock.mockResolvedValue(okResponse({ id: 999 }));

        await dispatchApply(dispatchInput(ApplyStrategy.ATS_API_GREENHOUSE));

        expect(upsertLink).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { applicationId: "app-1" },
                create: expect.objectContaining({
                    connectionId: "conn-1",
                    externalJobId: "123",
                    externalApplicationId: "999",
                    status: "SYNCED",
                }),
            }),
        );
    });
});

describe("settleAtsApplication (queue worker path)", () => {
    it("submits and settles the row to SUBMITTED with the ATS_ID proof", async () => {
        findApplication.mockResolvedValue(application("greenhouse-123") as never);
        fetchMock.mockResolvedValue(okResponse({ id: 999 }));

        const result = await settleAtsApplication("app-1", ApplyStrategy.ATS_API_GREENHOUSE);

        expect(result.externalApplicationId).toBe("999");
        expect(updateApplication).toHaveBeenCalledWith({
            where: { id: "app-1" },
            data: expect.objectContaining({
                submissionStatus: SubmissionStatus.SUBMITTED,
                submissionProofKind: SubmissionProofKind.ATS_ID,
                submissionProofRef: "999",
                submissionProvider: "greenhouse",
                submissionProviderApplicationId: "999",
                submittedAt: expect.any(Date),
            }),
        });
    });
});
