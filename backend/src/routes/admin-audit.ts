import { Router, Request, Response } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { enforceAdminRbac, checkPermission } from "../middleware/admin-rbac.js";
import { AdminPermission, AdminAction } from "@prisma/client";

const router = Router();

// All routes require authentication and VIEW_AUDIT_LOGS permission
router.use(authenticate, enforceAdminRbac);

// GET /api/admin/audit-logs - List audit logs with filtering
router.get(
    "/",
    checkPermission(AdminPermission.VIEW_AUDIT_LOGS),
    async (req: Request, res: Response) => {
        try {
            const {
                action,
                adminId,
                targetType,
                targetId,
                page = "1",
                limit = "50",
                startDate,
                endDate,
            } = req.query;

            const pageNum = Math.max(1, parseInt(page as string) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
            const skip = (pageNum - 1) * limitNum;

            // Build filter
            const where: any = {};

            if (action && action !== "ALL") {
                where.action = action;
            }

            if (adminId) {
                where.adminId = adminId;
            }

            if (targetType) {
                where.targetType = targetType;
            }

            if (targetId) {
                where.targetId = targetId;
            }

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) {
                    where.createdAt.gte = new Date(startDate as string);
                }
                if (endDate) {
                    where.createdAt.lte = new Date(endDate as string);
                }
            }

            const [logs, total] = await Promise.all([
                prisma.auditLog.findMany({
                    where,
                    include: {
                        admin: {
                            select: {
                                id: true,
                                title: true,
                                admin: { select: { email: true, name: true } },
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    skip,
                    take: limitNum,
                }),
                prisma.auditLog.count({ where }),
            ]);

            res.json({
                logs: logs.map((log) => ({
                    id: log.id,
                    action: log.action,
                    admin: log.admin
                        ? {
                            id: log.admin.id,
                            title: log.admin.title,
                            email: log.admin.admin.email,
                            name: log.admin.admin.name,
                        }
                        : null,
                    target: {
                        type: log.targetType,
                        id: log.targetId,
                        name: log.targetName,
                    },
                    changes: log.changes,
                    reason: log.reason,
                    status: log.status,
                    timestamp: log.createdAt,
                    ipAddress: log.ipAddress,
                })),
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            logger.error("Failed to fetch audit logs:", error);
            res.status(500).json({ error: "Failed to fetch audit logs" });
        }
    }
);

// GET /api/admin/audit-logs/:id - Get single audit log detail
router.get(
    "/:id",
    checkPermission(AdminPermission.VIEW_AUDIT_LOGS),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const log = await prisma.auditLog.findUnique({
                where: { id },
                include: {
                    admin: {
                        select: {
                            id: true,
                            title: true,
                            admin: { select: { email: true, name: true } },
                        },
                    },
                },
            });

            if (!log) {
                res.status(404).json({ error: "Audit log not found" });
                return;
            }

            res.json({
                id: log.id,
                action: log.action,
                admin: log.admin
                    ? {
                        id: log.admin.id,
                        title: log.admin.title,
                        email: log.admin.admin.email,
                        name: log.admin.admin.name,
                    }
                    : null,
                target: {
                    type: log.targetType,
                    id: log.targetId,
                    name: log.targetName,
                    resource: log.resourceType,
                    resourceId: log.resourceId,
                },
                changes: log.changes,
                reason: log.reason,
                metadata: log.metadata,
                status: log.status,
                errorDetails: log.errorDetails,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                timestamp: log.createdAt,
            });
        } catch (error) {
            logger.error("Failed to fetch audit log:", error);
            res.status(500).json({ error: "Failed to fetch audit log" });
        }
    }
);

// GET /api/admin/audit-logs/stats - Audit log statistics
router.get(
    "/stats/summary",
    checkPermission(AdminPermission.VIEW_AUDIT_LOGS),
    async (_req: Request, res: Response) => {
        try {
            const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const [logs24h, logs7d, actionBreakdown] = await Promise.all([
                prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
                prisma.auditLog.count({ where: { createdAt: { gte: last7d } } }),
                prisma.auditLog.groupBy({
                    by: ["action"],
                    where: { createdAt: { gte: last7d } },
                    _count: true,
                }),
            ]);

            const topTargets = await prisma.auditLog.groupBy({
                by: ["targetType"],
                where: { createdAt: { gte: last7d } },
                _count: true,
                orderBy: { _count: { createdAt: "desc" } },
                take: 5,
            });

            res.json({
                period: "last_7_days",
                totalLogs7d: logs7d,
                totalLogs24h: logs24h,
                actionBreakdown: actionBreakdown.map((item) => ({
                    action: item.action,
                    count: item._count,
                })),
                topTargets: topTargets.map((item) => ({
                    targetType: item.targetType,
                    count: item._count,
                })),
            });
        } catch (error) {
            logger.error("Failed to fetch audit stats:", error);
            res.status(500).json({ error: "Failed to fetch audit statistics" });
        }
    }
);

export default router;
