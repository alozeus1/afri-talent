import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../lib/prisma.js", () => ({
    default: {
        application: { findUnique: vi.fn(), update: vi.fn() },
        employerApplyOptOut: { findUnique: vi.fn() },
        $disconnect: vi.fn(),
    },
}));

vi.mock("../lib/email.js", () => ({
    sendApplyDraftEmail: vi.fn(),
}));

const queueState: { queue: { add: ReturnType<typeof vi.fn> } | null } = { queue: null };
vi.mock("../lib/queues/apply-queues.js", () => ({
    getApplyQueue: vi.fn(() => queueState.queue),
    isApplyQueuesEnabled: vi.fn(() => Boolean(queueState.queue)),
}));

import prisma from "../lib/prisma.js";
import { sendApplyDraftEmail } from "../lib/email.js";
import { dispatchApply } from "../lib/apply/dispatch.js";
import {
    composeAndSendApplyEmail,
    settleEmailApplication,
    failEmailApplication,
} from "../lib/apply/email-draft.js";
import { ApplyStrategy, SubmissionProofKind, SubmissionStatus } from "@prisma/client";

const findApplication = vi.mocked(prisma.application.findUnique);
const updateApplication = vi.mocked(prisma.application.update);
const findOptOut = vi.mocked(prisma.employerApplyOptOut.findUnique);
const sendEmail = vi.mocked(sendApplyDraftEmail);

const APPLICATION = {
    id: "app-1",
    coverLetter: "I love <b>shipping</b> & quality.",
    candidate: { name: "Ada Obi", email: "ada@example.com", phoneNumber: "+2348000000000" },
    job: {
        title: "Senior Engineer",
        applyEmailDetected: "Careers@Acme.com",
        employer: { companyName: "Acme" },
        sourceName: null,
    },
};

function dispatchInput(overrides: Partial<Parameters<typeof dispatchApply>[0]> = {}) {
    return {
        applicationId: "app-1",
        applyStrategy: ApplyStrategy.EMAIL_DRAFT,
        applyEmailDetected: "careers@acme.com",
        applyFormDomain: null,
        sourceUrl: "https://jobs.acme.com/123",
        applicationUrl: "https://jobs.acme.com/123/apply",
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    queueState.queue = null;
    findApplication.mockResolvedValue(APPLICATION as never);
    findOptOut.mockResolvedValue(null as never);
    updateApplication.mockResolvedValue({} as never);
    sendEmail.mockResolvedValue({ messageId: "ses-msg-1" });
});

describe("dispatchApply — EMAIL_DRAFT (PR Q)", () => {
    it("fails when the job has no detected apply email", async () => {
        const result = await dispatchApply(dispatchInput({ applyEmailDetected: null }));
        expect(result).toEqual({ ok: false, error: expect.stringMatching(/no detected apply email/i) });
    });

    it("inline path: sends and returns the SES MessageId as proof", async () => {
        const result = await dispatchApply(dispatchInput());

        expect(result).toMatchObject({
            ok: true,
            proofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
            proofRef: "ses-msg-1",
            provider: "ses",
        });
        expect((result as { nextStatus?: string }).nextStatus).toBeUndefined();
        expect(sendEmail).toHaveBeenCalledOnce();
        const args = sendEmail.mock.calls[0][0];
        expect(args.to).toBe("careers@acme.com"); // normalised to lowercase
        expect(args.replyTo).toBe("ada@example.com");
        expect(args.subject).toContain("Senior Engineer");
        expect(args.subject).toContain("Ada Obi");
    });

    it("escapes candidate-controlled HTML in the html body", async () => {
        await dispatchApply(dispatchInput());
        const args = sendEmail.mock.calls[0][0];
        expect(args.html).toContain("&lt;b&gt;shipping&lt;/b&gt; &amp; quality");
        expect(args.html).not.toContain("<b>shipping</b>");
    });

    it("queue path: enqueues with a stable jobId and parks in SUBMITTING", async () => {
        queueState.queue = { add: vi.fn().mockResolvedValue({}) };

        const result = await dispatchApply(dispatchInput());

        expect(queueState.queue.add).toHaveBeenCalledWith(
            "send-apply-email",
            { applicationId: "app-1" },
            { jobId: "apply-email-app-1" },
        );
        expect(result).toMatchObject({
            ok: true,
            proofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
            proofRef: "queued:app-1",
            nextStatus: SubmissionStatus.SUBMITTING,
        });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("falls back to inline send when the enqueue fails", async () => {
        queueState.queue = { add: vi.fn().mockRejectedValue(new Error("redis down")) };

        const result = await dispatchApply(dispatchInput());

        expect(result).toMatchObject({ ok: true, proofRef: "ses-msg-1" });
        expect(sendEmail).toHaveBeenCalledOnce();
    });

    it("degrades to assisted redirect when the employer opted out at send time", async () => {
        findOptOut.mockResolvedValue({ expiresAt: new Date(Date.now() + 86_400_000) } as never);

        const result = await dispatchApply(dispatchInput());

        expect(result).toMatchObject({
            ok: true,
            proofKind: SubmissionProofKind.CLICKOUT_TIMESTAMP,
            nextStatus: SubmissionStatus.AWAITING_USER_CONFIRMATION,
            createApplyAttempt: true,
        });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("ignores an expired opt-out", async () => {
        findOptOut.mockResolvedValue({ expiresAt: new Date(Date.now() - 1000) } as never);

        const result = await dispatchApply(dispatchInput());

        expect(result).toMatchObject({ ok: true, proofRef: "ses-msg-1" });
    });

    it("fails when the detected address is not a valid email", async () => {
        findApplication.mockResolvedValue({
            ...APPLICATION,
            job: { ...APPLICATION.job, applyEmailDetected: "not-an-email" },
        } as never);

        const result = await dispatchApply(dispatchInput({ applyEmailDetected: "not-an-email" }));

        expect(result).toEqual({ ok: false, error: expect.stringMatching(/no valid apply email/i) });
        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe("settle/fail helpers (queue worker path)", () => {
    it("settleEmailApplication sends and settles the row to SUBMITTED with proof", async () => {
        const sent = await settleEmailApplication("app-1");

        expect(sent.messageId).toBe("ses-msg-1");
        expect(updateApplication).toHaveBeenCalledWith({
            where: { id: "app-1" },
            data: expect.objectContaining({
                submissionStatus: SubmissionStatus.SUBMITTED,
                submissionProofKind: SubmissionProofKind.EMAIL_MESSAGE_ID,
                submissionProofRef: "ses-msg-1",
                submissionProvider: "ses",
                submittedAt: expect.any(Date),
            }),
        });
    });

    it("failEmailApplication marks the row FAILED with a truncated error", async () => {
        await failEmailApplication("app-1", new Error("x".repeat(600)));

        expect(updateApplication).toHaveBeenCalledWith({
            where: { id: "app-1" },
            data: expect.objectContaining({
                submissionStatus: SubmissionStatus.FAILED,
                lastSubmissionError: "x".repeat(500),
            }),
        });
    });

    it("composeAndSendApplyEmail uses a fallback body when no cover letter exists", async () => {
        findApplication.mockResolvedValue({
            ...APPLICATION,
            coverLetter: null,
        } as never);

        await composeAndSendApplyEmail("app-1");

        const args = sendEmail.mock.calls[0][0];
        expect(args.text).toContain("I would like to apply for the Senior Engineer position");
    });
});
