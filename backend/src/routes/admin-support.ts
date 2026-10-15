// ─────────────────────────────────────────────────────────────────────────────
// Admin support desk: /api/admin/support/*
//
// List/filter tickets, inspect one (with reply history), update triage fields
// (status, priority, topic, assignee, internal notes) and reply to the
// customer. A reply emails the submitter and, when the ticket belongs to a
// registered user, also drops an in-app notification.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import {
  NotificationType,
  Prisma,
  Role,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketTopic,
} from "@prisma/client";
import { z } from "zod/v4";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { createUserNotification } from "../lib/notifications.js";
import { emitSupportWebhook, sendTicketReplyEmail, ticketWebhookPayload } from "../lib/support/tickets.js";

const router = Router();
router.use(authenticate, authorize(Role.ADMIN));

const statusValues = Object.values(SupportTicketStatus) as [SupportTicketStatus, ...SupportTicketStatus[]];
const priorityValues = Object.values(SupportTicketPriority) as [SupportTicketPriority, ...SupportTicketPriority[]];
const topicValues = Object.values(SupportTicketTopic) as [SupportTicketTopic, ...SupportTicketTopic[]];

const listQuerySchema = z.object({
  status: z.enum(statusValues).optional(),
  priority: z.enum(priorityValues).optional(),
  topic: z.enum(topicValues).optional(),
  assigneeId: z.string().max(64).optional(), // "unassigned" or a user id
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateSchema = z
  .object({
    status: z.enum(statusValues).optional(),
    priority: z.enum(priorityValues).optional(),
    topic: z.enum(topicValues).optional(),
    assigneeId: z.string().max(64).nullable().optional(),
    internalNotes: z.string().max(10000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const replySchema = z.object({
  body: z.string().trim().min(2).max(10000),
  status: z.enum(statusValues).optional(),
});

const ticketListSelect = {
  id: true,
  reference: true,
  name: true,
  email: true,
  topic: true,
  subject: true,
  message: true,
  status: true,
  priority: true,
  userId: true,
  userRole: true,
  locale: true,
  firstResponseAt: true,
  lastReplyAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true, email: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.SupportTicketSelect;

// GET /api/admin/support/tickets
router.get("/tickets", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filters", details: parsed.error.issues });
    return;
  }
  const { status, priority, topic, assigneeId, q, page, limit } = parsed.data;

  const where: Prisma.SupportTicketWhereInput = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (topic) where.topic = topic;
  if (assigneeId === "unassigned") where.assigneeId = null;
  else if (assigneeId === "me") where.assigneeId = req.user!.userId;
  else if (assigneeId) where.assigneeId = assigneeId;
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ];
  }

  try {
    const [tickets, total, grouped] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        select: ticketListSelect,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = { OPEN: 0, PENDING: 0, RESOLVED: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;

    res.json({
      tickets,
      counts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    logger.error({ err: String(error) }, "[admin-support] list failed");
    res.status(500).json({ error: "Failed to load tickets" });
  }
});

// GET /api/admin/support/assignees — admins a ticket can be assigned to
router.get("/assignees", async (_req: Request, res: Response) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 100,
    });
    res.json({ assignees: admins });
  } catch (error) {
    logger.error({ err: String(error) }, "[admin-support] assignees failed");
    res.status(500).json({ error: "Failed to load assignees" });
  }
});

// GET /api/admin/support/tickets/:id
router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true, role: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ ticket });
  } catch (error) {
    logger.error({ err: String(error) }, "[admin-support] get failed");
    res.status(500).json({ error: "Failed to load ticket" });
  }
});

function statusTimestamps(next: SupportTicketStatus | undefined, current: SupportTicketStatus) {
  if (!next || next === current) return {};
  return { resolvedAt: next === "RESOLVED" ? new Date() : null };
}

// PATCH /api/admin/support/tickets/:id
router.patch("/tickets/:id", async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  try {
    const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (input.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId }, select: { role: true } });
      if (!assignee || assignee.role !== Role.ADMIN) {
        res.status(400).json({ error: "Tickets can only be assigned to admins" });
        return;
      }
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: existing.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...statusTimestamps(input.status, existing.status),
      },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    if (input.status && input.status !== existing.status) {
      void emitSupportWebhook("support.ticket_updated", {
        ...ticketWebhookPayload(ticket),
        previousStatus: existing.status,
      });
    }

    res.json({ ticket });
  } catch (error) {
    logger.error({ err: String(error) }, "[admin-support] update failed");
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// POST /api/admin/support/tickets/:id/replies
router.post("/tickets/:id/replies", async (req: Request, res: Response) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }
  const { body } = parsed.data;
  // Default: answered → waiting on the customer.
  const nextStatus = parsed.data.status ?? SupportTicketStatus.PENDING;

  try {
    const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const now = new Date();
    const [createdReply, ticket] = await prisma.$transaction([
      prisma.supportTicketReply.create({
        data: { ticketId: existing.id, authorId: req.user!.userId, body },
        include: { author: { select: { id: true, name: true } } },
      }),
      prisma.supportTicket.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          lastReplyAt: now,
          firstResponseAt: existing.firstResponseAt ?? now,
          // Replying to an unassigned ticket claims it.
          assigneeId: existing.assigneeId ?? req.user!.userId,
          ...statusTimestamps(nextStatus, existing.status),
        },
      }),
    ]);

    // Persist first, then deliver: a failed send never loses the reply.
    const emailSent = await sendTicketReplyEmail(existing, body);
    const reply = emailSent
      ? await prisma.supportTicketReply.update({
          where: { id: createdReply.id },
          data: { emailSent: true },
          include: { author: { select: { id: true, name: true } } },
        })
      : createdReply;

    let notified = false;
    if (existing.userId) {
      try {
        await createUserNotification({
          userId: existing.userId,
          type: NotificationType.SUPPORT_REPLY,
          title: `Support replied to ${existing.reference}`,
          body: body.length > 280 ? `${body.slice(0, 277)}...` : body,
          metadata: { ticketId: existing.id, reference: existing.reference, link: "/contact#my-requests" },
        });
        notified = true;
      } catch (error) {
        logger.warn({ err: String(error), ticketId: existing.id }, "[admin-support] in-app notification failed (non-fatal)");
      }
    }

    void emitSupportWebhook("support.ticket_replied", {
      ...ticketWebhookPayload(ticket),
      replyPreview: body.slice(0, 500),
      emailSent,
    });

    res.status(201).json({ reply, ticket, delivery: { email: emailSent, inApp: notified } });
  } catch (error) {
    logger.error({ err: String(error) }, "[admin-support] reply failed");
    res.status(500).json({ error: "Failed to send reply" });
  }
});

export default router;
