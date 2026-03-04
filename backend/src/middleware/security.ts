import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

// Helmet configuration for security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
});

// General API rate limiter
const isTestEnv = process.env.NODE_ENV === "test" || process.env.E2E === "1";
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  },
});
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
  skipSuccessfulRequests: false,
});

// Very strict limiter for registration
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts, please try again later" },
});

// Password reset limiter (for future use)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset attempts, please try again later" },
});

// Request sanitization middleware
export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  // Remove potentially dangerous characters from string inputs
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === "object") {
    sanitizeObject(req.query as Record<string, unknown>);
  }
  next();
}

function sanitizeObject(obj: Record<string, unknown>): void {
  for (const key in obj) {
    if (typeof obj[key] === "string") {
      // Remove null bytes and other control characters
      obj[key] = (obj[key] as string).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key] as Record<string, unknown>);
    }
  }
}

// Orchestrator rate limiter — per user, 10 requests per minute
// This is more restrictive than the general limiter due to Claude API costs
export const orchestratorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test environment so the test suite can make
  // many requests without exhausting the in-memory window counter.
  skip: () => process.env.NODE_ENV === "test",
  keyGenerator: (req: Request): string => {
    // Use user ID if authenticated (more precise), fallback to IP via the
    // ipKeyGenerator helper (required by express-rate-limit v8 for IPv6 safety).
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? req.ip ?? req.socket?.remoteAddress ?? "anonymous";
  },
  message: {
    error: "rate_limit_exceeded",
    message: "Too many AI assistant requests. Please wait a minute before trying again.",
    retryAfter: 60,
  },
  handler: (_req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});
