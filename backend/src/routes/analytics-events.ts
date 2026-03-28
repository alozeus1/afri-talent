import { Router, Request, Response } from "express";
import crypto from "crypto";
import { AnalyticsEventCategory, Prisma, Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize, optionalAuth } from "../middleware/auth.js";

const router = Router();

const eventSchema = z.object({
  category: z.nativeEnum(AnalyticsEventCategory),
  eventName: z.string().min(2).max(120),
  sessionId: z.string().max(120).optional(),
  path: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.coerce.date().optional(),
});

const ingestSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex");
}

router.post("/events", optionalAuth, async (req: Request, res: Response) => {
  try {
    const payload = ingestSchema.parse(req.body);
    const ip = req.ip || req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim();
    const ipHash = hashIp(ip);
    const userAgent = req.headers["user-agent"]?.toString() || null;
    const userId = req.user?.userId || null;

    await prisma.analyticsEvent.createMany({
      data: payload.events.map((event) => ({
        userId,
        category: event.category,
        eventName: event.eventName,
        sessionId: event.sessionId,
        path: event.path,
        referrer: event.referrer,
        properties: event.properties as Prisma.InputJsonValue | undefined,
        occurredAt: event.occurredAt || new Date(),
        receivedAt: new Date(),
        ipHash,
        userAgent,
      })),
    });

    res.status(202).json({ accepted: payload.events.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to ingest analytics events" });
  }
});

router.get("/model", (_req: Request, res: Response) => {
  res.json({
    categories: Object.values(AnalyticsEventCategory),
    requiredFields: ["category", "eventName"],
    recommendations: {
      acquisition: ["landing_view", "utm_attribution_captured", "signup_started"],
      activation: ["profile_completed", "first_job_posted", "first_application_submitted"],
      conversion: ["plan_selected", "checkout_started", "subscription_activated"],
      retention: ["saved_search_created", "return_visit_7d", "interview_session_completed"],
      employerPipeline: ["job_viewed", "application_status_changed", "offer_sent"],
    },
  });
});

router.get("/summary", authenticate, authorize(Role.ADMIN), async (req: Request, res: Response) => {
  const days = Math.min(Number(req.query.days || 30), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [total, byCategory, topEvents] = await Promise.all([
    prisma.analyticsEvent.count({
      where: { occurredAt: { gte: since } },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["category"],
      where: { occurredAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["eventName"],
      where: { occurredAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 15,
    }),
  ]);

  res.json({
    windowDays: days,
    totalEvents: total,
    byCategory: byCategory.map((item) => ({ category: item.category, count: item._count.id })),
    topEvents: topEvents.map((item) => ({ eventName: item.eventName, count: item._count.id })),
  });
});

export default router;
