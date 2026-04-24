import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Role, SalaryNegotiationStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import { countryToRegion } from "../lib/billing/index.js";
import logger from "../lib/logger.js";
const router = Router();
const negotiationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many negotiation requests. Please try again later." },
});
const createSessionSchema = z.object({
    jobId: z.string().uuid().optional(),
    jobTitle: z.string().min(2).max(200),
    country: z.string().min(2).max(100).optional(),
    currency: z.string().length(3).optional(),
    currentCompensation: z.number().int().min(1).optional(),
    targetCompensation: z.number().int().min(1).optional(),
    notes: z.string().max(1000).optional(),
});
function median(values) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
router.use(requireFeatureFlag("PHASE4_SALARY_NEGOTIATION_ENABLED"));
router.use(authenticate);
router.use(authorize(Role.CANDIDATE));
router.get("/sessions", async (req, res) => {
    try {
        const sessions = await prisma.salaryNegotiationSession.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.json({ sessions });
    }
    catch (error) {
        logger.error({ error }, "Failed to list negotiation sessions");
        res.status(500).json({ error: "Failed to list negotiation sessions" });
    }
});
router.get("/sessions/:id", async (req, res) => {
    try {
        const session = await prisma.salaryNegotiationSession.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.userId,
            },
        });
        if (!session) {
            res.status(404).json({ error: "Negotiation session not found" });
            return;
        }
        res.json({ session });
    }
    catch (error) {
        logger.error({ error }, "Failed to get negotiation session");
        res.status(500).json({ error: "Failed to get negotiation session" });
    }
});
router.post("/sessions", negotiationLimiter, async (req, res) => {
    try {
        const data = createSessionSchema.parse(req.body);
        const billingProfile = await prisma.userBillingProfile.findUnique({
            where: { userId: req.user.userId },
            select: { country: true, region: true, currency: true },
        });
        const inferredCountry = data.country || billingProfile?.country || undefined;
        const inferredRegion = inferredCountry && inferredCountry.length === 2
            ? countryToRegion(inferredCountry.toUpperCase())
            : (billingProfile?.region || null);
        const effectiveCurrency = (data.currency || billingProfile?.currency || "USD").toUpperCase();
        const marketWhere = {
            jobTitle: { contains: data.jobTitle, mode: "insensitive" },
            ...(data.country ? { country: { contains: data.country, mode: "insensitive" } } : {}),
        };
        const localMarketRows = await prisma.salaryReport.findMany({
            where: marketWhere,
            select: { salaryAmount: true },
            orderBy: { salaryAmount: "asc" },
            take: 200,
        });
        const globalRows = localMarketRows.length >= 5
            ? localMarketRows
            : await prisma.salaryReport.findMany({
                where: { jobTitle: { contains: data.jobTitle, mode: "insensitive" } },
                select: { salaryAmount: true },
                orderBy: { salaryAmount: "asc" },
                take: 500,
            });
        const amounts = (localMarketRows.length >= 5 ? localMarketRows : globalRows).map((row) => row.salaryAmount);
        const marketMin = amounts.length > 0 ? Math.min(...amounts) : null;
        const marketMax = amounts.length > 0 ? Math.max(...amounts) : null;
        const marketMedian = median(amounts);
        const anchorMultiplier = inferredRegion === "AFRICA" ? 1.08 : inferredRegion === "EUROPE" ? 1.1 : 1.09;
        const anchorBase = marketMedian ?? data.currentCompensation ?? data.targetCompensation ?? null;
        const anchorAsk = anchorBase ? Math.round(anchorBase * anchorMultiplier) : null;
        const walkAway = anchorAsk ? Math.round(anchorAsk * 0.92) : null;
        const talkingPoints = [
            "Lead with measurable outcomes and business impact from your recent roles.",
            "Anchor your ask with market data and role scope instead of personal need.",
            "Offer flexible structures (base, signing, review window, remote allowance) when needed.",
            "Confirm growth path, review cadence, and role expectations before final acceptance.",
        ];
        const riskFlags = [];
        if (!marketMedian)
            riskFlags.push("Limited market data for this role/country; validate with 2-3 external sources.");
        if (data.currentCompensation && anchorAsk && data.currentCompensation > anchorAsk * 1.25) {
            riskFlags.push("Current compensation appears above local market anchor; expect stronger justification requirements.");
        }
        if (data.targetCompensation && marketMax && data.targetCompensation > marketMax * 1.2) {
            riskFlags.push("Target compensation is significantly above observed market range.");
        }
        const strategySummary = [
            `Primary ask: ${anchorAsk ? `${anchorAsk.toLocaleString()} ${effectiveCurrency}` : "Set after additional market discovery"}.`,
            `Walk-away threshold: ${walkAway ? `${walkAway.toLocaleString()} ${effectiveCurrency}` : "Set after recruiter range confirmation"}.`,
            inferredRegion ? `Negotiation context: ${inferredRegion} market.` : "Negotiation context: global market fallback.",
            data.notes ? `Candidate notes: ${data.notes}` : null,
        ].filter(Boolean).join(" ");
        const session = await prisma.salaryNegotiationSession.create({
            data: {
                userId: req.user.userId,
                jobId: data.jobId || null,
                jobTitle: data.jobTitle,
                country: inferredCountry || null,
                region: inferredRegion,
                currency: effectiveCurrency,
                currentCompensation: data.currentCompensation,
                targetCompensation: data.targetCompensation,
                marketMin,
                marketMedian,
                marketMax,
                strategySummary,
                talkingPoints,
                riskFlags,
                status: SalaryNegotiationStatus.READY,
            },
        });
        res.status(201).json({
            session,
            recommendation: {
                anchorAsk,
                walkAway,
                talkingPoints,
                riskFlags,
            },
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to create negotiation session");
        res.status(500).json({ error: "Failed to create negotiation session" });
    }
});
export default router;
//# sourceMappingURL=salary-negotiation.js.map