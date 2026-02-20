import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pinoHttpModule from "pino-http";
const pinoHttp = pinoHttpModule as unknown as typeof import("pino-http").default;
import prisma from "./lib/prisma.js";
import logger from "./lib/logger.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import {
  securityHeaders,
  generalLimiter,
  sanitizeRequest,
  orchestratorLimiter,
} from "./middleware/security.js";

import authRoutes from "./routes/auth.js";
import jobsRoutes from "./routes/jobs.js";
import applicationsRoutes from "./routes/applications.js";
import resourcesRoutes from "./routes/resources.js";
import adminRoutes from "./routes/admin.js";
import profileRoutes from "./routes/profile.js";
import filesRoutes from "./routes/files.js";
import billingRoutes from "./routes/billing.js";
import webhookRoutes from "./routes/webhooks.js";
import notificationsRoutes from "./routes/notifications.js";
import orchestratorRoutes from "./routes/orchestrator.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === "production";

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Structured logging with Pino
app.use(pinoHttp({ logger }));

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

const isAllowedOrigin = (origin?: string | null) => {
  if (!origin) {
    return !isProduction;
  }

  if (allowedOrigins.includes(origin)) {
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
  maxAge: 86400, // 24 hours
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
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({
      status: "error",
      db: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness check (for k8s readiness probes)
app.get("/ready", async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: "ready",
      checks: {
        database: "ok",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Readiness check failed");
    res.status(503).json({
      status: "not_ready",
      checks: {
        database: "failed",
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness check (for k8s liveness probes)
app.get("/live", (_req, res) => {
  res.json({
    status: "alive",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/notifications", notificationsRoutes);

// Orchestrator route needs a larger body limit (resume + raw job texts can be ~200 KB combined)
app.use(
  "/api/orchestrator",
  express.json({ limit: "250kb" }),
  orchestratorLimiter,
  orchestratorRoutes
);

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
  
  // Don't leak error details in production
  if (isProduction) {
    res.status(500).json({ error: "Internal server error", requestId: req.requestId });
  } else {
    res.status(500).json({ error: err.message, requestId: req.requestId });
  }
});

// Graceful shutdown
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Server started");
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed");
    process.exit(0);
  });
});
