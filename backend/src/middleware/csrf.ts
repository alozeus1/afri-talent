import type { Request, Response, NextFunction } from "express";
import { doubleCsrf } from "csrf-csrf";
import jwt from "jsonwebtoken";

// §2.3 — double-submit CSRF protection via the `csrf-csrf` library.
//
// State-changing requests must echo a signed cookie value as the
// `X-CSRF-Token` header. The cookie is set by `issueCsrfToken` and surfaced
// to the SPA from `/api/auth/me`. Anonymous entry points (login, register,
// password reset, OAuth start/callback) and webhook routes are exempt — the
// caller cannot yet hold a token, or the route uses a stronger gate
// (signature verification / OAuth state cookie).

const isTestMode = process.env.NODE_ENV === "test" || process.env.E2E === "1";
const isProduction = process.env.NODE_ENV === "production";

const TEST_BYPASS_HEADER = "x-csrf-test-bypass";

const EXEMPT_PREFIXES = [
  "/api/webhooks",       // Stripe / Flutterwave — signature-verified
  "/api/ats/webhooks",   // ATS integrations — signature-verified
  "/api/health",
  "/api/ready",
  "/api/live",
  "/health",
  "/live",
  "/ready",
];

const EXEMPT_PATTERNS: RegExp[] = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/forgot-password$/,
  /^\/api\/auth\/reset-password(\/|$)/,
  /^\/api\/auth\/email\/verify$/,
  /^\/api\/auth\/oauth\/[^/]+\/(start|callback)$/, // state-protected
  /^\/api\/auth\/phone\//,                          // OTP, rate-limited
];

function isExempt(req: Request): boolean {
  if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return true;
  if (EXEMPT_PATTERNS.some((rx) => rx.test(req.path))) return true;
  return false;
}

function sessionIdentifier(req: Request): string {
  // Prefer the authenticated user ID. We decode (do NOT verify) the auth_token
  // cookie loosely; the authenticate middleware later verifies the signature
  // before granting any privilege. Fallback to IP for anonymous callers.
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
    if (match) {
      try {
        const decoded = jwt.decode(decodeURIComponent(match[1])) as
          | { userId?: string }
          | null;
        if (decoded?.userId) return decoded.userId;
      } catch {
        // fall through to IP
      }
    }
  }
  return req.ip || "anonymous";
}

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("CSRF middleware: CSRF_SECRET or JWT_SECRET must be set");
    }
    return secret;
  },
  getSessionIdentifier: sessionIdentifier,
  cookieName: "afri_csrf",
  cookieOptions: {
    httpOnly: false, // SPA must read it client-side
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  },
  size: 64,
  getCsrfTokenFromRequest: (req: Request) =>
    typeof req.headers["x-csrf-token"] === "string"
      ? (req.headers["x-csrf-token"] as string)
      : undefined,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  skipCsrfProtection: (req: Request) => {
    // Test mode bypass: tests opt in via header to exercise the gate.
    if (isTestMode && req.headers[TEST_BYPASS_HEADER] !== "enforce") return true;
    return isExempt(req);
  },
});

export const csrfProtection = doubleCsrfProtection;

export function issueCsrfToken(req: Request, res: Response): string {
  return generateCsrfToken(req, res);
}

export { validateRequest };

// Express error handler that converts the library's invalidCsrfTokenError into
// a JSON 403 response with the codebase's standard shape. Must be registered
// after the routes so it catches errors thrown by doubleCsrfProtection.
export function csrfErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err === invalidCsrfTokenError || (err instanceof Error && err.name === "ForbiddenError")) {
    res.status(403).json({
      error: "CSRF token missing or invalid. Refresh the page and try again.",
      code: "CSRF_INVALID",
    });
    return;
  }
  next(err);
}
