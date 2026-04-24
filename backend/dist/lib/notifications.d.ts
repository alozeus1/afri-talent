import { NotificationType, Prisma } from "@prisma/client";
export type NotificationChannel = "savedSearchAlerts" | "weeklyDigests" | "applicationReminders" | "profileCompletionNudges" | "verificationCompletionNudges" | "visaRelocationAlerts" | "salaryInsights" | "interviewPrepRecommendations" | "interviewReminders" | "applicationUpdates" | "subscriptionNotices";
export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
    channel?: NotificationChannel;
}
export declare function createUserNotification(input: CreateNotificationInput): Promise<{
    type: import(".prisma/client").$Enums.NotificationType;
    id: string;
    userId: string;
    createdAt: Date;
    status: import(".prisma/client").$Enums.NotificationStatus;
    metadata: Prisma.JsonValue | null;
    title: string;
    body: string;
}>;
//# sourceMappingURL=notifications.d.ts.map