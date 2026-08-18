import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";

const hoisted = vi.hoisted(() => {
    process.env.S3_UPLOADS_BUCKET = "test-bucket";
    return {
        pdfState: { available: true },
        renderMock: vi.fn(),
        s3Send: vi.fn(),
    };
});

vi.mock("../lib/pdf/html-to-pdf.js", () => ({
    isPdfRendererAvailable: vi.fn(() => hoisted.pdfState.available),
    renderHtmlToPdf: hoisted.renderMock,
    resolveChromiumPath: vi.fn(() => (hoisted.pdfState.available ? "/usr/bin/chromium" : null)),
    closePdfRenderer: vi.fn(),
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
        PutObjectCommand: class extends FakeCommand {},
    };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/resume"),
}));

vi.mock("../lib/prisma.js", () => ({
    default: {
        resumeTemplate: { findUnique: vi.fn() },
        userResume: { findUnique: vi.fn() },
        user: { findUnique: vi.fn() },
        candidateProfile: { findUnique: vi.fn() },
        templateDownload: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
        subscription: { findUnique: vi.fn() },
        $queryRaw: vi.fn().mockResolvedValue([]),
        $disconnect: vi.fn(),
    },
}));

import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { Role, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

const TEMPLATE_ID = "8a0f8a0e-3a52-4b7e-9a51-0f3b9a3a1d2c";
const TOKEN = signToken({ userId: "cand-1", email: "ada@example.com", role: Role.CANDIDATE });

const findTemplate = vi.mocked(prisma.resumeTemplate.findUnique);
const findResume = vi.mocked(prisma.userResume.findUnique);
const findUser = vi.mocked(prisma.user.findUnique);
const findProfile = vi.mocked(prisma.candidateProfile.findUnique);
const createDownload = vi.mocked(prisma.templateDownload.create);
const findSubscription = vi.mocked(prisma.subscription.findUnique);

function mockCurrentCandidate(input = {
    id: "cand-1",
    email: "ada@example.com",
    name: "Ada Obi",
}): void {
    findUser.mockImplementation((args: any) => {
        const isAuthLookup =
            args?.where?.id === input.id &&
            args?.select?.deletedAt === true &&
            args?.select?.accountRestrictionStatus === true;

        if (isAuthLookup) {
            return Promise.resolve({
                id: input.id,
                email: input.email,
                role: Role.CANDIDATE,
                deletedAt: null,
                accountRestrictionStatus: "ACTIVE",
            }) as never;
        }

        const isProfileLookup =
            args?.where?.id === input.id &&
            args?.select?.name === true &&
            args?.select?.phoneNumber === true;

        if (isProfileLookup) {
            return Promise.resolve({ name: input.name, phoneNumber: null }) as never;
        }

        return undefined as never;
    });
}

function exportPdf(token = TOKEN) {
    return request(app)
        .post(`/api/skills/resume-templates/${TEMPLATE_ID}/export-pdf`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESUME_PDF_EXPORT_ENABLED = "1";
    hoisted.pdfState.available = true;
    hoisted.renderMock.mockResolvedValue(Buffer.from("%PDF-1.4 fake-pdf-bytes"));
    hoisted.s3Send.mockResolvedValue({
        Body: { transformToString: async () => "<html><body>{{FULL_NAME}}</body></html>" },
    });
    findSubscription.mockResolvedValue({
        plan: SubscriptionPlan.PROFESSIONAL,
        status: SubscriptionStatus.ACTIVE,
    } as never);
    findTemplate.mockResolvedValue({
        id: TEMPLATE_ID,
        isActive: true,
        files: [{ format: "HTML", s3Key: "templates/src/modern.html" }],
    } as never);
    findResume.mockResolvedValue({
        content: { sections: { summary: "Builder of things", skills: ["TypeScript"] } },
        rawText: "raw",
    } as never);
    mockCurrentCandidate();
    findProfile.mockResolvedValue(null as never);
    createDownload.mockResolvedValue({} as never);
});

afterEach(() => {
    findUser.mockReset();
});

afterAll(() => {
    delete process.env.RESUME_PDF_EXPORT_ENABLED;
});

describe("POST /api/skills/resume-templates/:id/export-pdf", () => {
    it("is gated behind RESUME_PDF_EXPORT_ENABLED", async () => {
        delete process.env.RESUME_PDF_EXPORT_ENABLED;

        const res = await exportPdf();

        expect(res.status).toBe(503);
        expect(res.body.code).toBe("FEATURE_DISABLED");
    });

    it("returns 503 PDF_RENDERER_UNAVAILABLE when chromium is missing", async () => {
        hoisted.pdfState.available = false;

        const res = await exportPdf();

        expect(res.status).toBe(503);
        expect(res.body.code).toBe("PDF_RENDERER_UNAVAILABLE");
        expect(hoisted.renderMock).not.toHaveBeenCalled();
    });

    it("renders the filled template and returns a presigned PDF URL", async () => {
        const res = await exportPdf();

        expect(res.status).toBe(200);
        expect(res.body.downloadUrl).toBe("https://signed.example/resume");
        expect(res.body.sizeBytes).toBeGreaterThan(0);

        // Renderer received the filled HTML (template fetched from S3).
        expect(hoisted.renderMock).toHaveBeenCalledOnce();
        const renderedHtml = hoisted.renderMock.mock.calls[0][0] as string;
        expect(renderedHtml).toContain("<html>");

        // PDF uploaded with the right key shape + content type.
        const putCall = hoisted.s3Send.mock.calls
            .map((c) => (c[0] as { input?: { ContentType?: string; Key?: string } }).input)
            .find((input) => input?.ContentType === "application/pdf");
        expect(putCall?.Key).toMatch(/^templates\/filled\/cand-1\/.*\.pdf$/);

        // Download logged as a resume_builder PDF export.
        expect(createDownload).toHaveBeenCalledWith({
            data: expect.objectContaining({ format: "PDF", source: "resume_builder" }),
        });
    });

    it("requires a PROFESSIONAL plan", async () => {
        findSubscription.mockResolvedValue({
            plan: SubscriptionPlan.FREE,
            status: SubscriptionStatus.ACTIVE,
        } as never);

        const res = await exportPdf();

        expect(res.status).toBe(403);
    });

    it("does not export another candidate's resume", async () => {
        const candidateBToken = signToken({
            userId: "cand-2",
            email: "candidate-b@example.test",
            role: Role.CANDIDATE,
        });
        mockCurrentCandidate({ id: "cand-2", email: "candidate-b@example.test", name: "Candidate B" });
        (findResume as any).mockImplementation(({ where }: any) =>
            where?.userId === "cand-2" ? Promise.resolve(null) : Promise.resolve({ content: {}, rawText: "candidate A" }),
        );

        const res = await exportPdf(candidateBToken);

        expect(res.status).toBe(404);
        expect(hoisted.renderMock).not.toHaveBeenCalled();
        expect(findResume).toHaveBeenCalledWith({ where: { userId: "cand-2" } });
    });

    it("propagates fill-pipeline errors (no saved resume)", async () => {
        findResume.mockResolvedValue(null as never);

        const res = await exportPdf();

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/no saved resume/i);
    });
});
