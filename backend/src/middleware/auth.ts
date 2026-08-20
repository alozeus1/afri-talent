import { Request, Response, NextFunction } from "express";
import { verifyToken, JWTPayload } from "../lib/jwt.js";
import { isTokenBlocked } from "../lib/redis.js";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      rawToken?: string; // raw JWT string, stored for logout blocklisting
    }
  }
}

function extractToken(req: Request): string | null {
  // 1. HttpOnly cookie takes precedence (browser clients)
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
    if (match) return decodeURIComponent(match[1]);
  }

  // 2. Fall back to Authorization: Bearer (API clients, CLI tools, tests)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return null;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user && req.rawToken) {
    next();
    return;
  }

  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Authorization token required" });
    return;
  }

  try {
    const payload = verifyToken(token);

    // Check Redis blocklist (fail-open: if Redis unavailable, token still accepted)
    if (await isTokenBlocked(token)) {
      res.status(401).json({ error: "Token has been revoked" });
      return;
    }

    // JWT claims are a session snapshot, not an authorization source of
    // truth. Rehydrate the account on every protected request so a role
    // downgrade or account deletion takes effect immediately instead of when
    // the (up-to-seven-day) token expires.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, deletedAt: true, accountRestrictionStatus: true },
    });

    if (!user || user.deletedAt || user.accountRestrictionStatus === "SUSPENDED") {
      res.status(401).json({ error: "Account is no longer active" });
      return;
    }

    req.user = { ...payload, email: user.email, role: user.role };
    req.rawToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    if (await isTokenBlocked(token)) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, deletedAt: true, accountRestrictionStatus: true },
    });
    if (!user || user.deletedAt || user.accountRestrictionStatus === "SUSPENDED") {
      next();
      return;
    }

    req.user = { ...payload, email: user.email, role: user.role };
    req.rawToken = token;
  } catch {
    // Intentionally ignore bad tokens for optional auth paths.
  }

  next();
}

export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requireVerifiedEmail(options?: { roles?: Role[] }) {
  const roles = options?.roles ?? [Role.CANDIDATE, Role.EMPLOYER];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { emailVerified: true, email: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: "Email verification required for this action.",
        code: "EMAIL_VERIFICATION_REQUIRED",
        email: user.email,
      });
      return;
    }

    next();
  };
}

// Aliases for convenience
export const requireAuth = authenticate;
export const requireRole = (roles: Role[]) => authorize(...roles);
