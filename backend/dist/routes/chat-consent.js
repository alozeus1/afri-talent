import { Router } from "express";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
const router = Router();
// ── GET /api/chat/consent — get current consent status ───────────────────────
router.get("/", authenticate, async (req, res) => {
    try {
        const consent = await prisma.chatConsent.findUnique({
            where: { userId: req.user.userId },
            select: {
                privacyNotice: true,
                termsOfUse: true,
                dataStorage: true,
                consentedAt: true,
                revokedAt: true,
                createdAt: true,
            },
        });
        const hasFullConsent = consent
            ? consent.privacyNotice && consent.termsOfUse && consent.dataStorage && !consent.revokedAt
            : false;
        res.json({
            consent,
            hasFullConsent,
            policies: {
                privacyNotice: {
                    title: "Privacy Notice",
                    summary: "We collect and process your conversation data, profile information, application statuses, and job search activity to provide personalized AI assistance. Your data is processed by Anthropic's Claude AI. We do not sell your data to third parties.",
                    version: "1.0",
                },
                termsOfUse: {
                    title: "Terms of Use",
                    summary: "The AI Assistant provides career guidance and job search assistance. It is not a substitute for professional legal, immigration, or financial advice. Responses are AI-generated and may not always be accurate. You agree to use the service responsibly and not to share sensitive personal information beyond what is necessary for job search assistance.",
                    version: "1.0",
                },
                dataStorage: {
                    title: "Data Storage & Caching Policy",
                    summary: "Your chat conversations are stored to provide continuity across sessions and improve your experience. Conversation history is retained for 12 months after your last interaction. You can delete individual conversations or revoke consent at any time, which will delete all stored chat data. Cached context data (profile, applications) is assembled fresh for each session and is not permanently stored in chat records.",
                    version: "1.0",
                },
            },
        });
    }
    catch (err) {
        logger.error({ err }, "[chat-consent] get failed");
        res.status(500).json({ error: "Failed to retrieve consent status" });
    }
});
// ── POST /api/chat/consent — accept all consent agreements ───────────────────
router.post("/", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { privacyNotice, termsOfUse, dataStorage } = req.body;
        if (privacyNotice !== true || termsOfUse !== true || dataStorage !== true) {
            res.status(400).json({
                error: "All three agreements must be accepted: privacyNotice, termsOfUse, and dataStorage",
            });
            return;
        }
        const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
        const userAgent = req.headers["user-agent"]?.slice(0, 500) || null;
        const consent = await prisma.chatConsent.upsert({
            where: { userId },
            create: {
                userId,
                privacyNotice: true,
                termsOfUse: true,
                dataStorage: true,
                consentedAt: new Date(),
                ipAddress,
                userAgent,
            },
            update: {
                privacyNotice: true,
                termsOfUse: true,
                dataStorage: true,
                consentedAt: new Date(),
                revokedAt: null,
                ipAddress,
                userAgent,
            },
        });
        logger.info({ userId }, "[chat-consent] consent granted");
        res.json({
            message: "Consent recorded successfully",
            consent: {
                privacyNotice: consent.privacyNotice,
                termsOfUse: consent.termsOfUse,
                dataStorage: consent.dataStorage,
                consentedAt: consent.consentedAt,
            },
        });
    }
    catch (err) {
        logger.error({ err }, "[chat-consent] accept failed");
        res.status(500).json({ error: "Failed to record consent" });
    }
});
// ── DELETE /api/chat/consent — revoke consent and delete all chat data ────────
router.delete("/", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const consent = await prisma.chatConsent.findUnique({ where: { userId } });
        if (!consent) {
            res.status(404).json({ error: "No consent record found" });
            return;
        }
        // Delete all chat data
        const conversations = await prisma.chatConversation.findMany({
            where: { userId },
            select: { id: true },
        });
        if (conversations.length > 0) {
            const convIds = conversations.map((c) => c.id);
            await prisma.chatMessage.deleteMany({ where: { conversationId: { in: convIds } } });
            await prisma.chatConversation.deleteMany({ where: { userId } });
        }
        // Mark consent as revoked
        await prisma.chatConsent.update({
            where: { userId },
            data: {
                privacyNotice: false,
                termsOfUse: false,
                dataStorage: false,
                revokedAt: new Date(),
            },
        });
        logger.info({ userId, deletedConversations: conversations.length }, "[chat-consent] consent revoked, data deleted");
        res.json({
            message: "Consent revoked and all chat data deleted",
            deletedConversations: conversations.length,
        });
    }
    catch (err) {
        logger.error({ err }, "[chat-consent] revoke failed");
        res.status(500).json({ error: "Failed to revoke consent" });
    }
});
export default router;
//# sourceMappingURL=chat-consent.js.map