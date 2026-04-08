import { Request, Response, NextFunction } from "express";
export declare function featureFlagEnabled(flagName: string): boolean;
export declare function requireFeatureFlag(flagName: string): (_req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=feature-flags.d.ts.map