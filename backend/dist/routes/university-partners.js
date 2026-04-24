import crypto from "crypto";
import { Router } from "express";
import { CandidatePartnerMarkerStatus, CandidatePartnerMarkerType, CandidateSkillVerificationMethod, CandidateSkillVerificationStatus, PartnerOrganizationType, Role, UniversityPartnerStatus, UniversityRecordStatus, UniversityRecordType, } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import logger from "../lib/logger.js";
import { refreshCandidateTrustProfile } from "../lib/trust/service.js";
const router = Router();
const createPartnerSchema = z.object({
    externalId: z.string().min(3).max(120),
    name: z.string().min(2).max(200),
    organizationType: z.nativeEnum(PartnerOrganizationType).default(PartnerOrganizationType.UNIVERSITY),
    country: z.string().length(2),
    website: z.string().url().optional(),
    apiKey: z.string().min(24).max(200),
});
const internshipSchema = z.object({
    externalRecordId: z.string().min(2).max(120),
    title: z.string().min(2).max(200),
    description: z.string().min(20).max(5000),
    location: z.string().max(120).optional(),
    country: z.string().max(100).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    skills: z.array(z.string().max(80)).max(50).optional(),
    slots: z.number().int().min(1).max(10000).optional(),
});
const graduatePipelineSchema = z.object({
    externalRecordId: z.string().min(2).max(120),
    programName: z.string().min(2).max(200),
    graduationYear: z.number().int().min(2000).max(2100),
    students: z.array(z.object({
        externalStudentId: z.string().min(2).max(120),
        fullName: z.string().min(2).max(200),
        emailHash: z.string().max(128).optional(),
        major: z.string().max(120).optional(),
        skills: z.array(z.string().max(80)).max(100).optional(),
    })).min(1).max(1000),
});
const skillsVerificationSchema = z.object({
    externalRecordId: z.string().min(2).max(120),
    externalStudentId: z.string().min(2).max(120),
    skillName: z.string().min(2).max(120),
    score: z.number().min(0).max(100).optional(),
    level: z.string().max(50).optional(),
    verificationProvider: z.string().max(120).optional(),
    verifiedAt: z.coerce.date().optional(),
});
const issuePartnerMarkerSchema = z.object({
    userId: z.string().uuid(),
    markerType: z.nativeEnum(CandidatePartnerMarkerType),
    partnerRecordId: z.string().uuid().optional(),
    label: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    expiresAt: z.coerce.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
const issueVerifiedSkillSchema = z.object({
    userId: z.string().uuid(),
    skillName: z.string().trim().min(2).max(120),
    method: z.enum([
        CandidateSkillVerificationMethod.PARTNER_ISSUED,
        CandidateSkillVerificationMethod.MANUAL_REVIEW,
    ]),
    partnerRecordId: z.string().uuid().optional(),
    evidenceLabel: z.string().trim().max(200).optional(),
    evidenceUrl: z.string().trim().url().max(500).optional(),
    score: z.number().int().min(0).max(100).optional(),
    confidenceNote: z.string().trim().max(255).optional(),
    expiresAt: z.coerce.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
function sha256(input) {
    return crypto.createHash("sha256").update(input).digest("hex");
}
async function authenticatePartnerKey(req, res, next) {
    const key = req.headers["x-afritalent-partner-key"]?.toString();
    if (!key) {
        res.status(401).json({ error: "Partner API key required" });
        return;
    }
    const partner = await prisma.universityPartner.findFirst({
        where: {
            apiKeyHash: sha256(key),
            status: UniversityPartnerStatus.ACTIVE,
        },
        select: { id: true, externalId: true, name: true },
    });
    if (!partner) {
        res.status(401).json({ error: "Invalid partner API key" });
        return;
    }
    req.partner = partner;
    next();
}
async function ingestPartnerRecord(params) {
    return prisma.universityPartnerRecord.upsert({
        where: {
            partnerId_type_externalRecordId: {
                partnerId: params.partnerId,
                type: params.type,
                externalRecordId: params.externalRecordId,
            },
        },
        create: {
            partnerId: params.partnerId,
            type: params.type,
            externalRecordId: params.externalRecordId,
            payload: params.payload,
            status: UniversityRecordStatus.RECEIVED,
        },
        update: {
            payload: params.payload,
            status: UniversityRecordStatus.VALIDATED,
            processedAt: new Date(),
        },
    });
}
router.use(requireFeatureFlag("PHASE4_UNIVERSITY_API_ENABLED"));
router.post("/admin/partners", authenticate, authorize(Role.ADMIN), async (req, res) => {
    try {
        const data = createPartnerSchema.parse(req.body);
        const partner = await prisma.universityPartner.create({
            data: {
                externalId: data.externalId,
                name: data.name,
                organizationType: data.organizationType,
                country: data.country.toUpperCase(),
                website: data.website || null,
                apiKeyHash: sha256(data.apiKey),
            },
        });
        res.status(201).json({
            partner: {
                id: partner.id,
                externalId: partner.externalId,
                name: partner.name,
                organizationType: partner.organizationType,
                country: partner.country,
                status: partner.status,
                createdAt: partner.createdAt,
            },
            keyAccepted: true,
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to create university partner");
        res.status(500).json({ error: "Failed to create university partner" });
    }
});
router.get("/admin/partners", authenticate, authorize(Role.ADMIN), async (_req, res) => {
    const partners = await prisma.universityPartner.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            externalId: true,
            name: true,
            organizationType: true,
            country: true,
            website: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            _count: {
                select: {
                    records: true,
                    verifiedSkills: true,
                    partnerMarkers: true,
                },
            },
        },
    });
    res.json({ partners });
});
router.get("/admin/partners/:partnerId/records", authenticate, authorize(Role.ADMIN), async (req, res) => {
    try {
        const partner = await prisma.universityPartner.findUnique({
            where: { id: req.params.partnerId },
            select: {
                id: true,
                externalId: true,
                name: true,
                organizationType: true,
                country: true,
                website: true,
                status: true,
            },
        });
        if (!partner) {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        const limit = Math.min(Number(req.query.limit || 50), 200);
        const [records, issuedSkills, issuedMarkers] = await Promise.all([
            prisma.universityPartnerRecord.findMany({
                where: { partnerId: req.params.partnerId },
                orderBy: { receivedAt: "desc" },
                take: limit,
            }),
            prisma.candidateVerifiedSkill.findMany({
                where: { partnerId: req.params.partnerId },
                orderBy: { createdAt: "desc" },
                take: limit,
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
            prisma.candidatePartnerMarker.findMany({
                where: { partnerId: req.params.partnerId },
                orderBy: { createdAt: "desc" },
                take: limit,
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        res.json({
            partner,
            records,
            issuedSkills,
            issuedMarkers,
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to load partner admin detail");
        res.status(500).json({ error: "Failed to load partner admin detail" });
    }
});
router.post("/admin/partners/:partnerId/markers", authenticate, authorize(Role.ADMIN), async (req, res) => {
    try {
        const data = issuePartnerMarkerSchema.parse(req.body);
        const partner = await prisma.universityPartner.findUnique({
            where: { id: req.params.partnerId },
            select: { id: true, name: true, organizationType: true },
        });
        if (!partner) {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        const existing = await prisma.candidatePartnerMarker.findFirst({
            where: {
                userId: data.userId,
                partnerId: partner.id,
                markerType: data.markerType,
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        const label = data.label ||
            `${partner.name} ${data.markerType.replaceAll("_", " ").toLowerCase()}`;
        const marker = existing
            ? await prisma.candidatePartnerMarker.update({
                where: { id: existing.id },
                data: {
                    status: CandidatePartnerMarkerStatus.ACTIVE,
                    label,
                    description: data.description ?? null,
                    partnerRecordId: data.partnerRecordId ?? null,
                    reviewerId: req.user.userId,
                    issuedAt: new Date(),
                    expiresAt: data.expiresAt ?? null,
                    metadata: data.metadata,
                },
                include: {
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            country: true,
                            organizationType: true,
                        },
                    },
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            })
            : await prisma.candidatePartnerMarker.create({
                data: {
                    userId: data.userId,
                    partnerId: partner.id,
                    partnerRecordId: data.partnerRecordId ?? null,
                    markerType: data.markerType,
                    status: CandidatePartnerMarkerStatus.ACTIVE,
                    label,
                    description: data.description ?? null,
                    reviewerId: req.user.userId,
                    issuedAt: new Date(),
                    expiresAt: data.expiresAt ?? null,
                    metadata: data.metadata,
                },
                include: {
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            country: true,
                            organizationType: true,
                        },
                    },
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            });
        await refreshCandidateTrustProfile(data.userId).catch(() => undefined);
        res.status(201).json({ marker });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to issue partner marker");
        res.status(500).json({ error: "Failed to issue partner marker" });
    }
});
router.post("/admin/partners/:partnerId/verified-skills", authenticate, authorize(Role.ADMIN), async (req, res) => {
    try {
        const data = issueVerifiedSkillSchema.parse(req.body);
        const partner = await prisma.universityPartner.findUnique({
            where: { id: req.params.partnerId },
            select: { id: true },
        });
        if (!partner) {
            res.status(404).json({ error: "Partner not found" });
            return;
        }
        const existing = await prisma.candidateVerifiedSkill.findFirst({
            where: {
                userId: data.userId,
                partnerId: partner.id,
                skillName: {
                    equals: data.skillName,
                    mode: "insensitive",
                },
                method: data.method,
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        const skill = existing
            ? await prisma.candidateVerifiedSkill.update({
                where: { id: existing.id },
                data: {
                    skillName: data.skillName,
                    method: data.method,
                    status: CandidateSkillVerificationStatus.VERIFIED,
                    partnerRecordId: data.partnerRecordId ?? null,
                    reviewerId: req.user.userId,
                    evidenceLabel: data.evidenceLabel ?? null,
                    evidenceUrl: data.evidenceUrl ?? null,
                    score: data.score ?? null,
                    confidenceNote: data.confidenceNote ?? null,
                    expiresAt: data.expiresAt ?? null,
                    metadata: data.metadata,
                    verifiedAt: new Date(),
                },
                include: {
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            organizationType: true,
                        },
                    },
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            })
            : await prisma.candidateVerifiedSkill.create({
                data: {
                    userId: data.userId,
                    skillName: data.skillName,
                    method: data.method,
                    status: CandidateSkillVerificationStatus.VERIFIED,
                    partnerId: partner.id,
                    partnerRecordId: data.partnerRecordId ?? null,
                    reviewerId: req.user.userId,
                    evidenceLabel: data.evidenceLabel ?? null,
                    evidenceUrl: data.evidenceUrl ?? null,
                    score: data.score ?? null,
                    confidenceNote: data.confidenceNote ?? null,
                    expiresAt: data.expiresAt ?? null,
                    metadata: data.metadata,
                    verifiedAt: new Date(),
                },
                include: {
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            organizationType: true,
                        },
                    },
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            });
        await refreshCandidateTrustProfile(data.userId).catch(() => undefined);
        res.status(201).json({ skill });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to issue verified skill");
        res.status(500).json({ error: "Failed to issue verified skill" });
    }
});
router.use(authenticatePartnerKey);
router.get("/ingest", async (req, res) => {
    const typeQuery = req.query.type;
    const statusQuery = req.query.status;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const records = await prisma.universityPartnerRecord.findMany({
        where: {
            partnerId: req.partner.id,
            ...(typeQuery ? { type: typeQuery } : {}),
            ...(statusQuery ? { status: statusQuery } : {}),
        },
        orderBy: { receivedAt: "desc" },
        take: limit,
    });
    res.json({
        partner: req.partner,
        records,
    });
});
router.post("/ingest/internships", async (req, res) => {
    try {
        const payload = internshipSchema.parse(req.body);
        const record = await ingestPartnerRecord({
            partnerId: req.partner.id,
            type: UniversityRecordType.INTERNSHIP,
            externalRecordId: payload.externalRecordId,
            payload: payload,
        });
        res.status(201).json({ record });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to ingest internship record");
        res.status(500).json({ error: "Failed to ingest internship record" });
    }
});
router.post("/ingest/graduates", async (req, res) => {
    try {
        const payload = graduatePipelineSchema.parse(req.body);
        const record = await ingestPartnerRecord({
            partnerId: req.partner.id,
            type: UniversityRecordType.GRADUATE_PIPELINE,
            externalRecordId: payload.externalRecordId,
            payload: payload,
        });
        res.status(201).json({ record });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to ingest graduate pipeline record");
        res.status(500).json({ error: "Failed to ingest graduate pipeline record" });
    }
});
router.post("/ingest/skills-verifications", async (req, res) => {
    try {
        const payload = skillsVerificationSchema.parse(req.body);
        const record = await ingestPartnerRecord({
            partnerId: req.partner.id,
            type: UniversityRecordType.SKILLS_VERIFICATION,
            externalRecordId: payload.externalRecordId,
            payload: payload,
        });
        res.status(201).json({ record });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to ingest skills verification record");
        res.status(500).json({ error: "Failed to ingest skills verification record" });
    }
});
export default router;
//# sourceMappingURL=university-partners.js.map