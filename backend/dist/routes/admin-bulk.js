import { Router } from "express";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { authenticate } from "../middleware/auth.js";
import { enforceAdminRbac, checkPermission, createAuditLog } from "../middleware/admin-rbac.js";
import { AdminPermission, BulkOperationType, BulkOperationStatus } from "@prisma/client";
const router = Router();
// All routes require authentication
router.use(authenticate, enforceAdminRbac);
// POST /api/admin/bulk - Create a bulk operation
router.post("/", checkPermission(AdminPermission.RUN_BULK_OPERATIONS), async (req, res) => {
    try {
        const { operationType, filters, userIds, reason } = req.body;
        // Validate operation type
        if (!Object.values(BulkOperationType).includes(operationType)) {
            res.status(400).json({ error: "Invalid operation type" });
            return;
        }
        // For operations that modify data, require MODIFY_BULK_DATA permission
        const modifyingOps = [
            BulkOperationType.USER_RESTRICTION,
            BulkOperationType.PASSWORD_RESET,
            BulkOperationType.JOB_BATCH_REVIEW,
            BulkOperationType.VERIFICATION_BATCH_PROCESS,
        ];
        if (modifyingOps.includes(operationType)) {
            // Create a pending operation for approval workflow
            const operation = await prisma.bulkOperation.create({
                data: {
                    operationType,
                    status: BulkOperationStatus.QUEUED,
                    initiatedBy: req.user?.email,
                    filters,
                    targetCount: userIds?.length || 0,
                },
            });
            await createAuditLog(req.adminRole?.id, "BULK_OPERATION_STARTED", "BULK_OPERATION", operation.id, { targetName: operationType, reason, userCount: userIds?.length }, req);
            res.status(202).json({
                id: operation.id,
                status: "QUEUED",
                message: "Bulk operation queued for execution",
            });
            return;
        }
        // For read-only operations (DATA_EXPORT, etc)
        const operation = await prisma.bulkOperation.create({
            data: {
                operationType,
                status: BulkOperationStatus.RUNNING,
                initiatedBy: req.user?.email,
                filters,
                targetCount: userIds?.length || 0,
            },
        });
        // Execute operation
        let result = { success: false, error: "Operation type not supported" };
        if (operationType === BulkOperationType.DATA_EXPORT) {
            result = await executeBulkExport(operation.id, filters);
        }
        else if (operationType === BulkOperationType.CUSTOM_QUERY) {
            result = await executeBulkCustomQuery(operation.id, filters);
        }
        // Update operation with results
        if (result?.success) {
            await prisma.bulkOperation.update({
                where: { id: operation.id },
                data: {
                    status: BulkOperationStatus.COMPLETED,
                    completedAt: new Date(),
                    successCount: result.count || 0,
                    results: result.data,
                },
            });
            await createAuditLog(req.adminRole?.id, "BULK_OPERATION_COMPLETED", "BULK_OPERATION", operation.id, { targetName: operationType, successCount: result.count }, req);
        }
        else {
            await prisma.bulkOperation.update({
                where: { id: operation.id },
                data: {
                    status: BulkOperationStatus.FAILED,
                    completedAt: new Date(),
                    errorLog: result?.error || "Unknown error",
                },
            });
        }
        res.json({
            id: operation.id,
            status: result?.success ? "COMPLETED" : "FAILED",
            result,
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to create bulk operation");
        res.status(500).json({ error: "Failed to create bulk operation" });
    }
});
// GET /api/admin/bulk/:id - Get bulk operation status
router.get("/:id", checkPermission(AdminPermission.RUN_BULK_OPERATIONS), async (req, res) => {
    try {
        const { id } = req.params;
        const operation = await prisma.bulkOperation.findUnique({
            where: { id },
        });
        if (!operation) {
            res.status(404).json({ error: "Operation not found" });
            return;
        }
        res.json({
            id: operation.id,
            operationType: operation.operationType,
            status: operation.status,
            targetCount: operation.targetCount,
            successCount: operation.successCount,
            failureCount: operation.failureCount,
            progress: operation.targetCount > 0
                ? Math.round(((operation.successCount + operation.failureCount) / operation.targetCount) * 100)
                : 0,
            startedAt: operation.startedAt,
            completedAt: operation.completedAt,
            createdAt: operation.createdAt,
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to fetch operation");
        res.status(500).json({ error: "Failed to fetch operation" });
    }
});
// GET /api/admin/bulk - List bulk operations
router.get("/", checkPermission(AdminPermission.RUN_BULK_OPERATIONS), async (req, res) => {
    try {
        const { status, operationType, page = "1", limit = "20" } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
        const skip = (pageNum - 1) * limitNum;
        const where = {};
        if (status)
            where.status = status;
        if (operationType)
            where.operationType = operationType;
        const [operations, total] = await Promise.all([
            prisma.bulkOperation.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limitNum,
            }),
            prisma.bulkOperation.count({ where }),
        ]);
        res.json({
            operations,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    }
    catch (error) {
        logger.error({ error }, "Failed to fetch operations");
        res.status(500).json({ error: "Failed to fetch operations" });
    }
});
// Helper functions
async function executeBulkExport(operationId, filters) {
    try {
        // Query based on filters
        const users = await prisma.user.findMany({
            where: filters?.users || {},
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                emailVerified: true,
            },
        });
        return {
            success: true,
            count: users.length,
            data: { users },
        };
    }
    catch (error) {
        logger.error({ error }, "Data export failed");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
async function executeBulkCustomQuery(operationId, filters) {
    try {
        // Execute custom query based on filters
        const result = await prisma.user.findMany({
            where: filters,
            take: 1000, // Limit to prevent huge exports
        });
        return {
            success: true,
            count: result.length,
            data: result,
        };
    }
    catch (error) {
        logger.error({ error }, "Custom query failed");
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
export default router;
//# sourceMappingURL=admin-bulk.js.map