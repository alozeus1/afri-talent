import { Router } from "express";
import { MockInterviewArtifactType, MockInterviewStatus, MockInterviewVisibility, Role, SupportedLocale, } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
const router = Router();
const createSessionSchema = z.object({
    title: z.string().min(2).max(200),
    targetRole: z.string().min(2).max(120),
    promptLanguage: z.nativeEnum(SupportedLocale).optional(),
    questionSet: z.array(z.string().min(3).max(300)).max(20).optional(),
    visibility: z.nativeEnum(MockInterviewVisibility).optional(),
    retentionDays: z.number().int().min(1).max(365).optional(),
});
const feedbackSchema = z.object({
    transcript: z.array(z.object({
        speaker: z.enum(["interviewer", "candidate"]),
        text: z.string().min(1).max(2000),
        timestampMs: z.number().int().min(0).optional(),
    })).min(1).max(500),
    scoreCommunication: z.number().int().min(0).max(100).optional(),
    scoreTechnical: z.number().int().min(0).max(100).optional(),
    scoreProblemSolving: z.number().int().min(0).max(100).optional(),
    notes: z.array(z.string().min(1).max(500)).max(20).optional(),
});
const privacySchema = z.object({
    visibility: z.nativeEnum(MockInterviewVisibility).optional(),
    retentionDays: z.number().int().min(1).max(365).optional(),
    piiRedacted: z.boolean().optional(),
    status: z.nativeEnum(MockInterviewStatus).optional(),
});
const artifactSchema = z.object({
    type: z.nativeEnum(MockInterviewArtifactType),
    storageKey: z.string().min(5).max(500),
    contentType: z.string().max(120).optional(),
    sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024 * 1024).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
function redactPII(text) {
    return text
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
        .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]");
}
function summarizeFeedback(input) {
    const scores = [
        input.scoreCommunication,
        input.scoreTechnical,
        input.scoreProblemSolving,
    ].filter((value) => typeof value === "number");
    const overall = scores.length > 0
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null;
    const strengths = [];
    const improvements = [];
    if (typeof input.scoreCommunication === "number") {
        if (input.scoreCommunication >= 75)
            strengths.push("clear communication");
        if (input.scoreCommunication < 60)
            improvements.push("concise communication");
    }
    if (typeof input.scoreTechnical === "number") {
        if (input.scoreTechnical >= 75)
            strengths.push("technical depth");
        if (input.scoreTechnical < 60)
            improvements.push("technical accuracy");
    }
    if (typeof input.scoreProblemSolving === "number") {
        if (input.scoreProblemSolving >= 75)
            strengths.push("structured problem solving");
        if (input.scoreProblemSolving < 60)
            improvements.push("problem-solving structure");
    }
    const summaryParts = [
        overall !== null ? `Overall score: ${overall}/100.` : "Overall score: pending manual review.",
        strengths.length > 0 ? `Strengths: ${strengths.join(", ")}.` : null,
        improvements.length > 0 ? `Areas to improve: ${improvements.join(", ")}.` : null,
        input.notes && input.notes.length > 0 ? `Coach notes: ${input.notes.slice(0, 3).join(" ")}` : null,
    ].filter(Boolean);
    return {
        summary: summaryParts.join(" "),
        overall,
    };
}
router.get("/", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const sessions = await prisma.mockInterviewSession.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: "desc" },
        include: {
            artifacts: {
                orderBy: { createdAt: "desc" },
            },
        },
    });
    res.json(sessions);
});
router.post("/", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    try {
        const data = createSessionSchema.parse(req.body);
        const retentionDays = data.retentionDays ?? Number(process.env.MOCK_INTERVIEW_RETENTION_DAYS || 30);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
        const session = await prisma.mockInterviewSession.create({
            data: {
                userId: req.user.userId,
                title: data.title,
                targetRole: data.targetRole,
                promptLanguage: data.promptLanguage || SupportedLocale.EN,
                questionSet: data.questionSet,
                visibility: data.visibility || MockInterviewVisibility.PRIVATE,
                retentionDays,
                expiresAt,
                status: MockInterviewStatus.PROCESSING,
                startedAt: createdAt,
            },
        });
        res.status(201).json(session);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Failed to create mock interview session" });
    }
});
router.get("/:id", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    const session = await prisma.mockInterviewSession.findFirst({
        where: { id: req.params.id, userId: req.user.userId },
        include: {
            artifacts: {
                orderBy: { createdAt: "desc" },
            },
        },
    });
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    res.json(session);
});
router.post("/:id/feedback", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    try {
        const data = feedbackSchema.parse(req.body);
        const session = await prisma.mockInterviewSession.findFirst({
            where: { id: req.params.id, userId: req.user.userId },
        });
        if (!session) {
            res.status(404).json({ error: "Session not found" });
            return;
        }
        const transcript = data.transcript.map((entry) => ({
            ...entry,
            text: session.piiRedacted ? redactPII(entry.text) : entry.text,
        }));
        const { summary, overall } = summarizeFeedback(data);
        const updated = await prisma.mockInterviewSession.update({
            where: { id: session.id },
            data: {
                transcript,
                feedbackSummary: summary,
                scoreOverall: overall,
                scoreCommunication: data.scoreCommunication,
                scoreTechnical: data.scoreTechnical,
                scoreProblemSolving: data.scoreProblemSolving,
                status: MockInterviewStatus.READY,
                completedAt: new Date(),
            },
            include: {
                artifacts: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Failed to save interview feedback" });
    }
});
router.post("/:id/privacy", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    try {
        const data = privacySchema.parse(req.body);
        const session = await prisma.mockInterviewSession.findFirst({
            where: { id: req.params.id, userId: req.user.userId },
            select: { id: true, createdAt: true },
        });
        if (!session) {
            res.status(404).json({ error: "Session not found" });
            return;
        }
        const nextRetentionDays = data.retentionDays;
        const expiresAt = nextRetentionDays
            ? new Date(session.createdAt.getTime() + nextRetentionDays * 24 * 60 * 60 * 1000)
            : undefined;
        const updated = await prisma.mockInterviewSession.update({
            where: { id: session.id },
            data: {
                visibility: data.visibility,
                retentionDays: nextRetentionDays,
                piiRedacted: data.piiRedacted,
                status: data.status,
                expiresAt,
            },
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Failed to update privacy settings" });
    }
});
router.post("/:id/artifacts", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    try {
        const data = artifactSchema.parse(req.body);
        const session = await prisma.mockInterviewSession.findFirst({
            where: { id: req.params.id, userId: req.user.userId },
            select: { id: true },
        });
        if (!session) {
            res.status(404).json({ error: "Session not found" });
            return;
        }
        const artifact = await prisma.mockInterviewArtifact.create({
            data: {
                sessionId: session.id,
                type: data.type,
                storageKey: data.storageKey,
                contentType: data.contentType,
                sizeBytes: data.sizeBytes,
                metadata: data.metadata,
            },
        });
        res.status(201).json(artifact);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Failed to register interview artifact" });
    }
});
export default router;
//# sourceMappingURL=mock-interviews.js.map