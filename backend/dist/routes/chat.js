import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { buildChatContext } from "../lib/ai/chat-context.js";
const router = Router();
const CHAT_MODEL = process.env.AI_CHAT_MODEL || "claude-haiku-4-5-20251001";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_FREE = 10; // messages per day
const RATE_LIMIT_PRO = 200;
// ── Helpers ──────────────────────────────────────────────────────────────────
async function hasValidConsent(userId) {
    const consent = await prisma.chatConsent.findUnique({ where: { userId } });
    if (!consent)
        return false;
    return consent.privacyNotice && consent.termsOfUse && consent.dataStorage && !consent.revokedAt;
}
async function checkRateLimit(userId) {
    const sub = await prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
    const limit = sub?.plan === "PROFESSIONAL" ? RATE_LIMIT_PRO : RATE_LIMIT_FREE;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const count = await prisma.chatMessage.count({
        where: {
            conversation: { userId },
            role: "USER",
            createdAt: { gte: dayStart },
        },
    });
    return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}
async function getOrCreateConversation(userId) {
    const existing = await prisma.chatConversation.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
    });
    if (existing)
        return existing.id;
    const created = await prisma.chatConversation.create({
        data: { userId, title: "New conversation" },
    });
    return created.id;
}
// ── POST /api/chat/message ───────────────────────────────────────────────────
router.post("/message", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { message, conversationId: requestedConvId } = req.body;
        if (!message || typeof message !== "string" || message.trim().length === 0) {
            res.status(400).json({ error: "Message is required" });
            return;
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            res.status(400).json({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` });
            return;
        }
        if (AI_DISABLED) {
            res.status(503).json({ error: "AI assistant is temporarily unavailable" });
            return;
        }
        // Check consent
        const consented = await hasValidConsent(userId);
        if (!consented) {
            res.status(403).json({
                error: "consent_required",
                message: "You must accept the AI Assistant privacy notice, terms of use, and data storage policy before using the chat.",
            });
            return;
        }
        // Rate limit
        const { allowed, remaining } = await checkRateLimit(userId);
        if (!allowed) {
            res.status(429).json({ error: "Daily message limit reached. Upgrade to Professional for more." });
            return;
        }
        // Get or create conversation
        const conversationId = requestedConvId || await getOrCreateConversation(userId);
        // Verify conversation belongs to user
        const conv = await prisma.chatConversation.findFirst({
            where: { id: conversationId, userId },
        });
        if (!conv) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        // Save user message
        await prisma.chatMessage.create({
            data: { conversationId, role: "USER", content: message.trim() },
        });
        // Load conversation history
        const history = await prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: "asc" },
            take: MAX_HISTORY_MESSAGES + 10, // fetch a few extra to include system context
            select: { role: true, content: true },
        });
        // Build context-aware system prompt
        const { systemPrompt, tokenEstimate } = await buildChatContext(userId);
        // Build messages array for Claude
        const messages = [];
        for (const msg of history) {
            if (msg.role === "USER") {
                messages.push({ role: "user", content: msg.content });
            }
            else if (msg.role === "ASSISTANT") {
                messages.push({ role: "assistant", content: msg.content });
            }
        }
        // Ensure we don't exceed context window — trim older messages
        if (messages.length > MAX_HISTORY_MESSAGES) {
            messages.splice(0, messages.length - MAX_HISTORY_MESSAGES);
        }
        // Call Claude
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
            model: CHAT_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages,
        });
        const assistantContent = response.content[0];
        if (assistantContent.type !== "text") {
            res.status(500).json({ error: "Unexpected AI response format" });
            return;
        }
        const assistantMessage = assistantContent.text.trim();
        const assistantTokens = response.usage?.output_tokens || null;
        // Save assistant response
        const saved = await prisma.chatMessage.create({
            data: {
                conversationId,
                role: "ASSISTANT",
                content: assistantMessage,
                tokenCount: assistantTokens,
                metadata: { model: CHAT_MODEL, contextTokenEstimate: tokenEstimate },
            },
        });
        // Update conversation title from first exchange
        if (!conv.title || conv.title === "New conversation") {
            const title = message.trim().slice(0, 100);
            await prisma.chatConversation.update({ where: { id: conversationId }, data: { title } });
        }
        res.json({
            message: {
                id: saved.id,
                role: "ASSISTANT",
                content: assistantMessage,
                createdAt: saved.createdAt,
            },
            conversationId,
            remaining: remaining - 1,
        });
    }
    catch (err) {
        logger.error({ err }, "[chat] message failed");
        res.status(500).json({ error: "Failed to process message" });
    }
});
// ── GET /api/chat/history ────────────────────────────────────────────────────
router.get("/history", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { conversationId, page = "1", limit = "50" } = req.query;
        const take = Math.min(parseInt(limit) || 50, 100);
        const skip = (parseInt(page) - 1) * take;
        if (conversationId) {
            const conv = await prisma.chatConversation.findFirst({
                where: { id: conversationId, userId },
            });
            if (!conv) {
                res.status(404).json({ error: "Conversation not found" });
                return;
            }
            const [messages, total] = await Promise.all([
                prisma.chatMessage.findMany({
                    where: { conversationId: conversationId },
                    orderBy: { createdAt: "asc" },
                    skip,
                    take,
                    select: { id: true, role: true, content: true, createdAt: true },
                }),
                prisma.chatMessage.count({ where: { conversationId: conversationId } }),
            ]);
            res.json({ messages, conversation: conv, pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) } });
            return;
        }
        // List conversations
        const conversations = await prisma.chatConversation.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            skip,
            take,
            select: {
                id: true,
                title: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { messages: true } },
            },
        });
        const total = await prisma.chatConversation.count({ where: { userId } });
        res.json({ conversations, pagination: { page: parseInt(page), limit: take, total, totalPages: Math.ceil(total / take) } });
    }
    catch (err) {
        logger.error({ err }, "[chat] history failed");
        res.status(500).json({ error: "Failed to load history" });
    }
});
// ── POST /api/chat/conversations — create new conversation ───────────────────
router.post("/conversations", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const consented = await hasValidConsent(userId);
        if (!consented) {
            res.status(403).json({ error: "consent_required" });
            return;
        }
        // Archive current active conversation
        await prisma.chatConversation.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false },
        });
        const conv = await prisma.chatConversation.create({
            data: { userId, title: "New conversation" },
        });
        res.status(201).json({ conversation: conv });
    }
    catch (err) {
        logger.error({ err }, "[chat] create conversation failed");
        res.status(500).json({ error: "Failed to create conversation" });
    }
});
// ── DELETE /api/chat/conversations/:id ───────────────────────────────────────
router.delete("/conversations/:id", authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const conv = await prisma.chatConversation.findFirst({
            where: { id: req.params.id, userId },
        });
        if (!conv) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        await prisma.chatConversation.delete({ where: { id: conv.id } });
        res.json({ message: "Conversation deleted" });
    }
    catch (err) {
        logger.error({ err }, "[chat] delete conversation failed");
        res.status(500).json({ error: "Failed to delete conversation" });
    }
});
export default router;
//# sourceMappingURL=chat.js.map