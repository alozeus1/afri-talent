import crypto from "crypto";
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { BotChannel, BotSubscriptionStatus, NotificationType, Role, SupportedLocale } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { requireFeatureFlag } from "../middleware/feature-flags.js";
import { createUserNotification } from "../lib/notifications.js";
import logger from "../lib/logger.js";

const router = Router();

const subscriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many bot requests. Please try again later." },
});

const createSubscriptionSchema = z.object({
  channel: z.nativeEnum(BotChannel),
  chatHandle: z.string().min(2).max(120),
  locale: z.nativeEnum(SupportedLocale).optional(),
});

const verifySubscriptionSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const updatePreferencesSchema = z.object({
  isAlertsEnabled: z.boolean().optional(),
  isJobMatchesEnabled: z.boolean().optional(),
  isRemindersEnabled: z.boolean().optional(),
  isApplicationStatusEnabled: z.boolean().optional(),
  status: z.nativeEnum(BotSubscriptionStatus).optional(),
});

const webhookPayloadSchema = z.object({
  chatHandle: z.string().min(2).max(120),
  eventType: z.enum(["job_match", "reminder", "application_status", "subscription_notice", "generic"]),
  title: z.string().min(2).max(255).optional(),
  body: z.string().min(2).max(1000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function secureHashEqual(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateVerificationCode(): string {
  return `${crypto.randomInt(0, 1_000_000)}`.padStart(6, "0");
}

function mapEventTypeToNotificationType(eventType: z.infer<typeof webhookPayloadSchema>["eventType"]): NotificationType {
  switch (eventType) {
    case "job_match":
      return NotificationType.JOB_MATCH;
    case "application_status":
      return NotificationType.APPLICATION_STATUS;
    case "reminder":
    case "subscription_notice":
    case "generic":
    default:
      return NotificationType.VERIFICATION;
  }
}

router.use(requireFeatureFlag("PHASE4_BOTS_ENABLED"));

router.get("/subscriptions", authenticate, async (req: Request, res: Response) => {
  const subscriptions = await prisma.botSubscription.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ subscriptions });
});

router.post("/subscriptions", authenticate, subscriptionLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSubscriptionSchema.parse(req.body);
    const code = generateVerificationCode();
    const verificationCodeHash = hash(code);

    const subscription = await prisma.botSubscription.upsert({
      where: {
        channel_chatHandle: {
          channel: data.channel,
          chatHandle: data.chatHandle,
        },
      },
      create: {
        userId: req.user!.userId,
        channel: data.channel,
        chatHandle: data.chatHandle,
        locale: data.locale || SupportedLocale.EN,
        status: BotSubscriptionStatus.PENDING_VERIFICATION,
        verificationCodeHash,
      },
      update: {
        userId: req.user!.userId,
        locale: data.locale || SupportedLocale.EN,
        status: BotSubscriptionStatus.PENDING_VERIFICATION,
        verificationCodeHash,
        verifiedAt: null,
      },
    });

    res.status(201).json({
      subscription,
      verificationCode: code,
      message: "Use this code in the linked bot chat to verify the subscription.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to create bot subscription");
    res.status(500).json({ error: "Failed to create bot subscription" });
  }
});

router.post("/subscriptions/:id/verify", authenticate, subscriptionLimiter, async (req: Request, res: Response) => {
  try {
    const data = verifySubscriptionSchema.parse(req.body);
    const subscription = await prisma.botSubscription.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.userId,
      },
    });

    if (!subscription || !subscription.verificationCodeHash) {
      res.status(404).json({ error: "Bot subscription not found or not verifiable" });
      return;
    }

    const providedHash = hash(data.code);
    if (!secureHashEqual(subscription.verificationCodeHash, providedHash)) {
      res.status(400).json({ error: "Invalid verification code" });
      return;
    }

    const updated = await prisma.botSubscription.update({
      where: { id: subscription.id },
      data: {
        status: BotSubscriptionStatus.ACTIVE,
        verifiedAt: new Date(),
        verificationCodeHash: null,
      },
    });

    res.json({ subscription: updated, verified: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to verify bot subscription");
    res.status(500).json({ error: "Failed to verify bot subscription" });
  }
});

router.patch("/subscriptions/:id/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const data = updatePreferencesSchema.parse(req.body);
    const subscription = await prisma.botSubscription.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      select: { id: true },
    });

    if (!subscription) {
      res.status(404).json({ error: "Bot subscription not found" });
      return;
    }

    const updated = await prisma.botSubscription.update({
      where: { id: subscription.id },
      data,
    });

    res.json({ subscription: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Failed to update bot preferences");
    res.status(500).json({ error: "Failed to update bot preferences" });
  }
});

router.post("/subscriptions/:id/test-alert", authenticate, authorize(Role.CANDIDATE, Role.EMPLOYER), async (req: Request, res: Response) => {
  const subscription = await prisma.botSubscription.findFirst({
    where: {
      id: req.params.id,
      userId: req.user!.userId,
      status: BotSubscriptionStatus.ACTIVE,
    },
  });

  if (!subscription) {
    res.status(404).json({ error: "Active bot subscription not found" });
    return;
  }

  const notification = await createUserNotification({
    userId: req.user!.userId,
    type: NotificationType.JOB_MATCH,
    title: "Bot integration test",
    body: `Your ${subscription.channel} bot subscription is active.`,
    metadata: {
      channel: subscription.channel,
      chatHandle: subscription.chatHandle,
      source: "phase4_test_alert",
    },
    channel: "savedSearchAlerts",
  });

  await prisma.botSubscription.update({
    where: { id: subscription.id },
    data: { lastNotifiedAt: new Date() },
  });

  res.json({ message: "Test alert queued", notificationId: notification.id });
});

router.post("/webhooks/:channel", subscriptionLimiter, async (req: Request, res: Response) => {
  const secret = req.headers["x-bot-webhook-secret"]?.toString();
  if (!secret || secret !== process.env.BOT_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  try {
    const channel = req.params.channel.toUpperCase();
    if (channel !== BotChannel.WHATSAPP && channel !== BotChannel.TELEGRAM) {
      res.status(400).json({ error: "Unsupported bot channel" });
      return;
    }

    const payload = webhookPayloadSchema.parse(req.body);
    const subscription = await prisma.botSubscription.findFirst({
      where: {
        channel: channel as BotChannel,
        chatHandle: payload.chatHandle,
        status: BotSubscriptionStatus.ACTIVE,
      },
    });

    if (!subscription) {
      res.status(404).json({ error: "Bot subscription not found" });
      return;
    }

    const notification = await createUserNotification({
      userId: subscription.userId,
      type: mapEventTypeToNotificationType(payload.eventType),
      title: payload.title || "AfriTalent Bot Update",
      body: payload.body,
      metadata: {
        ...payload.metadata,
        channel,
        eventType: payload.eventType,
      },
      channel: payload.eventType === "job_match" ? "savedSearchAlerts" : "applicationUpdates",
    });

    await prisma.botSubscription.update({
      where: { id: subscription.id },
      data: { lastNotifiedAt: new Date() },
    });

    res.json({ accepted: true, notificationId: notification.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    logger.error({ error }, "Bot webhook processing failed");
    res.status(500).json({ error: "Bot webhook processing failed" });
  }
});

export default router;

