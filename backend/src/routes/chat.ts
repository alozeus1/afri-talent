import { Router, Request, Response } from "express";
import { getAnthropicClient } from "../lib/ai/anthropic-client.js";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { buildChatContext } from "../lib/ai/chat-context.js";
import { getUserEntitlements } from "../lib/billing/entitlements.js";
import { freeModeChatDailyLimit, isFreeMode } from "../lib/billing/free-mode.js";

const router = Router();

const CHAT_MODEL = process.env.AI_CHAT_MODEL || "claude-haiku-4-5-20251001";
const AI_DISABLED = process.env.AI_DISABLED === "1";
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_FREE = 10; // messages per day
const RATE_LIMIT_PRO = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

const CANNED_REPLY =
  "Hi, I'm Mara, your AfriTalent career assistant. I'm running in demo mode right now " +
  "(no AI model is configured on this server), so I can't give personalised advice yet. " +
  "In the meantime you can browse jobs, update your profile and use the resume tools.";

/**
 * Canned replies are used when MOCK_AI=1 or no Anthropic key is configured
 * (local Docker / dev). In production a missing key is a 503, not a canned
 * reply; the caller handles that distinction.
 */
function useCannedReply(): boolean {
  return process.env.MOCK_AI === "1" || !process.env.ANTHROPIC_API_KEY;
}

type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Build the Claude messages array from chronological history plus the new
 * user message. Guarantees the array starts with a user turn, ends with the
 * new user message, and alternates roles (consecutive same-role turns, e.g.
 * an orphan USER row left by an older failure, are merged).
 */
export function buildChatMessages(
  history: { role: string; content: string }[],
  newUserContent: string
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const push = (role: ChatTurn["role"], content: string): void => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  };

  for (const msg of history) {
    if (msg.role === "USER") push("user", msg.content);
    else if (msg.role === "ASSISTANT") push("assistant", msg.content);
  }

  // Must start with a user turn.
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();

  push("user", newUserContent);

  // Keep within the history window without breaking the user-first rule.
  while (turns.length > MAX_HISTORY_MESSAGES) {
    turns.shift();
    while (turns.length > 1 && turns[0].role !== "user") turns.shift();
  }
  return turns;
}

async function hasValidConsent(userId: string): Promise<boolean> {
  const consent = await prisma.chatConsent.findUnique({ where: { userId } });
  if (!consent) return false;
  return consent.privacyNotice && consent.termsOfUse && consent.dataStorage && !consent.revokedAt;
}

const LIMIT_REACHED_PAID_COPY = "Daily message limit reached. Upgrade to Professional for more.";
const LIMIT_REACHED_FREE_MODE_COPY = "Daily message limit reached. Resets at midnight UTC.";

function limitReachedMessage(): string {
  return isFreeMode() ? LIMIT_REACHED_FREE_MODE_COPY : LIMIT_REACHED_PAID_COPY;
}

async function resolveDailyLimit(userId: string): Promise<number> {
  if (isFreeMode()) return freeModeChatDailyLimit();
  // ACTIVE-only plan resolution (non-active statuses fall back to FREE).
  const entitlements = await getUserEntitlements(userId);
  const paidChatPlan =
    entitlements.plan === "PROFESSIONAL" || entitlements.plan === "BASIC";
  return entitlements.chatAccess && paidChatPlan ? RATE_LIMIT_PRO : RATE_LIMIT_FREE;
}

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const limit = await resolveDailyLimit(userId);

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

async function getOrCreateConversation(userId: string): Promise<string> {
  const existing = await prisma.chatConversation.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.chatConversation.create({
    data: { userId, title: "New conversation" },
  });
  return created.id;
}

// ── POST /api/chat/message ───────────────────────────────────────────────────

router.post("/message", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
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
      res.status(429).json({ error: limitReachedMessage() });
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

    const userContent = message.trim();
    // Captured before the model call so the USER row sorts before the
    // ASSISTANT row even though both are written after the call succeeds.
    const userMessageAt = new Date();

    // Load the most recent history (newest first, then reverse to chronological).
    // The new user message is NOT persisted yet: it is saved only after the
    // model call succeeds, so a failure leaves no orphan USER row and does not
    // consume the user's daily message allowance.
    const recent = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES - 1, // leave room for the new user message
      select: { role: true, content: true },
    });
    const messages = buildChatMessages(recent.reverse(), userContent);

    // Build context-aware system prompt
    const { systemPrompt, tokenEstimate } = await buildChatContext(userId);

    let assistantMessage: string;
    let assistantTokens: number | null = null;
    let modelUsed = CHAT_MODEL;

    if (useCannedReply()) {
      if (!process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV === "production" && process.env.MOCK_AI !== "1") {
        res.status(503).json({ error: "AI assistant is not configured on this server" });
        return;
      }
      assistantMessage = CANNED_REPLY;
      modelUsed = "mock";
    } else {
      // Call Claude
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      });

      const assistantContent = response.content[0];
      if (!assistantContent || assistantContent.type !== "text") {
        res.status(500).json({ error: "Unexpected AI response format" });
        return;
      }
      assistantMessage = assistantContent.text.trim();
      assistantTokens = response.usage?.output_tokens || null;
    }

    // Persist the exchange only after a successful reply.
    const [, saved] = await prisma.$transaction([
      prisma.chatMessage.create({
        data: { conversationId, role: "USER", content: userContent, createdAt: userMessageAt },
      }),
      prisma.chatMessage.create({
        data: {
          conversationId,
          role: "ASSISTANT",
          content: assistantMessage,
          tokenCount: assistantTokens,
          metadata: { model: modelUsed, contextTokenEstimate: tokenEstimate },
          createdAt: new Date(Math.max(Date.now(), userMessageAt.getTime() + 1)),
        },
      }),
    ]);

    // Update conversation title from first exchange
    if (!conv.title || conv.title === "New conversation") {
      const title = userContent.slice(0, 100);
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
  } catch (err) {
    logger.error({ err }, "[chat] message failed");
    res.status(500).json({ error: "Failed to process message" });
  }
});

// ── GET /api/chat/history ────────────────────────────────────────────────────

router.get("/history", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { conversationId, page = "1", limit = "50" } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 100);
    const skip = (parseInt(page as string) - 1) * take;

    if (conversationId) {
      const conv = await prisma.chatConversation.findFirst({
        where: { id: conversationId as string, userId },
      });
      if (!conv) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      const [messages, total] = await Promise.all([
        prisma.chatMessage.findMany({
          where: { conversationId: conversationId as string },
          orderBy: { createdAt: "asc" },
          skip,
          take,
          select: { id: true, role: true, content: true, createdAt: true },
        }),
        prisma.chatMessage.count({ where: { conversationId: conversationId as string } }),
      ]);

      res.json({ messages, conversation: conv, pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) } });
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

    res.json({ conversations, pagination: { page: parseInt(page as string), limit: take, total, totalPages: Math.ceil(total / take) } });
  } catch (err) {
    logger.error({ err }, "[chat] history failed");
    res.status(500).json({ error: "Failed to load history" });
  }
});

// ── POST /api/chat/conversations — create new conversation ───────────────────

router.post("/conversations", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
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
  } catch (err) {
    logger.error({ err }, "[chat] create conversation failed");
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// ── DELETE /api/chat/conversations/:id ───────────────────────────────────────

router.delete("/conversations/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const conv = await prisma.chatConversation.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await prisma.chatConversation.delete({ where: { id: conv.id } });
    res.json({ message: "Conversation deleted" });
  } catch (err) {
    logger.error({ err }, "[chat] delete conversation failed");
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
