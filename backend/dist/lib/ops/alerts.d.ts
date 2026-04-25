import { AlertSeverity } from "@prisma/client";
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
export declare function createAlert(input: CreateAlertInput): Promise<void>;
/**
 * Resolve an alert
 */
export declare function resolveAlert(alertId: string, resolution: string): Promise<void>;
/**
 * Acknowledge an alert
 */
export declare function acknowledgeAlert(alertId: string): Promise<void>;
/**
 * Get active alerts by severity
 */
export declare function getActiveLerts(severity?: AlertSeverity): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    status: import(".prisma/client").$Enums.AlertStatus;
    severity: import(".prisma/client").$Enums.AlertSeverity;
    title: string;
    resolvedAt: Date | null;
    category: string;
    description: string;
    metrics: import("@prisma/client/runtime/library").JsonValue | null;
    affectedUsers: number | null;
    affectedJobs: number | null;
    affectedApps: number | null;
    firstOccurredAt: Date;
    lastOccurredAt: Date;
    resolution: string | null;
}[]>;
/**
 * Health check alert triggers
 */
export declare function checkAndCreateHealthAlert(category: string, isHealthy: boolean, details: string, metrics?: AlertMetrics): Promise<void>;
/**
 * Create warning alert for approaching thresholds
 */
export declare function checkAndCreateThresholdAlert(category: string, name: string, current: number, threshold: number, unit: string): Promise<void>;
//# sourceMappingURL=alerts.d.ts.map