import { verifyToken } from "../lib/jwt.js";
import { isTokenBlocked } from "../lib/redis.js";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
function extractToken(req) {
    // 1. HttpOnly cookie takes precedence (browser clients)
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
        if (match)
            return decodeURIComponent(match[1]);
    }
    // 2. Fall back to Authorization: Bearer (API clients, CLI tools, tests)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.split(" ")[1];
    }
    return null;
}
export async function authenticate(req, res, next) {
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
        req.user = payload;
        req.rawToken = token;
        next();
    }
    catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}
export async function optionalAuth(req, _res, next) {
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
        req.user = payload;
        req.rawToken = token;
    }
    catch {
        // Intentionally ignore bad tokens for optional auth paths.
    }
    next();
}
export function authorize(...roles) {
    return (req, res, next) => {
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
export function requireVerifiedEmail(options) {
    const roles = options?.roles ?? [Role.CANDIDATE, Role.EMPLOYER];
    return async (req, res, next) => {
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
export const requireRole = (roles) => authorize(...roles);
//# sourceMappingURL=auth.js.map