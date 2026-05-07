import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
const isTestEnv =
  !process.env.NODE_ENV ||
  process.env.NODE_ENV === "test" ||
  process.env.NODE_ENV === "development" ||
  process.env.E2E === "1";
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function getRateLimitKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "anonymous");
}

function isInternalPublicFetch(req: Request): boolean {
  const marker = req.header("x-afritalent-internal-fetch");
  if (marker !== "server-public-api") {
    return false;
  }

  if (req.method !== "GET") {
    return false;
  }

  return req.path === "/api/public/stats" || req.path.startsWith("/api/jobs");
}

// Endpoints that browsers poll on every page navigation (RSC prefetches,
// session-restore, etc.). They are cheap, idempotent reads and should NOT be
// counted against the general per-IP burst budget — otherwise a single user
// browsing the marketing site can trip the limiter in under a minute.
const GENERAL_LIMITER_BYPASS_PATHS = new Set<string>([
  "/health",
  "/api/health",
  "/api/auth/me",
  "/api/auth/oauth/providers",
  "/api/public/stats",
  "/api/notifications/unread-count",
]);

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // 600/15min ≈ 40/min — comfortably accommodates real users (Next.js prefetch
  // + multiple RSC calls per page load). Abusive bursts are still blocked.
  max: isTestEnv ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => {
    if (GENERAL_LIMITER_BYPASS_PATHS.has(req.path)) return true;
    return isInternalPublicFetch(req);
  },
});
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many authentication attempts, please try again later" },
  skipSuccessfulRequests: false,
  skip: () => isTestEnv,
});

// Very strict limiter for registration
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many registration attempts, please try again later" },
  skip: () => isTestEnv,
});

// Password reset limiter (for future use)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: "Too many password reset attempts, please try again later" },
  skip: () => isTestEnv,
});

// Phone OTP request limiter — per user/IP, 3 OTPs per hour to control SMS spend.
export const phoneOtpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTestEnv ? 1000 : 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? getRateLimitKey(req);
  },
  message: {
    error: "phone_otp_rate_limited",
    code: "PHONE_OTP_RATE_LIMITED",
    message: "Too many OTP requests. Please wait an hour before requesting another code.",
  },
  handler: (_req, res, _next, options) => {
    res.status(429).json(options.message);
  },
});

// Phone OTP verify limiter — 5 verification attempts per 15 minutes per user/IP.
export const phoneOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? getRateLimitKey(req);
  },
  message: {
    error: "phone_otp_verify_rate_limited",
    code: "PHONE_OTP_VERIFY_RATE_LIMITED",
    message: "Too many verification attempts. Please wait before trying again.",
  },
  handler: (_req, res, _next, options) => {
    res.status(429).json(options.message);
  },
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
  for (const key of Object.keys(obj)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      delete obj[key];
      continue;
    }

    const value = obj[key];

    if (typeof value === "string") {
      // Remove null bytes and other control characters
      obj[key] = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    } else if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry && typeof entry === "object") {
          sanitizeObject(entry as Record<string, unknown>);
        }
      });
    } else if (typeof value === "object" && value !== null) {
      sanitizeObject(value as Record<string, unknown>);
    }
  }
}

// Skills rate limiter — per user, 30 requests per minute
// Applied to all AI skill endpoints to prevent Claude API cost abuse
export const skillsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  keyGenerator: (req: Request): string => {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? getRateLimitKey(req);
  },
  message: {
    error: "rate_limit_exceeded",
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many AI skill requests. Please wait a minute before trying again.",
    retryAfter: 60,
  },
  handler: (_req, res, _next, options) => {
    res.setHeader("Retry-After", "60");
    res.status(429).json(options.message);
  },
});

// Stricter limiter for the heaviest AI endpoints (*/generate, */scan-ats).
// Each call costs $0.003–$0.03 in upstream provider spend, so we cap
// per-user bursts at 6 per minute.
export const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTestEnv ? 1000 : 6,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTestEnv,
  keyGenerator: (req: Request): string => {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? getRateLimitKey(req);
  },
  message: {
    error: "rate_limit_exceeded",
    code: "RATE_LIMIT_EXCEEDED",
    message: "You are generating AI content very quickly. Please wait ~60 seconds before trying again.",
    retryAfter: 60,
  },
  handler: (_req, res, _next, options) => {
    res.setHeader("Retry-After", "60");
    res.status(429).json(options.message);
  },
});

// Orchestrator rate limiter — per user, 10 requests per minute
// This is more restrictive than the general limiter due to Claude API costs
export const orchestratorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in test environment so the test suite can make
  // many requests without exhausting the in-memory window counter.
  skip: () => isTestEnv,
  keyGenerator: (req: Request): string => {
    // Use user ID if authenticated (more precise), fallback to IP via the
    // ipKeyGenerator helper (required by express-rate-limit v8 for IPv6 safety).
    const userId = (req as Request & { user?: { userId: string } }).user?.userId;
    return userId ?? getRateLimitKey(req);
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
