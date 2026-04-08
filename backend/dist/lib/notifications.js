import prisma from "./prisma.js";
import { isWebPushConfigured, sendWebPushNotification } from "./push.js";
import logger from "./logger.js";
import { recordOpsEvent } from "./ops/events.js";
import { pushDeadLetter, withRetry } from "./ops/resilience.js";
export async function createUserNotification(input) {
    const notification = await prisma.notification.create({
        data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            metadata: input.metadata,
        },
    });
    recordOpsEvent({
        metricName: "notification_delivery_success",
        category: "notifications",
        details: {
            channel: "in_app",
            type: input.type,
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
    let deliveredPushCount = 0;
    let failedPushCount = 0;
    await Promise.all(subscriptions.map(async (subscription) => {
        try {
            await withRetry(() => sendWebPushNotification({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dh,
                    auth: subscription.auth,
                },
            }, pushPayload), {
                operationName: "webpush_delivery",
                attempts: 2,
                initialDelayMs: 250,
            });
            deliveredPushCount += 1;
        }
        catch (error) {
            failedPushCount += 1;
            const statusCode = typeof error === "object" && error && "statusCode" in error
                ? Number(error.statusCode)
                : undefined;
            // 404 / 410 means subscription is gone; deactivate it.
            if (statusCode === 404 || statusCode === 410) {
                await prisma.pushSubscription.update({
                    where: { id: subscription.id },
                    data: { isActive: false },
                });
            }
            await pushDeadLetter({
                category: "notification",
                source: "webpush_delivery",
                reasonCode: statusCode === 404 || statusCode === 410 ? "subscription_gone" : "delivery_failed",
                error,
                payload: {
                    notificationId: notification.id,
                    subscriptionId: subscription.id,
                    notificationType: input.type,
                },
            });
        }
    }));
    if (deliveredPushCount > 0) {
        recordOpsEvent({
            metricName: "notification_delivery_success",
            category: "notifications",
            value: deliveredPushCount,
            details: {
                channel: "webpush",
                type: input.type,
            },
        });
    }
    if (failedPushCount > 0) {
        logger.warn({ notificationId: notification.id, failedPushCount, deliveredPushCount }, "[notifications] web push delivery failures recorded");
        recordOpsEvent({
            metricName: "notification_delivery_failure",
            category: "notifications",
            outcome: "failure",
            severity: "warning",
            value: failedPushCount,
            details: {
                channel: "webpush",
                type: input.type,
            },
        });
    }
    return notification;
}
//# sourceMappingURL=notifications.js.map