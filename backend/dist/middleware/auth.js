import { verifyToken } from "../lib/jwt.js";
import { isTokenBlocked } from "../lib/redis.js";
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
//# sourceMappingURL=auth.js.map