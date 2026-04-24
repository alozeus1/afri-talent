import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { enforceAdminRbac, checkPermission, createAuditLog } from "../middleware/admin-rbac.js";
import { AdminPermission, AlertStatus, AlertSeverity } from "@prisma/client";
import { resolveAlert, acknowledgeAlert } from "../lib/ops/alerts.js";

const router = Router();

// All routes require authentication and MANAGE_ALERTS permission
router.use(authenticate, enforceAdminRbac);

// GET /api/admin/alerts - List active platform alerts
router.get(
    "/",
    checkPermission(AdminPermission.MANAGE_ALERTS),
    async (req: Request, res: Response) => {
        try {
            const { severity, status, category, page = "1", limit = "20" } = req.query;

            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
            const skip = (pageNum - 1) * limitNum;

            const where: any = {};

            if (severity && severity !== "ALL") {
                where.severity = severity;
            }

            if (status && status !== "ALL") {
                where.status = status;
            }

            if (category) {
                where.category = category;
            }

            const [alerts, total] = await Promise.all([
                prisma.platformAlert.findMany({
                    where,
                    orderBy: [{ severity: "desc" }, { lastOccurredAt: "desc" }],
                    skip,
                    take: limitNum,
                }),
                prisma.platformAlert.count({ where }),
            ]);

            res.json({
                alerts,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
            res.status(500).json({ error: "Failed to fetch alerts" });
        }
    }
);

// GET /api/admin/alerts/stats - Alert summary statistics
router.get(
    "/stats/summary",
    checkPermission(AdminPermission.VIEW_HEALTH_STATUS),
    async (_req: Request, res: Response) => {
        try {
            const [
                criticalCount,
                warningCount,
                infoCount,
                activeCount,
                resolvedLast24h,
                byCategoryCount,
            ] = await Promise.all([
                prisma.platformAlert.count({
                    where: { severity: AlertSeverity.CRITICAL, status: AlertStatus.ACTIVE },
                }),
                prisma.platformAlert.count({
                    where: { severity: AlertSeverity.WARNING, status: AlertStatus.ACTIVE },
                }),
                prisma.platformAlert.count({
                    where: { severity: AlertSeverity.INFO, status: AlertStatus.ACTIVE },
                }),
                prisma.platformAlert.count({ where: { status: AlertStatus.ACTIVE } }),
                prisma.platformAlert.count({
                    where: {
                        status: AlertStatus.RESOLVED,
                        resolvedAt: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        },
                    },
                }),
                prisma.platformAlert.groupBy({
                    by: ["category"],
                    where: { status: AlertStatus.ACTIVE },
                    _count: true,
                }),
            ]);

            res.json({
                totalActive: activeCount,
                bySeverity: {
                    critical: criticalCount,
                    warning: warningCount,
                    info: infoCount,
                },
                resolvedLast24h,
                byCategory: Object.fromEntries(
                    byCategoryCount.map((item) => [item.category, item._count])
                ),
            });
        } catch (error) {
            logger.error({ error }, "Failed to fetch alert stats");
            res.status(500).json({ error: "Failed to fetch alert statistics" });
        }
    }
);

// POST /api/admin/alerts/:id/acknowledge - Acknowledge an alert
router.post(
    "/:id/acknowledge",
    checkPermission(AdminPermission.MANAGE_ALERTS),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const alert = await prisma.platformAlert.findUnique({ where: { id } });
            if (!alert) {
                res.status(404).json({ error: "Alert not found" });
                return;
            }

            await acknowledgeAlert(id);

            await createAuditLog(
                req.adminRole?.id,
                "ALERT_CREATED",
                "ALERT",
                id,
                { targetName: alert.title },
                req
            );

            res.json({ success: true });
        } catch (error) {
            logger.error({ error }, "Failed to acknowledge alert");
            res.status(500).json({ error: "Failed to acknowledge alert" });
        }
    }
);

// POST /api/admin/alerts/:id/resolve - Resolve an alert
router.post(
    "/:id/resolve",
    checkPermission(AdminPermission.MANAGE_ALERTS),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { resolution } = req.body;

            const alert = await prisma.platformAlert.findUnique({ where: { id } });
            if (!alert) {
                res.status(404).json({ error: "Alert not found" });
                return;
            }

            await resolveAlert(id, resolution || "Manually resolved by admin");

            await createAuditLog(
                req.adminRole?.id,
                "ALERT_CREATED",
                "ALERT",
                id,
                { targetName: alert.title, reason: resolution },
                req
            );

            res.json({ success: true });
        } catch (error) {
            logger.error({ error }, "Failed to resolve alert");
            res.status(500).json({ error: "Failed to resolve alert" });
        }
    }
);

// GET /api/admin/alerts/:id - Get alert details
router.get(
    "/:id",
    checkPermission(AdminPermission.MANAGE_ALERTS),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const alert = await prisma.platformAlert.findUnique({ where: { id } });

            if (!alert) {
                res.status(404).json({ error: "Alert not found" });
                return;
            }

            res.json(alert);
        } catch (error) {
            logger.error({ error }, "Failed to fetch alert");
            res.status(500).json({ error: "Failed to fetch alert" });
        }
    }
);

export default router;
