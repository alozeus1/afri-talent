import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pinoHttpModule from "pino-http";
const pinoHttp = pinoHttpModule as unknown as typeof import("pino-http").default;
import prisma from "./lib/prisma.js";
import logger from "./lib/logger.js";
import { initSentry, setupExpressErrorHandler } from "./lib/sentry.js";
import { redisHealthStatus } from "./lib/redis.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import {
  securityHeaders,
  generalLimiter,
  sanitizeRequest,
  orchestratorLimiter,
} from "./middleware/security.js";

import authRoutes from "./routes/auth.js";
import passwordResetRoutes from "./routes/password-reset.js";
import jobsRoutes from "./routes/jobs.js";
import applicationsRoutes from "./routes/applications.js";
import resourcesRoutes from "./routes/resources.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import filesRoutes from "./routes/files.js";
import billingRoutes from "./routes/billing.js";
import webhookRoutes from "./routes/webhooks.js";
import notificationsRoutes from "./routes/notifications.js";
import messagesRoutes from "./routes/messages.js";
import orchestratorRoutes from "./routes/orchestrator.js";
import aggregatorRoutes from "./routes/aggregator.js";
import savedSearchesRoutes from "./routes/saved-searches.js";
import companiesRoutes from "./routes/companies.js";
import talentRoutes from "./routes/talent.js";
import employerAnalyticsRoutes from "./routes/employer-analytics.js";
import quickApplyRoutes from "./routes/quick-apply.js";
import skillsAssessmentsRoutes from "./routes/skills-assessments.js";
import salaryReportsRoutes from "./routes/salary-reports.js";
import interviewExperiencesRoutes from "./routes/interview-experiences.js";
import immigrationRoutes from "./routes/immigration.js";
import referralsRoutes from "./routes/referrals.js";
import learningRoutes from "./routes/learning.js";
import calendarRoutes from "./routes/calendar.js";
import candidateAnalyticsRoutes from "./routes/candidate-analytics.js";
import jobExtractRoutes from "./routes/job-extract.js";
import autopilotRoutes from "./routes/autopilot.js";
import chatRoutes from "./routes/chat.js";
import chatConsentRoutes from "./routes/chat-consent.js";
import pricingRoutes from "./routes/pricing.js";
import oauthRoutes from "./routes/oauth.js";
import emailVerificationRoutes from "./routes/email-verification.js";
import publicRoutes from "./routes/public.js";
import resumeParserRoutes from "./routes/resume-parser.js";
import pushRoutes from "./routes/push.js";
import preferencesRoutes from "./routes/preferences.js";
import atsRoutes from "./routes/ats.js";
import mockInterviewsRoutes from "./routes/mock-interviews.js";
import analyticsEventsRoutes from "./routes/analytics-events.js";
import socialRoutes from "./routes/social.js";
import salaryNegotiationRoutes from "./routes/salary-negotiation.js";
import universityPartnersRoutes from "./routes/university-partners.js";
import employerAiRoutes from "./routes/employer-ai.js";
import botsRoutes from "./routes/bots.js";
import trustRoutes from "./routes/trust.js";
import adminTrustRoutes from "./routes/admin-trust.js";
import { swaggerSpec } from "./lib/swagger.js";

dotenv.config({ quiet: true });
initSentry();

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";
const docsEnabled = process.env.ENABLE_API_DOCS === "true" || !isProduction;
const serviceMetadata = {
  service: "afritalent-backend",
  environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  release: process.env.RELEASE_VERSION || process.env.IMAGE_TAG || "local",
  commitSha:
    process.env.GITHUB_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.RENDER_GIT_COMMIT
    || "unknown",
};

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Structured logging with Pino (suppress in tests to keep output clean)
if (!isTest) {
  app.use(pinoHttp({ logger }));
}

// Security: Helmet headers
app.use(securityHeaders);

// Security: Trust proxy (required for rate limiting behind reverse proxy)
if (isProduction) {
  app.set("trust proxy", 1);
}

// Security: CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3100",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3100",
];
const allowedOriginRegex = process.env.ALLOWED_ORIGIN_REGEX
  ? new RegExp(process.env.ALLOWED_ORIGIN_REGEX)
  : null;

const isAllowedOrigin = (origin?: string | null) => {
  if (!origin) {
    // Non-browser callers such as App Runner health checks won't send Origin.
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  if (allowedOriginRegex?.test(origin)) {
    return true;
  }
  if (!isProduction) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));

// Security: Rate limiting (general)
app.use(generalLimiter);

// Stripe webhook — MUST be registered BEFORE express.json().
// Stripe signature verification requires the raw request body bytes.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

// Body parsing with size limits (all other routes)
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Security: Request sanitization
app.use(sanitizeRequest);

// Health check endpoint (for load balancers, k8s probes)
const healthHandler = async (_req: express.Request, res: express.Response) => {
  // Skip DB check in test environment — no DB required to run tests
  if (isTest) {
    res.json({
      status: "ok",
      ...serviceMetadata,
      checks: {
        database: "skipped-in-test",
        redis: "skipped-in-test",
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = await redisHealthStatus();
    res.json({
      status: redis === "connected" || redis === "not_configured" ? "ok" : "degraded",
      ...serviceMetadata,
      checks: {
        database: "connected",
        redis,
      },
      degraded: redis === "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    const redis = await redisHealthStatus();
    res.status(500).json({
      status: "error",
      ...serviceMetadata,
      checks: {
        database: "disconnected",
        redis,
      },
      degraded: redis === "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Readiness check (for k8s readiness probes)
const readyHandler = async (_req: express.Request, res: express.Response) => {
  // Skip DB check in test environment
  if (isTest) {
    res.json({
      status: "ready",
      ...serviceMetadata,
      checks: {
        database: "skipped-in-test",
        redis: "skipped-in-test",
      },
      degraded: false,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = await redisHealthStatus();
    res.json({
      status: "ready",
      ...serviceMetadata,
      checks: {
        database: "ok",
        redis,
      },
      degraded: redis === "degraded",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Readiness check failed");
    const redis = await redisHealthStatus();
    res.status(503).json({
      status: "not_ready",
      ...serviceMetadata,
      checks: {
        database: "failed",
        redis,
      },
      degraded: redis === "degraded",
      timestamp: new Date().toISOString(),
    });
  }
};

app.get("/ready", readyHandler);
app.get("/api/ready", readyHandler);

// Liveness check (for k8s liveness probes)
const liveHandler = (_req: express.Request, res: express.Response) => {
  res.json({
    status: "alive",
    ...serviceMetadata,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

app.get("/live", liveHandler);
app.get("/api/live", liveHandler);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/aggregator", aggregatorRoutes);
app.use("/api/saved-searches", savedSearchesRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/talent", talentRoutes);
app.use("/api/employer", employerAnalyticsRoutes);
app.use("/api/quick-apply", quickApplyRoutes);
app.use("/api/skills-assessments", skillsAssessmentsRoutes);
app.use("/api/salary-reports", salaryReportsRoutes);
app.use("/api/interview-experiences", interviewExperiencesRoutes);
app.use("/api/immigration", immigrationRoutes);
app.use("/api/referrals", referralsRoutes);
app.use("/api/learning", learningRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/candidate-analytics", candidateAnalyticsRoutes);
app.use("/api/job-extract", jobExtractRoutes);
app.use("/api/autopilot", autopilotRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/chat/consent", chatConsentRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/auth/oauth", oauthRoutes);
app.use("/api/auth/email", emailVerificationRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/profile/resume-parser", resumeParserRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/ats", atsRoutes);
app.use("/api/mock-interviews", mockInterviewsRoutes);
app.use("/api/analytics", analyticsEventsRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/salary-negotiation", salaryNegotiationRoutes);
app.use("/api/university-partners", universityPartnersRoutes);
app.use("/api/employer/ai", employerAiRoutes);
app.use("/api/trust", trustRoutes);
app.use("/api/admin/trust", adminTrustRoutes);
app.use("/api/bots", botsRoutes);

// OpenAPI/Swagger docs
app.get("/api/docs/spec.json", (_req, res) => {
  if (!docsEnabled) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(swaggerSpec);
});

// Serve Swagger UI dynamically (avoid bundling UI assets)
app.get("/api/docs", async (_req, res) => {
  if (!docsEnabled) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const html = `<!DOCTYPE html>
<html><head>
  <title>AfriTalent API Docs</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head><body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/spec.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
    });
  </script>
</body></html>`;
  res.type("html").send(html);
});

// Orchestrator route needs a larger body limit (resume + raw job texts can be ~200 KB combined)
app.use(
  "/api/orchestrator",
  express.json({ limit: "250kb" }),
  orchestratorLimiter,
  orchestratorRoutes
);

// Sentry error handler (must be before any other error middleware and after all controllers)
setupExpressErrorHandler(app);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({
    err,
    requestId: req.requestId,
    method: req.method,
    url: req.url,
  }, "Unhandled error");

  if (isProduction) {
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  } else {
    res.status(500).json({ error: err.message, requestId: req.requestId });
  }
});

export default app;
