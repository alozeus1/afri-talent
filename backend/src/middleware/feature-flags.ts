import { Request, Response, NextFunction } from "express";

function isEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function featureFlagEnabled(flagName: string): boolean {
  return isEnabled(process.env[flagName]);
}

export function requireFeatureFlag(flagName: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!featureFlagEnabled(flagName)) {
      res.status(503).json({
        error: "Feature not enabled",
        code: "FEATURE_DISABLED",
        feature: flagName,
      });
      return;
    }
    next();
  };
}

