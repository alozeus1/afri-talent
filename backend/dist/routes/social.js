import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Role, SocialConnectionStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import logger from "../lib/logger.js";
const router = Router();
const connectionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "test" ? 1000 : 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many social requests. Please try again later." },
});
const profileSchema = z.object({
    headline: z.string().max(160).optional().or(z.literal("")),
    bio: z.string().max(1000).optional().or(z.literal("")),
    location: z.string().max(120).optional().or(z.literal("")),
    discoverable: z.boolean().optional(),
    collaborationOpen: z.boolean().optional(),
    allowConnectionRequests: z.boolean().optional(),
});
const requestConnectionSchema = z.object({
    recipientUserId: z.string().uuid(),
    note: z.string().max(300).optional().or(z.literal("")),
});
const respondConnectionSchema = z.object({
    action: z.enum(["accept", "decline", "block"]),
});
router.use(requireFeatureFlag("PHASE4_SOCIAL_ENABLED"));
router.use(authenticate);
router.use(authorize(Role.CANDIDATE, Role.EMPLOYER));
router.get("/profile", async (req, res) => {
    try {
        const profile = await prisma.socialProfile.findUnique({
            where: { userId: req.user.userId },
        });
        res.json({
            profile: profile || {
                userId: req.user.userId,
                discoverable: false,
                collaborationOpen: false,
                allowConnectionRequests: true,
            },
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to load social profile");
        res.status(500).json({ error: "Failed to load social profile" });
    }
});
router.put("/profile", async (req, res) => {
    try {
        const data = profileSchema.parse(req.body);
        const profile = await prisma.socialProfile.upsert({
            where: { userId: req.user.userId },
            create: {
                userId: req.user.userId,
                headline: data.headline || null,
                bio: data.bio || null,
                location: data.location || null,
                discoverable: data.discoverable ?? false,
                collaborationOpen: data.collaborationOpen ?? false,
                allowConnectionRequests: data.allowConnectionRequests ?? true,
            },
            update: {
                ...(data.headline !== undefined && { headline: data.headline || null }),
                ...(data.bio !== undefined && { bio: data.bio || null }),
                ...(data.location !== undefined && { location: data.location || null }),
                ...(data.discoverable !== undefined && { discoverable: data.discoverable }),
                ...(data.collaborationOpen !== undefined && { collaborationOpen: data.collaborationOpen }),
                ...(data.allowConnectionRequests !== undefined && { allowConnectionRequests: data.allowConnectionRequests }),
            },
        });
        res.json({ profile });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to save social profile");
        res.status(500).json({ error: "Failed to save social profile" });
    }
});
router.get("/connections", async (req, res) => {
    try {
        const status = req.query.status;
        const where = {
            ...(status ? { status } : {}),
            OR: [{ requesterId: req.user.userId }, { recipientId: req.user.userId }],
        };
        const connections = await prisma.socialConnection.findMany({
            where,
            include: {
                requester: {
                    select: { id: true, name: true, role: true, socialProfile: true },
                },
                recipient: {
                    select: { id: true, name: true, role: true, socialProfile: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        res.json({
            connections: connections.map((connection) => {
                const isRequester = connection.requesterId === req.user.userId;
                const peer = isRequester ? connection.recipient : connection.requester;
                return {
                    id: connection.id,
                    status: connection.status,
                    note: connection.note,
                    createdAt: connection.createdAt,
                    respondedAt: connection.respondedAt,
                    direction: isRequester ? "outbound" : "inbound",
                    peer: {
                        id: peer.id,
                        name: peer.name,
                        role: peer.role,
                        socialProfile: peer.socialProfile,
                    },
                };
            }),
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to list social connections");
        res.status(500).json({ error: "Failed to list social connections" });
    }
});
router.post("/connections/request", connectionLimiter, async (req, res) => {
    try {
        const data = requestConnectionSchema.parse(req.body);
        if (data.recipientUserId === req.user.userId) {
            res.status(400).json({ error: "You cannot connect with yourself" });
            return;
        }
        const recipient = await prisma.user.findUnique({
            where: { id: data.recipientUserId },
            select: {
                id: true,
                role: true,
                socialProfile: {
                    select: {
                        discoverable: true,
                        allowConnectionRequests: true,
                    },
                },
            },
        });
        if (!recipient || recipient.role === Role.ADMIN) {
            res.status(404).json({ error: "Recipient not found" });
            return;
        }
        if (!recipient.socialProfile?.discoverable || !recipient.socialProfile.allowConnectionRequests) {
            res.status(403).json({ error: "This user is not accepting connection requests" });
            return;
        }
        const existing = await prisma.socialConnection.findFirst({
            where: {
                OR: [
                    { requesterId: req.user.userId, recipientId: recipient.id },
                    { requesterId: recipient.id, recipientId: req.user.userId },
                ],
            },
        });
        if (existing?.status === SocialConnectionStatus.ACCEPTED) {
            res.status(409).json({ error: "You are already connected" });
            return;
        }
        if (existing
            && existing.requesterId === recipient.id
            && existing.recipientId === req.user.userId
            && existing.status === SocialConnectionStatus.PENDING) {
            const accepted = await prisma.socialConnection.update({
                where: { id: existing.id },
                data: {
                    status: SocialConnectionStatus.ACCEPTED,
                    respondedAt: new Date(),
                },
            });
            res.status(201).json({ connection: accepted, autoAccepted: true });
            return;
        }
        if (existing) {
            res.status(409).json({ error: `Connection already exists with status ${existing.status}` });
            return;
        }
        const connection = await prisma.socialConnection.create({
            data: {
                requesterId: req.user.userId,
                recipientId: recipient.id,
                note: data.note || null,
            },
        });
        res.status(201).json({ connection, autoAccepted: false });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to request connection");
        res.status(500).json({ error: "Failed to request connection" });
    }
});
router.post("/connections/:id/respond", connectionLimiter, async (req, res) => {
    try {
        const data = respondConnectionSchema.parse(req.body);
        const connection = await prisma.socialConnection.findFirst({
            where: {
                id: req.params.id,
                recipientId: req.user.userId,
            },
        });
        if (!connection) {
            res.status(404).json({ error: "Connection request not found" });
            return;
        }
        let status;
        switch (data.action) {
            case "accept":
                status = SocialConnectionStatus.ACCEPTED;
                break;
            case "decline":
                status = SocialConnectionStatus.DECLINED;
                break;
            case "block":
                status = SocialConnectionStatus.BLOCKED;
                break;
            default:
                status = SocialConnectionStatus.DECLINED;
        }
        const updated = await prisma.socialConnection.update({
            where: { id: connection.id },
            data: {
                status,
                respondedAt: new Date(),
            },
        });
        res.json({ connection: updated });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Validation failed", details: error.issues });
            return;
        }
        logger.error({ error }, "Failed to respond to connection");
        res.status(500).json({ error: "Failed to respond to connection" });
    }
});
export default router;
//# sourceMappingURL=social.js.map