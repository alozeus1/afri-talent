import { Request, Response, NextFunction } from "express";
import { JWTPayload } from "../lib/jwt.js";
import { Role } from "@prisma/client";
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
            rawToken?: string;
        }
    }
}
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function authorize(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireVerifiedEmail(options?: {
    roles?: Role[];
}): (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const requireAuth: typeof authenticate;
export declare const requireRole: (roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map