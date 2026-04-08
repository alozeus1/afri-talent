import { Router } from "express";
import multer from "multer";
import { Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { extractResumeText, parseResumeText, toCandidateProfileDraft, } from "../lib/resume-parser.js";
import { computeProfileCompleteness } from "../lib/profile-completeness.js";
import { refreshCandidateTrustProfile } from "../lib/trust/service.js";
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, callback) => {
        const name = file.originalname.toLowerCase();
        const allowedMime = file.mimetype.includes("pdf") ||
            file.mimetype.includes("msword") ||
            file.mimetype.includes("officedocument.wordprocessingml.document");
        const allowedExt = name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx");
        if (allowedMime || allowedExt) {
            callback(null, true);
            return;
        }
        callback(new Error("Unsupported file format. Please upload PDF or DOCX."));
    },
});
const profileDraftSchema = z
    .object({
    headline: z.string().min(2).max(200).optional(),
    bio: z.string().min(10).max(5000).optional(),
    skills: z.array(z.string().min(1).max(100)).max(50).optional(),
    targetRoles: z.array(z.string().min(1).max(100)).max(20).optional(),
    yearsExperience: z.number().min(0).max(50).optional(),
    linkedinUrl: z.string().url().max(500).optional(),
    githubUrl: z.string().url().max(500).optional(),
    portfolioUrl: z.string().url().max(500).optional(),
    workHistory: z.array(z.object({
        company: z.string().max(160).optional(),
        title: z.string().max(160).optional(),
        period: z.string().max(120).optional(),
        description: z.string().max(1200).optional(),
    })).max(20).optional(),
    educationHistory: z.array(z.object({
        institution: z.string().max(160).optional(),
        degree: z.string().max(160).optional(),
        period: z.string().max(120).optional(),
    })).max(12).optional(),
    certifications: z.array(z.object({
        name: z.string().max(160).optional(),
        issuer: z.string().max(160).optional(),
        credentialUrl: z.string().url().max(500).optional(),
    })).max(20).optional(),
})
    .partial();
const applyDraftSchema = z.object({
    confirm: z.boolean(),
    overwriteExisting: z.boolean().default(false),
    draft: profileDraftSchema,
});
function mergeDraft(existing, draft, overwriteExisting) {
    const ensureUnique = (arr) => Array.from(new Set(arr.map((item) => item.trim()).filter(Boolean)));
    const useDraftOrExisting = (existingValue, draftValue) => overwriteExisting && draftValue !== undefined ? draftValue : existingValue ?? draftValue;
    const merged = {
        headline: overwriteExisting && draft.headline !== undefined
            ? draft.headline
            : existing?.headline || draft.headline || null,
        bio: overwriteExisting && draft.bio !== undefined
            ? draft.bio
            : existing?.bio || draft.bio || null,
        skills: overwriteExisting
            ? ensureUnique(draft.skills || [])
            : ensureUnique([...(existing?.skills || []), ...(draft.skills || [])]),
        targetRoles: overwriteExisting
            ? ensureUnique(draft.targetRoles || [])
            : ensureUnique([...(existing?.targetRoles || []), ...(draft.targetRoles || [])]),
        targetCountries: existing?.targetCountries || [],
        yearsExperience: overwriteExisting && draft.yearsExperience !== undefined
            ? draft.yearsExperience
            : existing?.yearsExperience ?? draft.yearsExperience ?? null,
        visaStatus: existing?.visaStatus || null,
        linkedinUrl: overwriteExisting && draft.linkedinUrl !== undefined
            ? draft.linkedinUrl
            : existing?.linkedinUrl || draft.linkedinUrl || null,
        githubUrl: overwriteExisting && draft.githubUrl !== undefined
            ? draft.githubUrl
            : existing?.githubUrl || draft.githubUrl || null,
        portfolioUrl: overwriteExisting && draft.portfolioUrl !== undefined
            ? draft.portfolioUrl
            : existing?.portfolioUrl || draft.portfolioUrl || null,
        workHistory: useDraftOrExisting(existing?.workHistory, draft.workHistory) || [],
        educationHistory: useDraftOrExisting(existing?.educationHistory, draft.educationHistory) || [],
        certifications: useDraftOrExisting(existing?.certifications, draft.certifications) || [],
    };
    return merged;
}
// POST /api/profile/resume-parser/parse
router.post("/parse", authenticate, authorize(Role.CANDIDATE), upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "Resume file is required" });
            return;
        }
        const text = await extractResumeText(req.file.buffer, req.file.mimetype, req.file.originalname);
        if (!text || text.length < 40) {
            res.status(400).json({
                error: "Could not extract enough content from resume. Please upload a clearer PDF or DOCX.",
            });
            return;
        }
        const parsed = parseResumeText(text);
        const profileDraft = toCandidateProfileDraft(parsed);
        const existing = await prisma.candidateProfile.findUnique({
            where: { userId: req.user.userId },
            select: {
                headline: true,
                bio: true,
                skills: true,
                targetRoles: true,
                yearsExperience: true,
                linkedinUrl: true,
                githubUrl: true,
                portfolioUrl: true,
                workHistory: true,
                educationHistory: true,
                certifications: true,
            },
        });
        res.json({
            file: {
                name: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
            },
            parsed,
            profileDraft,
            existingProfile: existing,
            requiresConfirmation: true,
        });
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : "Resume parsing failed",
        });
    }
});
// POST /api/profile/resume-parser/apply-draft
router.post("/apply-draft", authenticate, authorize(Role.CANDIDATE), async (req, res) => {
    try {
        const data = applyDraftSchema.parse(req.body);
        if (!data.confirm) {
            res.status(400).json({
                error: "Explicit confirmation is required before applying parsed resume data.",
            });
            return;
        }
        const existing = await prisma.candidateProfile.findUnique({
            where: { userId: req.user.userId },
            select: {
                id: true,
                userId: true,
                headline: true,
                bio: true,
                skills: true,
                targetRoles: true,
                targetCountries: true,
                yearsExperience: true,
                visaStatus: true,
                linkedinUrl: true,
                githubUrl: true,
                portfolioUrl: true,
                workHistory: true,
                educationHistory: true,
                certifications: true,
                resumes: { select: { id: true } },
            },
        });
        const merged = mergeDraft(existing, data.draft, data.overwriteExisting);
        const completeness = computeProfileCompleteness({
            ...merged,
            resumes: existing?.resumes || [],
        });
        const profile = await prisma.candidateProfile.upsert({
            where: { userId: req.user.userId },
            create: {
                userId: req.user.userId,
                ...merged,
                profileCompleteness: completeness,
            },
            update: {
                ...merged,
                profileCompleteness: completeness,
            },
            include: {
                resumes: {
                    orderBy: { uploadedAt: "desc" },
                },
            },
        });
        await refreshCandidateTrustProfile(req.user.userId).catch(() => undefined);
        res.json({
            profile,
            overwriteExisting: data.overwriteExisting,
            message: "Profile draft applied successfully.",
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Failed to apply profile draft" });
    }
});
export default router;
//# sourceMappingURL=resume-parser.js.map