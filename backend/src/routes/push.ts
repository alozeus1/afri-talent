import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import prisma from "../lib/prisma.js";
import { getWebPushPublicKey, isWebPushConfigured } from "../lib/push.js";
import { createUserNotification } from "../lib/notifications.js";

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
});

const notificationPreferenceSchema = z.object({
  savedSearchAlerts: z.boolean().optional(),
  weeklyDigests: z.boolean().optional(),
  applicationReminders: z.boolean().optional(),
  profileCompletionNudges: z.boolean().optional(),
  verificationCompletionNudges: z.boolean().optional(),
  visaRelocationAlerts: z.boolean().optional(),
  salaryInsights: z.boolean().optional(),
  interviewPrepRecommendations: z.boolean().optional(),
  interviewReminders: z.boolean().optional(),
  applicationUpdates: z.boolean().optional(),
  subscriptionNotices: z.boolean().optional(),
  marketing: z.boolean().optional(),
  maxNotificationsPerWeek: z.number().int().min(1).max(21).optional(),
  minimumHoursBetweenNotifications: z.number().int().min(1).max(72).optional(),
});

const testNotificationSchema = z.object({
  type: z.enum([
    "savedSearchAlerts",
    "weeklyDigests",
    "applicationReminders",
    "profileCompletionNudges",
    "verificationCompletionNudges",
    "visaRelocationAlerts",
    "salaryInsights",
    "interviewPrepRecommendations",
    "interviewReminders",
    "applicationUpdates",
    "subscriptionNotices",
  ]),
});

router.get("/vapid-public-key", authenticate, (_req: Request, res: Response) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ error: "Web push is not configured" });
    return;
  }
  res.json({ publicKey: getWebPushPublicKey() });
});

router.get("/preferences", authenticate, async (req: Request, res: Response) => {
  const preferences = await prisma.notificationPreference.upsert({
    where: { userId: req.user!.userId },
    create: { userId: req.user!.userId },
    update: {},
  });
  res.json(preferences);
});

router.put("/preferences", authenticate, async (req: Request, res: Response) => {
  try {
    const data = notificationPreferenceSchema.parse(req.body);
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        ...data,
      },
      update: data,
    });
    res.json(preferences);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

router.post("/subscribe", authenticate, async (req: Request, res: Response) => {
  try {
    const data = subscriptionSchema.parse(req.body);
    const subscription = await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId: req.user!.userId,
          endpoint: data.endpoint,
        },
      },
      create: {
        userId: req.user!.userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: req.headers["user-agent"] || null,
        isActive: true,
      },
      update: {
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        userAgent: req.headers["user-agent"] || null,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    res.status(201).json({ id: subscription.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to subscribe for push notifications" });
  }
});

router.delete("/subscribe", authenticate, async (req: Request, res: Response) => {
  try {
    const data = z.object({ endpoint: z.string().url() }).parse(req.body);
    await prisma.pushSubscription.updateMany({
      where: { userId: req.user!.userId, endpoint: data.endpoint },
      data: { isActive: false },
    });
    res.json({ message: "Push subscription removed" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to unsubscribe from push notifications" });
  }
});

router.post("/test", authenticate, async (req: Request, res: Response) => {
  try {
    const data = testNotificationSchema.parse(req.body);
    const titleMap: Record<z.infer<typeof testNotificationSchema>["type"], string> = {
      savedSearchAlerts: "New jobs match your saved search",
      weeklyDigests: "Your weekly trusted-job digest is ready",
      applicationReminders: "Keep your search momentum going",
      profileCompletionNudges: "Complete your profile to improve match quality",
      verificationCompletionNudges: "Finish verification to boost employer trust",
      visaRelocationAlerts: "Visa-friendly roles just matched your preferences",
      salaryInsights: "Fresh salary insight is available",
      interviewPrepRecommendations: "Interview prep is recommended now",
      interviewReminders: "Interview reminder",
      applicationUpdates: "Your application has an update",
      subscriptionNotices: "Subscription notice",
    };
    const bodyMap: Record<z.infer<typeof testNotificationSchema>["type"], string> = {
      savedSearchAlerts: "New high-match roles were found for your saved alert.",
      weeklyDigests: "This week’s top trusted jobs are ready to review.",
      applicationReminders: "A handful of strong matches are still fresh right now.",
      profileCompletionNudges: "A more complete profile helps employers trust your application faster.",
      verificationCompletionNudges: "Phone, identity, and skills signals improve your shortlist odds.",
      visaRelocationAlerts: "We found roles with clear visa or relocation support signals.",
      salaryInsights: "Current pay data can help you avoid low-signal applications.",
      interviewPrepRecommendations: "Practice before your next recruiter response lands.",
      interviewReminders: "Your interview is coming up soon. Good luck!",
      applicationUpdates: "An employer has changed your application status.",
      subscriptionNotices: "Your plan renewal and billing summary are ready.",
    };

    const notification = await createUserNotification({
      userId: req.user!.userId,
      type:
        data.type === "weeklyDigests"
          ? "WEEKLY_DIGEST"
          : data.type === "salaryInsights"
            ? "SALARY_INSIGHT"
            : data.type === "interviewPrepRecommendations"
              ? "INTERVIEW_PREP"
              : data.type === "profileCompletionNudges" || data.type === "applicationReminders" || data.type === "visaRelocationAlerts"
                ? "RETENTION_NUDGE"
                : "VERIFICATION",
      title: titleMap[data.type],
      body: bodyMap[data.type],
      channel: data.type,
      metadata: { source: "push-test", category: data.type },
    });

    res.json({ message: "Test notification sent", notificationId: notification.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    res.status(500).json({ error: "Failed to send test notification" });
  }
});

export default router;
