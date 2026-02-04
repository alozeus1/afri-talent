import jwt from "jsonwebtoken";
// Security: JWT secret validation
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production environment");
}
const FALLBACK_SECRET = "dev-only-secret-change-in-production";
const SECRET = JWT_SECRET || FALLBACK_SECRET;
// Configurable token expiration (default: 7 days)
// Using number of seconds for type safety
const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds
const JWT_EXPIRES_IN_DISPLAY = process.env.JWT_EXPIRES_IN || "7d";
// Token configuration
const TOKEN_CONFIG = {
    issuer: "afritalent-api",
    audience: "afritalent-app",
};
export function signToken(payload) {
    const options = {
        expiresIn: JWT_EXPIRES_IN_SECONDS,
        issuer: TOKEN_CONFIG.issuer,
        audience: TOKEN_CONFIG.audience,
    };
    return jwt.sign(payload, SECRET, options);
}
export function verifyToken(token) {
    const options = {
        issuer: TOKEN_CONFIG.issuer,
        audience: TOKEN_CONFIG.audience,
    };
    return jwt.verify(token, SECRET, options);
}
// Get token expiration time for display
export function getTokenExpiresIn() {
    return JWT_EXPIRES_IN_DISPLAY;
}
// Utility to decode token without verification (for debugging)
export function decodeToken(token) {
    const decoded = jwt.decode(token);
    return decoded;
}
//# sourceMappingURL=jwt.js.map