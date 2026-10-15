// ─────────────────────────────────────────────────────────────────────────────
// Public customer-support intake: POST /api/support/tickets
//
// Open to guests and signed-in users (optionalAuth attaches the user context).
// Protected by the shared bot shield (honeypot + completion-time check) and a
// per-IP rate limit. Email + n8n side effects are fire-and-forget.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Prisma, SupportTicketTopic } from "@prisma/client";
import { z } from "zod/v4";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { validateHumanAuthSubmission } from "../middleware/bot-protection.js";
import {
  emitSupportWebhook,
  generateTicketReference,
  sendTicketAcknowledgement,
  sendTicketAdminNotification,
  ticketWebhookPayload,
} from "../lib/support/tickets.js";

const router = Router();

function contactLimitMax(): number {
  const fromEnv = Number.parseInt(process.env.SUPPORT_CONTACT_RATE_LIMIT_MAX ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return process.env.NODE_ENV === "test" ? 1000 : 5;
}

export const supportContactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: contactLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `support:${ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "anonymous")}`,
  handler: (_req, res) => {
    res.status(429).json({
      error: "You've sent several messages recently. Please wait a little before contacting us again.",
      code: "SUPPORT_RATE_LIMITED",
    });
  },
});

export const createTicketSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().max(255).pipe(z.email("Please enter a valid email address")),
  topic: z.enum(Object.values(SupportTicketTopic) as [SupportTicketTopic, ...SupportTicketTopic[]]).default("GENERAL"),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().min(20, "Please share a little more detail (at least 20 characters)").max(5000),
  locale: z.enum(["en", "es", "fr", "pt", "ar"]).optional(),
  pageUrl: z.string().trim().max(500).optional(),
  botShield: z
    .object({
      website: z.string().max(200).optional(),
      startedAt: z.number().optional(),
    })
    .optional(),
});

// Topics that warrant a faster first look.
const HIGH_PRIORITY_TOPICS = new Set<SupportTicketTopic>(["TRUST_SAFETY", "PRIVACY"]);

router.post(
  "/tickets",
  supportContactLimiter,
  optionalAuth,
  validateHumanAuthSubmission,
  async (req: Request, res: Response) => {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Please check the highlighted fields.",
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }

    const input = parsed.data;
    const user = req.user;

    try {
      let ticket = null;
      for (let attempt = 0; attempt < 3 && !ticket; attempt += 1) {
        try {
          ticket = await prisma.supportTicket.create({
            data: {
              reference: generateTicketReference(),
              name: input.name,
              email: input.email,
              topic: input.topic,
              subject: input.subject || null,
              message: input.message,
              priority: HIGH_PRIORITY_TOPICS.has(input.topic) ? "HIGH" : "NORMAL",
              userId: user?.userId ?? null,
              userRole: user?.role ?? null,
              locale: input.locale ?? null,
              pageUrl: input.pageUrl || null,
              userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
            },
          });
        } catch (error) {
          // Reference collision — retry with a fresh one.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
          throw error;
        }
      }
      if (!ticket) throw new Error("Could not allocate a ticket reference");

      void sendTicketAcknowledgement(ticket);
      void sendTicketAdminNotification(ticket);
      void emitSupportWebhook("support.ticket_created", ticketWebhookPayload(ticket));

      res.status(201).json({
        ticket: { id: ticket.id, reference: ticket.reference, status: ticket.status, createdAt: ticket.createdAt },
        message: "Thanks — we've received your message.",
      });
    } catch (error) {
      logger.error({ err: String(error) }, "[support] ticket create failed");
      res.status(500).json({ error: "We couldn't send your message right now. Please try again shortly." });
    }
  },
);

// GET /api/support/tickets/mine — a signed-in user's own requests + staff replies.
router.get("/tickets/mine", authenticate, async (req: Request, res: Response) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        reference: true,
        topic: true,
        subject: true,
        message: true,
        status: true,
        createdAt: true,
        lastReplyAt: true,
        // Internal notes are never exposed here.
        replies: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true } },
      },
    });
    res.json({ tickets });
  } catch (error) {
    logger.error({ err: String(error) }, "[support] list mine failed");
    res.status(500).json({ error: "Failed to load your support requests" });
  }
});

export default router;
