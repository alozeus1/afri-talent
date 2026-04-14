import prisma from "../prisma.js";
import { AlertSeverity, AlertStatus } from "@prisma/client";

export interface AlertMetrics {
    affectedUsers?: number;
    affectedJobs?: number;
    affectedApps?: number;
    value?: number;
    threshold?: number;
    current?: number;
    [key: string]: any;
}

export interface CreateAlertInput {
    title: string;
    description: string;
    severity: AlertSeverity;
    category: string;
    metrics?: AlertMetrics;
}

/**
 * Create a new platform alert
 */
export async function createAlert(input: CreateAlertInput): Promise<void> {
    try {
        // Check if a similar active alert exists
        const existingAlert = await prisma.platformAlert.findFirst({
            where: {
                title: input.title,
                status: AlertStatus.ACTIVE,
                severity: input.severity,
            },
        });

        if (existingAlert) {
            // Update last occurrence time instead of creating duplicate
            await prisma.platformAlert.update({
                where: { id: existingAlert.id },
                data: {
                    lastOccurredAt: new Date(),
                    metrics: input.metrics,
                },
            });
            return;
        }

        await prisma.platformAlert.create({
            data: {
                title: input.title,
                description: input.description,
                severity: input.severity,
                category: input.category,
                status: AlertStatus.ACTIVE,
                metrics: input.metrics,
                affectedUsers: input.metrics?.affectedUsers,
                affectedJobs: input.metrics?.affectedJobs,
                affectedApps: input.metrics?.affectedApps,
            },
        });

        console.log(`Created alert: ${input.title} (${input.severity})`);
    } catch (error: any) {
        console.error("Failed to create alert:", error);
    }
}

/**
 * Resolve an alert
 */
export async function resolveAlert(
    alertId: string,
    resolution: string
): Promise<void> {
    try {
        await prisma.platformAlert.update({
            where: { id: alertId },
            data: {
                status: AlertStatus.RESOLVED,
                resolvedAt: new Date(),
                resolution,
            },
        });

        console.log(`Resolved alert: ${alertId}`);
    } catch (error) {
        console.error("Failed to resolve alert:", error);
    }
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
    try {
        await prisma.platformAlert.update({
            where: { id: alertId },
            data: {
                status: AlertStatus.ACKNOWLEDGED,
            },
        });
    } catch (error) {
        console.error("Failed to acknowledge alert:", error);
    }
}

/**
 * Get active alerts by severity
 */
export async function getActiveLerts(severity?: AlertSeverity) {
    try {
        return await prisma.platformAlert.findMany({
            where: {
                status: AlertStatus.ACTIVE,
                ...(severity && { severity }),
            },
            orderBy: {
                lastOccurredAt: "desc",
            },
        });
    } catch (error: any) {
        console.error("Failed to fetch alerts:", error);
        return [];
    }
}

/**
 * Health check alert triggers
 */
export async function checkAndCreateHealthAlert(
    category: string,
    isHealthy: boolean,
    details: string,
    metrics?: AlertMetrics
): Promise<void> {
    if (isHealthy) {
        // Clear any critical alerts for this category
        const existingAlert = await prisma.platformAlert.findFirst({
            where: {
                category,
                status: AlertStatus.ACTIVE,
                severity: AlertSeverity.CRITICAL,
            },
        });

        if (existingAlert) {
            await resolveAlert(existingAlert.id, "System recovered to healthy state");
        }
    } else {
        // Create alert if unhealthy
        await createAlert({
            title: `${category} Health Check Failed`,
            description: details,
            severity: AlertSeverity.CRITICAL,
            category,
            metrics,
        });
    }
}

/**
 * Create warning alert for approaching thresholds
 */
export async function checkAndCreateThresholdAlert(
    category: string,
    name: string,
    current: number,
    threshold: number,
    unit: string
): Promise<void> {
    if (current >= threshold * 0.8) {
        // Alert at 80% of threshold
        await createAlert({
            title: `${name} Approaching Limit`,
            description: `${name} is at ${current}${unit}, approaching limit of ${threshold}${unit}`,
            severity: current >= threshold ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
            category,
            metrics: { current, threshold, value: current },
        });
    }
}
