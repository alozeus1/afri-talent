import { Request, Response, NextFunction } from "express";
import { AdminPermission } from "@prisma/client";
declare global {
    namespace Express {
        interface Request {
            adminPermissions?: AdminPermission[];
            adminRole?: {
                id: string;
                title: string;
            };
        }
    }
}
/**
 * RBAC middleware for admin operations
 * Requires prior authentication via authenticate middleware
 */
export declare function enforceAdminRbac(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Factory for permission check middleware
 * Usage: router.get("/route", checkPermission(AdminPermission.VIEW_USERS), handler)
 */
export declare function checkPermission(requiredPermission: AdminPermission): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Factory for multiple permissions (any one required)
 */
export declare function checkAnyPermission(requiredPermissions: AdminPermission[]): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Audit log creation helper
 */
export declare function createAuditLog(adminId: string | undefined, action: any, targetType: string, targetId: string | null | undefined, metadata?: any, req?: Request): Promise<void>;
//# sourceMappingURL=admin-rbac.d.ts.map