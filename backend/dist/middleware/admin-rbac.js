import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
/**
 * RBAC middleware for admin operations
 * Requires prior authentication via authenticate middleware
 */
export async function enforceAdminRbac(req, res, next) {
    try {
        // Must be authenticated
        if (!req.user) {
            res.status(401).json({ error: "Authentication required" });
            return;
        }
        // Must have ADMIN role
        if (req.user.role !== Role.ADMIN) {
            console.warn(`Non-admin user ${req.user.userId} attempted admin access`);
            res.status(403).json({ error: "Admin access required" });
            return;
        }
        // Load admin role and permissions
        const adminRole = await prisma.adminRole.findUnique({
            where: { adminId: req.user.userId },
        });
        if (!adminRole || !adminRole.isActive) {
            logger.warn(`Inactive or missing admin role for user ${req.user.userId}`);
            res.status(403).json({ error: "Admin role not active" });
            return;
        }
        // Attach permissions and role to request
        req.adminPermissions = adminRole.permissions;
        req.adminRole = {
            id: adminRole.id,
            title: adminRole.title,
        };
        next();
    }
    catch (error) {
        logger.error({ error }, "RBAC error");
        res.status(500).json({ error: "Authorization failed" });
    }
}
/**
 * Factory for permission check middleware
 * Usage: router.get("/route", checkPermission(AdminPermission.VIEW_USERS), handler)
 */
export function checkPermission(requiredPermission) {
    return (req, res, next) => {
        if (!req.adminPermissions?.includes(requiredPermission)) {
            logger.warn(`User ${req.user?.userId} lacks permission ${requiredPermission}`);
            res.status(403).json({
                error: `Permission required: ${requiredPermission}`,
            });
            return;
        }
        next();
    };
}
/**
 * Factory for multiple permissions (any one required)
 */
export function checkAnyPermission(requiredPermissions) {
    return (req, res, next) => {
        const hasPermission = requiredPermissions.some((perm) => req.adminPermissions?.includes(perm));
        if (!hasPermission) {
            logger.warn(`User ${req.user?.userId} lacks any of permissions: ${requiredPermissions.join(", ")}`);
            res.status(403).json({
                error: `One of the following permissions required: ${requiredPermissions.join(", ")}`,
            });
            return;
        }
        next();
    };
}
/**
 * Audit log creation helper
 */
export async function createAuditLog(adminId, action, targetType, targetId, metadata = {}, req) {
    try {
        await prisma.auditLog.create({
            data: {
                adminId,
                action,
                targetType,
                targetId: targetId ?? undefined,
                targetName: metadata.targetName,
                resourceType: metadata.resourceType,
                resourceId: metadata.resourceId,
                changes: metadata.changes,
                reason: metadata.reason,
                ipAddress: req?.ip,
                userAgent: req?.get("user-agent"),
                metadata: metadata.extra,
                status: "SUCCESS",
            },
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to create audit log");
    }
}
//# sourceMappingURL=admin-rbac.js.map