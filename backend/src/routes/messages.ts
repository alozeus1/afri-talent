import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { newMessageEmail } from "../lib/email.js";
import logger from "../lib/logger.js";

const router = Router();

// GET /api/messages/threads — list threads for authenticated user
router.get("/threads", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { page = "1", limit = "20" } = req.query;
    const take = Math.min(parseInt(limit as string) || 20, 50);
    const skip = (parseInt(page as string) - 1) * take;

    const threads = await prisma.messageThread.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: { select: { id: true, name: true } },
          },
        },
        job: { select: { id: true, title: true, slug: true } },
        application: {
          select: {
            id: true,
            status: true,
            candidate: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    });

    const total = await prisma.messageThread.count({
      where: { participants: { some: { userId } } },
    });

    const formatted = threads.map((thread) => ({
      id: thread.id,
      job: thread.job,
      application: thread.application,
      participants: thread.participants.map((p) => p.user),
      lastMessage: thread.messages[0] || null,
      updatedAt: thread.updatedAt,
      createdAt: thread.createdAt,
    }));

    res.json({
      threads: formatted,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    logger.error({ error }, "List threads error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/messages/threads/:id — get thread with messages
router.get("/threads/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { page = "1", limit = "50" } = req.query;
    const take = Math.min(parseInt(limit as string) || 50, 100);
    const skip = (parseInt(page as string) - 1) * take;

    const thread = await prisma.messageThread.findFirst({
      where: {
        id,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        job: { select: { id: true, title: true, slug: true } },
        application: {
          select: {
            id: true,
            status: true,
            candidate: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const [messages, totalMessages] = await Promise.all([
      prisma.message.findMany({
        where: { threadId: id },
        include: {
          sender: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
      prisma.message.count({ where: { threadId: id } }),
    ]);

    res.json({
      thread: {
        id: thread.id,
        job: thread.job,
        application: thread.application,
        participants: thread.participants.map((p) => p.user),
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total: totalMessages,
        totalPages: Math.ceil(totalMessages / take),
      },
    });
  } catch (error) {
    logger.error({ error }, "Get thread error");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createThreadSchema = z.object({
  applicationId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  participantId: z.string().uuid(),
  message: z.string().min(1).max(5000).trim(),
});

// POST /api/messages/threads — create a new thread
router.post("/threads", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const data = createThreadSchema.parse(req.body);

    if (data.participantId === userId) {
      res.status(400).json({ error: "Cannot create a thread with yourself" });
      return;
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: data.participantId },
      select: { id: true, name: true, email: true },
    });

    if (!otherUser) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    // Check for existing thread between same participants on same application
    if (data.applicationId) {
      const existing = await prisma.messageThread.findUnique({
        where: { applicationId: data.applicationId },
        include: { participants: true },
      });
      if (existing) {
        res.status(409).json({
          error: "A thread already exists for this application",
          threadId: existing.id,
        });
        return;
      }
    }

    const thread = await prisma.messageThread.create({
      data: {
        jobId: data.jobId || null,
        applicationId: data.applicationId || null,
        participants: {
          create: [{ userId }, { userId: data.participantId }],
        },
        messages: {
          create: {
            senderId: userId,
            body: data.message,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        messages: {
          include: { sender: { select: { id: true, name: true } } },
        },
        job: { select: { id: true, title: true, slug: true } },
      },
    });

    const senderName = thread.participants.find((p) => p.userId === userId)?.user.name || "Someone";
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    void newMessageEmail({
      to: otherUser.email,
      recipientName: otherUser.name,
      senderName,
      threadUrl: `${frontendUrl}/messages/${thread.id}`,
    }).catch((err) => logger.error({ err }, "Failed to send new message email"));

    res.status(201).json({
      id: thread.id,
      job: thread.job,
      participants: thread.participants.map((p) => p.user),
      messages: thread.messages,
      createdAt: thread.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Create thread error");
    res.status(500).json({ error: "Internal server error" });
  }
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000).trim(),
});

// POST /api/messages/threads/:id/messages — send a message
router.post("/threads/:id/messages", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const data = sendMessageSchema.parse(req.body);

    const thread = await prisma.messageThread.findFirst({
      where: {
        id,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const [message] = await Promise.all([
      prisma.message.create({
        data: {
          threadId: id,
          senderId: userId,
          body: data.body,
        },
        include: {
          sender: { select: { id: true, name: true, role: true } },
        },
      }),
      prisma.messageThread.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ]);

    const sender = thread.participants.find((p) => p.userId === userId)?.user;
    const recipients = thread.participants.filter((p) => p.userId !== userId);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    for (const recipient of recipients) {
      void newMessageEmail({
        to: recipient.user.email,
        recipientName: recipient.user.name,
        senderName: sender?.name || "Someone",
        threadUrl: `${frontendUrl}/messages/${id}`,
      }).catch((err) => logger.error({ err }, "Failed to send message notification"));
    }

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Send message error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/messages/unread-count — count threads with unread messages
router.get("/unread-count", authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Count threads where the last message was not sent by the current user
    const threads = await prisma.messageThread.findMany({
      where: {
        participants: { some: { userId } },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { senderId: true },
        },
      },
    });

    const unreadCount = threads.filter(
      (t) => t.messages.length > 0 && t.messages[0].senderId !== userId
    ).length;

    res.json({ count: unreadCount });
  } catch (error) {
    logger.error({ error }, "Unread count error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
