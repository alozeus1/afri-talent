import { Router } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import logger from "../lib/logger.js";
import { candidateTrustSummary, canUseVerifiedCandidateFilter, } from "../lib/trust/service.js";
import { buildTalentMatch } from "../lib/talent/match.js";
import { CANDIDATE_SEMANTIC_NAMESPACE, CANDIDATE_SEMANTIC_SOURCE_TYPE, } from "../lib/rag/candidate-documents.js";
import { searchSemanticDocuments } from "../lib/rag/store.js";
const router = Router();
const searchQuerySchema = z.object({
    query: z.string().trim().max(240).optional(),
    skills: z.string().trim().max(240).optional(),
    location: z.string().trim().max(120).optional(),
    minExperience: z.coerce.number().int().min(0).optional(),
    maxExperience: z.coerce.number().int().min(0).optional(),
    visaStatus: z.string().trim().max(100).optional(),
    verifiedOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
    verifiedSkillsOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
    fullyCompletedOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
    assessmentBackedOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
});
const poolSchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1200).optional(),
});
const poolCandidateSchema = z.object({
    candidateUserId: z.string().uuid(),
    stage: z.string().trim().min(2).max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    semanticScore: z.number().int().min(0).max(100).optional(),
    trustScoreSnapshot: z.number().int().min(0).max(100).optional(),
    mobilityScoreSnapshot: z.number().int().min(0).max(100).optional(),
});
const poolCandidateUpdateSchema = z.object({
    stage: z.string().trim().min(2).max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
});
const compareQuerySchema = z.object({
    candidateIds: z.string().trim().min(1),
    query: z.string().trim().max(240).optional(),
    location: z.string().trim().max(120).optional(),
    minExperience: z.coerce.number().int().min(0).optional(),
    skills: z.string().trim().max(240).optional(),
});
function parseBoolean(value) {
    return value === "true";
}
function normalizeCsv(value) {
    return (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
}
async function getEmployerContext(userId) {
    return prisma.employer.findUnique({
        where: { userId },
        select: { id: true, companyName: true },
    });
}
async function loadCandidateEvidence(userIds, employerId) {
    if (userIds.length === 0) {
        return {
            assessments: new Map(),
            verifiedSkills: new Map(),
            partnerMarkers: new Map(),
            immigrationProcesses: new Map(),
            poolMemberships: new Map(),
        };
    }
    const [assessments, verifiedSkills, partnerMarkers, immigrationProcesses, poolMemberships] = await Promise.all([
        prisma.skillAssessment.findMany({
            where: { userId: { in: userIds } },
            orderBy: { completedAt: "desc" },
        }),
        prisma.candidateVerifiedSkill.findMany({
            where: {
                userId: { in: userIds },
                status: "VERIFIED",
            },
            orderBy: { verifiedAt: "desc" },
            include: {
                partner: {
                    select: {
                        id: true,
                        name: true,
                        organizationType: true,
                    },
                },
            },
        }),
        prisma.candidatePartnerMarker.findMany({
            where: {
                userId: { in: userIds },
                status: "ACTIVE",
            },
            orderBy: { issuedAt: "desc" },
            include: {
                partner: {
                    select: {
                        id: true,
                        name: true,
                        country: true,
                        organizationType: true,
                    },
                },
            },
        }),
        prisma.immigrationProcess.findMany({
            where: { userId: { in: userIds } },
            orderBy: { updatedAt: "desc" },
            select: {
                userId: true,
                visaType: true,
                targetCountry: true,
                status: true,
                updatedAt: true,
            },
        }),
        employerId
            ? prisma.employerTalentPoolCandidate.findMany({
                where: {
                    candidateUserId: { in: userIds },
                    pool: { employerId },
                },
                include: {
                    pool: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: { updatedAt: "desc" },
            })
            : Promise.resolve([]),
    ]);
    const assessmentsMap = new Map();
    assessments.forEach((assessment) => {
        const list = assessmentsMap.get(assessment.userId) ?? [];
        list.push(assessment);
        assessmentsMap.set(assessment.userId, list);
    });
    const verifiedSkillsMap = new Map();
    verifiedSkills.forEach((skill) => {
        const list = verifiedSkillsMap.get(skill.userId) ?? [];
        list.push(skill);
        verifiedSkillsMap.set(skill.userId, list);
    });
    const partnerMarkerMap = new Map();
    partnerMarkers.forEach((marker) => {
        const list = partnerMarkerMap.get(marker.userId) ?? [];
        list.push(marker);
        partnerMarkerMap.set(marker.userId, list);
    });
    const immigrationMap = new Map();
    immigrationProcesses.forEach((process) => {
        const list = immigrationMap.get(process.userId) ?? [];
        list.push(process);
        immigrationMap.set(process.userId, list);
    });
    const poolMembershipMap = new Map();
    poolMemberships.forEach((membership) => {
        const list = poolMembershipMap.get(membership.candidateUserId) ?? [];
        list.push(membership);
        poolMembershipMap.set(membership.candidateUserId, list);
    });
    return {
        assessments: assessmentsMap,
        verifiedSkills: verifiedSkillsMap,
        partnerMarkers: partnerMarkerMap,
        immigrationProcesses: immigrationMap,
        poolMemberships: poolMembershipMap,
    };
}
function buildTalentResult(params) {
    const trust = params.candidate.user.candidateTrustProfile
        ? candidateTrustSummary(params.candidate.user.candidateTrustProfile)
        : null;
    const baseMatch = buildTalentMatch({
        query: params.query,
        desiredSkills: params.desiredSkills,
        targetLocation: params.targetLocation,
        minExperience: params.minExperience,
        candidate: {
            userId: params.candidate.userId,
            headline: params.candidate.headline,
            bio: params.candidate.bio,
            skills: params.candidate.skills,
            targetRoles: params.candidate.targetRoles,
            targetCountries: params.candidate.targetCountries,
            yearsExperience: params.candidate.yearsExperience,
            visaStatus: params.candidate.visaStatus,
            profileCompleteness: params.candidate.profileCompleteness,
            workHistory: Array.isArray(params.candidate.workHistory)
                ? params.candidate.workHistory
                : [],
        },
        trust: params.candidate.user.candidateTrustProfile
            ? {
                authenticityScore: params.candidate.user.candidateTrustProfile.authenticityScore,
                verifiedSkillCount: params.candidate.user.candidateTrustProfile.verifiedSkillCount,
                partnerSignalCount: params.candidate.user.candidateTrustProfile.partnerSignalCount,
                assessmentBacked: params.candidate.user.candidateTrustProfile.assessmentBacked,
                premiumFilterEligible: params.candidate.user.candidateTrustProfile.premiumFilterEligible,
                fullyCompletedProfile: params.candidate.user.candidateTrustProfile.fullyCompletedProfile,
                riskScore: params.candidate.user.candidateTrustProfile.riskScore,
            }
            : null,
        immigrationProcesses: params.immigrationProcesses.map((process) => ({
            targetCountry: process.targetCountry,
            visaType: process.visaType,
            status: process.status,
        })),
    });
    const semanticDocumentScore = clampScore((params.semanticDocumentScore || 0) * 100);
    const semanticScore = Math.max(baseMatch.semanticScore, semanticDocumentScore);
    const score = clampScore((baseMatch.score * 0.8) + (semanticScore * 0.2));
    const reasons = [...baseMatch.reasons];
    if (semanticDocumentScore > baseMatch.semanticScore) {
        reasons.unshift(`Indexed semantic search also surfaced this profile (${semanticDocumentScore}/100).`);
    }
    return {
        ...params.candidate,
        skillAssessments: params.assessments,
        verifiedSkills: params.verifiedSkills,
        partnerMarkers: params.partnerMarkers,
        trust,
        match: {
            ...baseMatch,
            score,
            semanticScore,
            reasons: reasons.slice(0, 4),
        },
        mobility: baseMatch.mobility,
        poolMemberships: params.poolMemberships.map((membership) => ({
            id: membership.id,
            stage: membership.stage,
            notes: membership.notes,
            poolId: membership.pool.id,
            poolName: membership.pool.name,
        })),
    };
}
router.use(authenticate, authorize(Role.EMPLOYER, Role.ADMIN));
router.get("/pools", async (req, res) => {
    try {
        const employer = await getEmployerContext(req.user.userId);
        if (!employer) {
            res.status(404).json({ error: "Employer profile not found" });
            return;
        }
        const pools = await prisma.employerTalentPool.findMany({
            where: { employerId: employer.id },
            orderBy: { updatedAt: "desc" },
            include: {
                _count: {
                    select: { candidates: true },
                },
                candidates: {
                    orderBy: { updatedAt: "desc" },
                    take: 4,
                    select: {
                        id: true,
                        stage: true,
                        candidateUserId: true,
                        candidate: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });
        res.json({
            pools: pools.map((pool) => ({
                id: pool.id,
                name: pool.name,
                description: pool.description,
                candidateCount: pool._count.candidates,
                createdAt: pool.createdAt,
                updatedAt: pool.updatedAt,
                recentCandidates: pool.candidates.map((candidate) => ({
                    id: candidate.id,
                    candidateUserId: candidate.candidateUserId,
                    stage: candidate.stage,
                    candidateName: candidate.candidate.name,
                })),
            })),
        });
    }
    catch (error) {
        logger.error({ error }, "Talent pools list error");
        res.status(500).json({ error: "Failed to load talent pools" });
    }
});
router.post("/pools", async (req, res) => {
    try {
        const payload = poolSchema.parse(req.body);
        const employer = await getEmployerContext(req.user.userId);
        if (!employer) {
            res.status(404).json({ error: "Employer profile not found" });
            return;
        }
        const pool = await prisma.employerTalentPool.create({
            data: {
                employerId: employer.id,
                name: payload.name,
                description: payload.description,
            },
        });
        res.status(201).json({ pool });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            res.status(409).json({ error: "A talent pool with that name already exists." });
            return;
        }
        logger.error({ error }, "Create talent pool error");
        res.status(500).json({ error: "Failed to create talent pool" });
    }
});
router.post("/pools/:poolId/candidates", async (req, res) => {
    try {
        const payload = poolCandidateSchema.parse(req.body);
        const employer = await getEmployerContext(req.user.userId);
        if (!employer) {
            res.status(404).json({ error: "Employer profile not found" });
            return;
        }
        const pool = await prisma.employerTalentPool.findFirst({
            where: {
                id: req.params.poolId,
                employerId: employer.id,
            },
        });
        if (!pool) {
            res.status(404).json({ error: "Talent pool not found" });
            return;
        }
        const candidate = await prisma.candidateProfile.findUnique({
            where: { userId: payload.candidateUserId },
            select: { userId: true, openToWork: true },
        });
        if (!candidate || !candidate.openToWork) {
            res.status(404).json({ error: "Candidate not available for employer pools" });
            return;
        }
        const membership = await prisma.employerTalentPoolCandidate.upsert({
            where: {
                poolId_candidateUserId: {
                    poolId: pool.id,
                    candidateUserId: payload.candidateUserId,
                },
            },
            update: {
                stage: payload.stage || "SOURCED",
                notes: payload.notes,
                semanticScore: payload.semanticScore,
                trustScoreSnapshot: payload.trustScoreSnapshot,
                mobilityScoreSnapshot: payload.mobilityScoreSnapshot,
            },
            create: {
                poolId: pool.id,
                candidateUserId: payload.candidateUserId,
                addedByUserId: req.user.userId,
                stage: payload.stage || "SOURCED",
                notes: payload.notes,
                semanticScore: payload.semanticScore,
                trustScoreSnapshot: payload.trustScoreSnapshot,
                mobilityScoreSnapshot: payload.mobilityScoreSnapshot,
            },
            include: {
                pool: {
                    select: { id: true, name: true },
                },
            },
        });
        res.status(201).json({ membership });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Add candidate to talent pool error");
        res.status(500).json({ error: "Failed to add candidate to pool" });
    }
});
router.patch("/pools/:poolId/candidates/:candidateUserId", async (req, res) => {
    try {
        const payload = poolCandidateUpdateSchema.parse(req.body);
        const employer = await getEmployerContext(req.user.userId);
        if (!employer) {
            res.status(404).json({ error: "Employer profile not found" });
            return;
        }
        const membership = await prisma.employerTalentPoolCandidate.findFirst({
            where: {
                candidateUserId: req.params.candidateUserId,
                poolId: req.params.poolId,
                pool: {
                    employerId: employer.id,
                },
            },
        });
        if (!membership) {
            res.status(404).json({ error: "Pool membership not found" });
            return;
        }
        const updated = await prisma.employerTalentPoolCandidate.update({
            where: { id: membership.id },
            data: {
                stage: payload.stage ?? membership.stage,
                notes: payload.notes ?? membership.notes,
            },
            include: {
                pool: {
                    select: { id: true, name: true },
                },
            },
        });
        res.json({ membership: updated });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Update talent pool membership error");
        res.status(500).json({ error: "Failed to update pool membership" });
    }
});
router.delete("/pools/:poolId/candidates/:candidateUserId", async (req, res) => {
    try {
        const employer = await getEmployerContext(req.user.userId);
        if (!employer) {
            res.status(404).json({ error: "Employer profile not found" });
            return;
        }
        const membership = await prisma.employerTalentPoolCandidate.findFirst({
            where: {
                candidateUserId: req.params.candidateUserId,
                poolId: req.params.poolId,
                pool: {
                    employerId: employer.id,
                },
            },
        });
        if (!membership) {
            res.status(404).json({ error: "Pool membership not found" });
            return;
        }
        await prisma.employerTalentPoolCandidate.delete({
            where: { id: membership.id },
        });
        res.status(204).send();
    }
    catch (error) {
        logger.error({ error }, "Delete talent pool membership error");
        res.status(500).json({ error: "Failed to remove candidate from pool" });
    }
});
router.get("/compare", async (req, res) => {
    try {
        const payload = compareQuerySchema.parse(req.query);
        const candidateIds = Array.from(new Set(payload.candidateIds.split(",").map((id) => id.trim()).filter(Boolean))).slice(0, 4);
        if (candidateIds.length < 2) {
            res.status(400).json({ error: "At least two candidate ids are required for comparison" });
            return;
        }
        const employer = await getEmployerContext(req.user.userId);
        const candidates = await prisma.candidateProfile.findMany({
            where: {
                userId: { in: candidateIds },
                openToWork: true,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        candidateTrustProfile: true,
                    },
                },
                resumes: {
                    where: { isActive: true },
                },
            },
        });
        const evidence = await loadCandidateEvidence(candidateIds, employer?.id);
        const desiredSkills = normalizeCsv(payload.skills);
        const enriched = candidates.map((candidate) => buildTalentResult({
            candidate,
            assessments: evidence.assessments.get(candidate.userId) ?? [],
            verifiedSkills: evidence.verifiedSkills.get(candidate.userId) ?? [],
            partnerMarkers: evidence.partnerMarkers.get(candidate.userId) ?? [],
            immigrationProcesses: evidence.immigrationProcesses.get(candidate.userId) ?? [],
            poolMemberships: evidence.poolMemberships.get(candidate.userId) ?? [],
            desiredSkills,
            targetLocation: payload.location,
            query: payload.query,
            minExperience: payload.minExperience,
        })).sort((left, right) => right.match.score - left.match.score);
        const commonSkills = enriched.reduce((shared, candidate, index) => {
            if (index === 0) {
                return candidate.skills;
            }
            const current = new Set(candidate.skills.map((skill) => skill.toLowerCase()));
            return shared.filter((skill) => current.has(skill.toLowerCase()));
        }, []);
        res.json({
            candidates: enriched,
            comparison: {
                commonSkills: commonSkills.slice(0, 8),
                recommendedLead: enriched[0]?.user.id ?? null,
                summary: enriched.length > 0
                    ? `${enriched[0].user.name} currently leads on overall fit, but compare trust and mobility context before outreach.`
                    : "No comparison candidates available.",
            },
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Talent compare error");
        res.status(500).json({ error: "Failed to compare candidates" });
    }
});
// GET /api/talent - Search candidates (employer/admin only)
router.get("/", async (req, res) => {
    try {
        const parsed = searchQuerySchema.parse(req.query);
        const desiredSkills = normalizeCsv(parsed.skills);
        const employer = req.user.role === Role.EMPLOYER
            ? await getEmployerContext(req.user.userId)
            : null;
        const subscription = req.user.role === Role.EMPLOYER
            ? await prisma.subscription.findUnique({
                where: { userId: req.user.userId },
                select: { plan: true },
            }).catch(() => null)
            : null;
        const requiresPremiumTrustFilters = parseBoolean(parsed.verifiedOnly) || parseBoolean(parsed.verifiedSkillsOnly) || parseBoolean(parsed.assessmentBackedOnly);
        if (requiresPremiumTrustFilters && !canUseVerifiedCandidateFilter(subscription?.plan, req.user.role)) {
            res.status(403).json({
                error: "Verified-candidate filters are available to premium trusted employers.",
                code: "PREMIUM_VERIFIED_FILTER_REQUIRED",
            });
            return;
        }
        const semanticHits = parsed.query
            ? await searchSemanticDocuments({
                namespace: CANDIDATE_SEMANTIC_NAMESPACE,
                sourceTypes: [CANDIDATE_SEMANTIC_SOURCE_TYPE],
                query: parsed.query,
                limit: 120,
                candidateLimit: 250,
                minScore: 0.1,
            }).catch((error) => {
                logger.warn({ error }, "Talent semantic search fallback engaged");
                return [];
            })
            : [];
        const semanticCandidateIds = semanticHits.map((hit) => hit.sourceId);
        const semanticScoreMap = new Map();
        semanticHits.forEach((hit) => {
            semanticScoreMap.set(hit.sourceId, hit.score);
        });
        const andConditions = [
            {
                openToWork: true,
                user: {
                    accountRestrictionStatus: {
                        not: "SUSPENDED",
                    },
                },
            },
        ];
        const trustFilters = {};
        if (parseBoolean(parsed.verifiedOnly)) {
            trustFilters.premiumFilterEligible = true;
        }
        if (parseBoolean(parsed.verifiedSkillsOnly)) {
            trustFilters.verifiedSkillCount = { gt: 0 };
        }
        if (parseBoolean(parsed.fullyCompletedOnly)) {
            trustFilters.fullyCompletedProfile = true;
        }
        if (parseBoolean(parsed.assessmentBackedOnly)) {
            trustFilters.assessmentBacked = true;
        }
        if (Object.keys(trustFilters).length > 0) {
            andConditions.push({
                user: {
                    candidateTrustProfile: {
                        is: trustFilters,
                    },
                },
            });
        }
        if (desiredSkills.length > 0) {
            andConditions.push({
                skills: { hasSome: desiredSkills },
            });
        }
        if (parsed.location) {
            andConditions.push({
                targetCountries: { has: parsed.location },
            });
        }
        if (parsed.minExperience != null) {
            andConditions.push({
                yearsExperience: {
                    gte: parsed.minExperience,
                },
            });
        }
        if (parsed.maxExperience != null) {
            andConditions.push({
                yearsExperience: {
                    lte: parsed.maxExperience,
                },
            });
        }
        if (parsed.visaStatus) {
            andConditions.push({
                visaStatus: { contains: parsed.visaStatus, mode: "insensitive" },
            });
        }
        if (parsed.query) {
            const queryTokens = parsed.query
                .split(/[,\s/]+/)
                .map((token) => token.trim())
                .filter((token) => token.length > 2)
                .slice(0, 10);
            const queryClauses = [
                { headline: { contains: parsed.query, mode: "insensitive" } },
                { bio: { contains: parsed.query, mode: "insensitive" } },
            ];
            if (queryTokens.length > 0) {
                queryClauses.push({ skills: { hasSome: queryTokens } });
                queryClauses.push({ targetRoles: { hasSome: queryTokens } });
            }
            if (semanticCandidateIds.length > 0) {
                queryClauses.push({ userId: { in: semanticCandidateIds } });
            }
            andConditions.push({ OR: queryClauses });
        }
        const where = { AND: andConditions };
        const parsedLimit = parsed.limit;
        const candidateFetchLimit = Math.min(400, Math.max(150, parsed.page * parsedLimit * 15));
        const [candidates, total] = await Promise.all([
            prisma.candidateProfile.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            candidateTrustProfile: true,
                        },
                    },
                    resumes: {
                        where: { isActive: true },
                    },
                },
                orderBy: { updatedAt: "desc" },
                take: candidateFetchLimit,
            }),
            prisma.candidateProfile.count({ where }),
        ]);
        const userIds = candidates.map((candidate) => candidate.userId);
        const evidence = await loadCandidateEvidence(userIds, employer?.id);
        const results = candidates
            .map((candidate) => buildTalentResult({
            candidate,
            assessments: evidence.assessments.get(candidate.userId) ?? [],
            verifiedSkills: evidence.verifiedSkills.get(candidate.userId) ?? [],
            partnerMarkers: evidence.partnerMarkers.get(candidate.userId) ?? [],
            immigrationProcesses: evidence.immigrationProcesses.get(candidate.userId) ?? [],
            poolMemberships: evidence.poolMemberships.get(candidate.userId) ?? [],
            desiredSkills,
            targetLocation: parsed.location,
            query: parsed.query,
            minExperience: parsed.minExperience,
            semanticDocumentScore: semanticScoreMap.get(candidate.userId),
        }))
            .sort((left, right) => {
            if (right.match.score !== left.match.score) {
                return right.match.score - left.match.score;
            }
            return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        });
        const start = (parsed.page - 1) * parsedLimit;
        const end = start + parsedLimit;
        const pageResults = results.slice(start, end);
        res.json({
            candidates: pageResults,
            pagination: {
                page: parsed.page,
                limit: parsedLimit,
                total,
                totalPages: Math.ceil(total / parsedLimit),
            },
            semantic: {
                query: parsed.query || null,
                hitCount: semanticHits.length,
                providerUsed: semanticHits.length > 0,
            },
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Talent search error");
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/talent/:userId - Get candidate detail (employer/admin only)
router.get("/:userId", async (req, res) => {
    try {
        const employer = req.user.role === Role.EMPLOYER ? await getEmployerContext(req.user.userId) : null;
        const profile = await prisma.candidateProfile.findUnique({
            where: { userId: req.params.userId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        candidateTrustProfile: true,
                    },
                },
                resumes: {
                    where: { isActive: true },
                },
            },
        });
        if (!profile || !profile.openToWork) {
            res.status(404).json({ error: "Candidate not found" });
            return;
        }
        const evidence = await loadCandidateEvidence([req.params.userId], employer?.id);
        const result = buildTalentResult({
            candidate: profile,
            assessments: evidence.assessments.get(profile.userId) ?? [],
            verifiedSkills: evidence.verifiedSkills.get(profile.userId) ?? [],
            partnerMarkers: evidence.partnerMarkers.get(profile.userId) ?? [],
            immigrationProcesses: evidence.immigrationProcesses.get(profile.userId) ?? [],
            poolMemberships: evidence.poolMemberships.get(profile.userId) ?? [],
            desiredSkills: [],
            query: profile.headline || undefined,
        });
        res.json(result);
    }
    catch (error) {
        logger.error({ error }, "Talent detail error");
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
//# sourceMappingURL=talent.js.map