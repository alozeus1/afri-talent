import { NotificationType, Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { isWebPushConfigured, sendWebPushNotification } from "./push.js";

export type NotificationChannel =
  | "savedSearchAlerts"
  | "interviewReminders"
  | "applicationUpdates"
  | "subscriptionNotices";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
  channel?: NotificationChannel;
}

export async function createUserNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
    },
  });

  if (!isWebPushConfigured()) {
    return notification;
  }

  const preferences = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
  });

  const channel = input.channel ?? "applicationUpdates";
  if (preferences && preferences[channel] === false) {
    return notification;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: input.userId, isActive: true },
  });

  const pushPayload = {
    title: input.title,
    body: input.body,
    notificationId: notification.id,
    type: input.type,
    metadata: input.metadata,
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendWebPushNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          pushPayload,
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : undefined;

        // 404 / 410 means subscription is gone; deactivate it.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { isActive: false },
          });
        }
      }
    }),
  );

  return notification;
}
