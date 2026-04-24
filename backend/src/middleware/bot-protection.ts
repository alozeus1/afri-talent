import { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const FORM_MIN_COMPLETION_MS = 1200;
const FORM_MAX_COMPLETION_MS = 2 * 60 * 60 * 1000;
const obviousAutomationUserAgent =
  /(HeadlessChrome|Playwright|Puppeteer|PhantomJS|Selenium|node-fetch|python-requests|curl\/|wget\/|scrapy|Go-http-client|axios\/|httpx|undici)/i;

interface BotShieldPayload {
  website?: string;
  startedAt?: number;
}

function getClientKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? "anonymous");
}

function isInternalFetch(req: Request): boolean {
  return req.header("x-afritalent-internal-fetch") === "server-public-api";
}

function isObviousAutomation(req: Request): boolean {
  const userAgent = req.header("user-agent") ?? "";
  return obviousAutomationUserAgent.test(userAgent);
}

function parseBotShield(req: Request): BotShieldPayload {
  if (!req.body || typeof req.body !== "object") {
    return {};
  }

  const raw = (req.body as Record<string, unknown>).botShield;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const candidate = raw as Record<string, unknown>;
  return {
    website: typeof candidate.website === "string" ? candidate.website : undefined,
    startedAt: typeof candidate.startedAt === "number" ? candidate.startedAt : undefined,
  };
}

export function validateHumanAuthSubmission(req: Request, res: Response, next: NextFunction): void {
  const shield = parseBotShield(req);
  const filledHoneypot = typeof shield.website === "string" && shield.website.trim() !== "";

  if (filledHoneypot) {
    res.status(400).json({ error: "We couldn't verify this request. Please try again." });
    return;
  }

  if (typeof shield.startedAt === "number") {
    const elapsedMs = Date.now() - shield.startedAt;
    if (elapsedMs < FORM_MIN_COMPLETION_MS || elapsedMs > FORM_MAX_COMPLETION_MS) {
      res.status(400).json({ error: "We couldn't verify this request. Please refresh and try again." });
      return;
    }
  } else if (isObviousAutomation(req)) {
    res.status(403).json({ error: "Automated access is not allowed for this action." });
    return;
  }

  next();
}

export const anonymousJobsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  skip: (req) => Boolean((req as Request & { user?: { userId: string } }).user) || isInternalFetch(req),
  message: { error: "Too many search requests. Please slow down and try again shortly." },
});

export function blockAnonymousJobsAutomation(req: Request, res: Response, next: NextFunction): void {
  if ((req as Request & { user?: { userId: string } }).user || isInternalFetch(req)) {
    next();
    return;
  }

  if (isObviousAutomation(req)) {
    res.status(403).json({ error: "Automated access is not allowed on this endpoint." });
    return;
  }

  next();
}
