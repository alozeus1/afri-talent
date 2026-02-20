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
export declare function authorize(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map