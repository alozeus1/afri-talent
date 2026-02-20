import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { NotificationStatus } from "@prisma/client";

const router = Router();

// GET /api/notifications — list notifications for authenticated user
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { page = "1", limit = "20", status } = req.query;
    const take = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (parseInt(page as string) - 1) * take;

    const where: { userId: string; status?: NotificationStatus } = {
      userId: req.user!.userId,
    };

    if (status === "UNREAD" || status === "READ") {
      where.status = status as NotificationStatus;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("List notifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/notifications/unread-count — efficient unread count for badge
router.get("/unread-count", authenticate, async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user!.userId,
        status: NotificationStatus.UNREAD,
      },
    });

    res.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/notifications/:id/read — mark single notification as read
router.put("/:id/read", authenticate, async (req: Request, res: Response) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });

    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    if (notification.userId !== req.user!.userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { status: NotificationStatus.READ },
    });

    res.json(updated);
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/notifications/read-all — mark all as read for authenticated user
router.put("/read-all", authenticate, async (req: Request, res: Response) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: {
        userId: req.user!.userId,
        status: NotificationStatus.UNREAD,
      },
      data: { status: NotificationStatus.READ },
    });

    res.json({ updated: count });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
