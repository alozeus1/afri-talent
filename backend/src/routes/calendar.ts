import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { CalendarEventType } from "@prisma/client";

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(5000).trim().optional(),
  eventType: z.nativeEnum(CalendarEventType).default(CalendarEventType.CUSTOM),
  startTime: z.coerce.date(),
  endTime: z.coerce.date().optional(),
  location: z.string().max(300).trim().optional(),
  meetingUrl: z.string().url().max(500).optional().or(z.literal("")),
  jobId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  reminderMinutes: z.coerce.number().min(0).max(10080).optional(), // up to 1 week
});

const updateEventSchema = createEventSchema.partial();

// GET /api/calendar/upcoming — authenticated. Next 5 upcoming events from now.
router.get("/upcoming", authenticate, async (req: Request, res: Response) => {
  try {
    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: req.user!.userId,
        startTime: { gte: new Date() },
      },
      orderBy: { startTime: "asc" },
      take: 5,
    });

    res.json(events);
  } catch (error) {
    console.error("Upcoming events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/calendar — authenticated. List user's calendar events with filters.
router.get("/", authenticate, async (req: Request, res: Response) => {
  try {
    const { month, eventType } = req.query;

    const where: any = { userId: req.user!.userId };

    if (month) {
      // month format: YYYY-MM
      const [year, mon] = (month as string).split("-").map(Number);
      const startOfMonth = new Date(year, mon - 1, 1);
      const endOfMonth = new Date(year, mon, 0, 23, 59, 59, 999);
      where.startTime = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    if (eventType) {
      where.eventType = eventType as string;
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: "asc" },
    });

    res.json(events);
  } catch (error) {
    console.error("List calendar events error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/calendar/:id — authenticated. Single event detail (must be own event).
router.get("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const event = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error("Get calendar event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/calendar — authenticated. Create event.
router.post("/", authenticate, async (req: Request, res: Response) => {
  try {
    const data = createEventSchema.parse(req.body);

    const meetingUrl = data.meetingUrl || null;

    const event = await prisma.calendarEvent.create({
      data: {
        userId: req.user!.userId,
        title: data.title,
        description: data.description ?? null,
        eventType: data.eventType,
        startTime: data.startTime,
        endTime: data.endTime ?? null,
        location: data.location ?? null,
        meetingUrl,
        jobId: data.jobId ?? null,
        applicationId: data.applicationId ?? null,
        reminderMinutes: data.reminderMinutes ?? 30,
      },
    });

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Create calendar event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/calendar/:id — authenticated. Update event (must be own event).
router.put("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const data = updateEventSchema.parse(req.body);

    const existing = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const meetingUrl = data.meetingUrl !== undefined ? (data.meetingUrl || null) : undefined;

    const event = await prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(meetingUrl !== undefined && { meetingUrl }),
      },
    });

    res.json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Update calendar event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/calendar/:id — authenticated. Delete event (must be own event).
router.delete("/:id", authenticate, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    await prisma.calendarEvent.delete({ where: { id: req.params.id } });

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Delete calendar event error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
