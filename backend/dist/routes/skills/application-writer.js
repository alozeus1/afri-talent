// POST /api/skills/application-writer/generate        — generate cover letter
// POST /api/skills/application-writer/submit          — submit application with cover letter
// GET  /api/skills/application-writer/my-applications — list candidate's applications
//
// All routes require PROFESSIONAL subscription.
import { Router } from "express";
import { z } from "zod/v4";
import { Role, SubscriptionPlan, ApplicationStatus } from "@prisma/client";
import { authenticate, authorize } from "../../middleware/auth.js";
import { requirePlan } from "../../middleware/subscription.js";
import prisma from "../../lib/prisma.js";
import logger from "../../lib/logger.js";
import { writeCoverLetter } from "../../lib/ai/skills/application-writer.js";
import { gradeAiOutput } from "../../lib/ai/quality/quality-rubric.js";
const router = Router();
const skillsEnabled = process.env.SKILLS_ENABLED !== "false";
function checkSkillsEnabled(res) {
    if (!skillsEnabled) {
        res.status(503).json({ error: "AI Skills are not enabled on this instance" });
        return false;
    }
    return true;
}
const generateSchema = z.object({
    jobId: z.string().uuid(),
    resumeText: z.string().min(50).max(10000).optional(),
    tone: z.enum(["professional", "conversational", "executive"]).optional(),
});
const submitSchema = z.object({
    jobId: z.string().uuid(),
    coverLetter: z.string().min(1).max(5000),
    cvUrl: z.string().url().startsWith("https://").max(500).optional(),
});
// ── POST /api/skills/application-writer/generate ─────────────────────────────
router.post("/generate", authenticate, authorize(Role.CANDIDATE), requirePlan(SubscriptionPlan.PROFESSIONAL), async (req, res) => {
    if (!checkSkillsEnabled(res))
        return;
    try {
        const { jobId, resumeText: providedResumeText, tone } = generateSchema.parse(req.body);
        const userId = req.user.userId;
        // Fetch job
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, sourceName: true, description: true, status: true },
        });
        if (!job || job.status !== "PUBLISHED") {
            res.status(404).json({ error: "Job not found or not published" });
            return;
        }
        // Resolve resume text: prefer explicit body param, else use saved resume, else profile
        let resumeText = providedResumeText || "";
        if (!resumeText) {
            const savedResume = await prisma.userResume.findUnique({
                where: { userId },
                select: { rawText: true },
            });
            resumeText = savedResume?.rawText || "";
        }
        if (!resumeText) {
            const profile = await prisma.candidateProfile.findUnique({
                where: { userId },
                select: { headline: true, bio: true, skills: true },
            });
            if (profile) {
                resumeText = [profile.headline, profile.bio, profile.skills.join(", ")]
                    .filter(Boolean)
                    .join("\n");
            }
        }
        if (!resumeText) {
            res.status(400).json({
                error: "No resume data found. Please save a resume or complete your profile first.",
                code: "NO_RESUME",
            });
            return;
        }
        // Resolve candidate name
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
        });
        const result = await writeCoverLetter({
            candidateName: user?.name || user?.email || "Candidate",
            resumeText,
            jobTitle: job.title,
            jobCompany: job.sourceName || "the company",
            jobDescription: job.description,
            tone,
        });
        res.json({ coverLetter: result.coverLetter, source: result.source });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error, userId: req.user?.userId }, "[application-writer] generate failed");
        res.status(500).json({ error: "Failed to generate cover letter" });
    }
});
// ── POST /api/skills/application-writer/submit ────────────────────────────────
router.post("/submit", authenticate, authorize(Role.CANDIDATE), requirePlan(SubscriptionPlan.PROFESSIONAL), async (req, res) => {
    if (!checkSkillsEnabled(res))
        return;
    try {
        const { jobId, coverLetter, cvUrl } = submitSchema.parse(req.body);
        const userId = req.user.userId;
        // Verify job is published
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, status: true },
        });
        if (!job || job.status !== "PUBLISHED") {
            res.status(404).json({ error: "Job not found or not published" });
            return;
        }
        // Check for duplicate application
        const existing = await prisma.application.findUnique({
            where: { jobId_candidateId: { jobId, candidateId: userId } },
        });
        if (existing) {
            res.status(409).json({ error: "You have already applied to this job", applicationId: existing.id });
            return;
        }
        const application = await prisma.application.create({
            data: {
                jobId,
                candidateId: userId,
                coverLetter,
                cvUrl: cvUrl || null,
                status: ApplicationStatus.PENDING,
            },
            select: { id: true, status: true, createdAt: true },
        });
        res.status(201).json({
            message: "Application submitted successfully",
            application,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error, userId: req.user?.userId }, "[application-writer] submit failed");
        res.status(500).json({ error: "Failed to submit application" });
    }
});
// ── GET /api/skills/application-writer/my-applications ────────────────────────
router.get("/my-applications", authenticate, authorize(Role.CANDIDATE), requirePlan(SubscriptionPlan.PROFESSIONAL), async (req, res) => {
    if (!checkSkillsEnabled(res))
        return;
    try {
        const userId = req.user.userId;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;
        const [applications, total] = await Promise.all([
            prisma.application.findMany({
                where: { candidateId: userId },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    status: true,
                    coverLetter: true,
                    createdAt: true,
                    updatedAt: true,
                    job: {
                        select: {
                            id: true,
                            title: true,
                            sourceName: true,
                            location: true,
                            slug: true,
                        },
                    },
                },
            }),
            prisma.application.count({ where: { candidateId: userId } }),
        ]);
        res.json({ applications, total, page, limit });
    }
    catch (error) {
        logger.error({ error, userId: req.user?.userId }, "[application-writer] list failed");
        res.status(500).json({ error: "Failed to fetch applications" });
    }
});
// ── GET /api/skills/application-writer/readiness?jobId=<uuid> ─────────────────
// Returns pre-application quality assessment for the candidate's saved resume
// against a specific job. No AI calls — fully deterministic.
router.get("/readiness", authenticate, authorize(Role.CANDIDATE), requirePlan(SubscriptionPlan.PROFESSIONAL), async (req, res) => {
    if (!checkSkillsEnabled(res))
        return;
    try {
        const querySchema = z.object({ jobId: z.string().uuid() });
        const parseResult = querySchema.safeParse(req.query);
        if (!parseResult.success) {
            res.status(400).json({ error: "Validation failed", details: parseResult.error.issues });
            return;
        }
        const { jobId } = parseResult.data;
        const userId = req.user.userId;
        // Fetch resume and job in parallel
        const [resume, job] = await Promise.all([
            prisma.userResume.findUnique({ where: { userId }, select: { rawText: true } }),
            prisma.job.findUnique({
                where: { id: jobId },
                select: { title: true, description: true, tags: true },
            }),
        ]);
        if (!resume?.rawText) {
            res.status(400).json({ error: "Please save a resume first", code: "NO_RESUME" });
            return;
        }
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        // Grade the resume
        const report = gradeAiOutput({ text: resume.rawText, kind: "resume" });
        // Keyword coverage: job title + first 500 chars of description
        const jobText = `${job.title} ${(job.description || "").slice(0, 500)}`;
        const allJobWords = jobText
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 4);
        const uniqueJobWords = [...new Set(allJobWords)];
        const resumeLower = resume.rawText.toLowerCase();
        const matchedWords = uniqueJobWords.filter((w) => resumeLower.includes(w));
        const missingKeywords = uniqueJobWords.filter((w) => !resumeLower.includes(w));
        const keywordCoverage = uniqueJobWords.length > 0
            ? Math.round((matchedWords.length / uniqueJobWords.length) * 100)
            : 0;
        let status;
        let recommendation;
        if (report.grade === "FAIL" || keywordCoverage < 20) {
            status = "HIGH_RISK";
            recommendation =
                "Your resume has significant issues that may hurt your application. Review and improve before applying.";
        }
        else if (report.grade === "WARN" || keywordCoverage < 40) {
            status = "NEEDS_IMPROVEMENT";
            recommendation = "Your resume needs some improvements before applying to this role.";
        }
        else {
            status = "READY";
            recommendation = "Your resume is well-prepared for this role. Apply with confidence.";
        }
        res.json({
            jobId,
            jobTitle: job.title,
            status,
            resumeScore: report.score,
            resumeGrade: report.grade,
            resumeIssues: report.issues.map(({ code, severity, message }) => ({
                code,
                severity,
                message,
            })),
            keywordCoverage,
            missingKeywords: missingKeywords.slice(0, 20), // cap list length
            recommendation,
        });
    }
    catch (error) {
        logger.error({ error, userId: req.user?.userId }, "[application-writer] readiness failed");
        res.status(500).json({ error: "Failed to assess readiness" });
    }
});
export default router;
//# sourceMappingURL=application-writer.js.map