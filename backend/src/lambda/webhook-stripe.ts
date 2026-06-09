// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry — Stripe webhooks
//
// Deployed behind a Lambda Function URL. The URL is configured in the Stripe
// dashboard as the webhook endpoint. The Function URL is invoke-mode = BUFFERED.
//
// Why a Lambda (vs the Express handler on Fargate):
//   - Webhook traffic is bursty; pay-per-event is far cheaper than a 24/7 task.
//   - Failure isolation: a bad webhook payload can't degrade the user-facing API.
//   - Independent IAM scope (only billing-related SSM params, no app secrets).
//
// The handler reuses the existing Express webhooks router unchanged via
// serverless-http. The router contains BOTH /stripe and /flutterwave routes;
// this Lambda's Function URL is configured to forward only requests with the
// path `/stripe`. Defensive 404 for any other path is below.
//
// Env contract (set by Terraform):
//   STRIPE_SECRET_KEY        — from SSM SecureString
//   STRIPE_WEBHOOK_SECRET    — from SSM SecureString
//   DATABASE_URL             — RDS Proxy endpoint
//   STRIPE_PRICE_CATALOG_JSON
//   NODE_ENV=production
//
// VPC: this Lambda runs inside the application VPC so it can reach RDS Proxy.
// ─────────────────────────────────────────────────────────────────────────────

import express, { type Request, type Response, type NextFunction } from "express";
import serverlessHttp from "serverless-http";
import webhooksRouter from "../routes/webhooks.js";
import logger from "../lib/logger.js";

const app = express();

// Allow only POST /stripe (defense in depth — Function URL itself doesn't
// restrict paths, and this Lambda must not accept Flutterwave traffic).
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST" || req.path !== "/stripe") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// Mount the existing webhook router at the root. The router itself defines
// `/stripe` and `/flutterwave`; the path filter above ensures only `/stripe`
// reaches the handler.
app.use("/", webhooksRouter);

// Fallthrough error handler — webhook handlers should never throw, but if one
// does we want a clean 500 not a Lambda crash.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message }, "[lambda webhook-stripe] unhandled error");
  res.status(500).json({ error: "Internal error" });
});

export const handler = serverlessHttp(app, {
  // Stripe HMAC verification REQUIRES the exact raw request bytes. Function URL
  // delivers binary bodies as base64 — decode into a Buffer that the route
  // handler can pass straight to stripe.webhooks.constructEvent.
  request(req: Request & { rawBody?: Buffer }, event: { body?: string; isBase64Encoded?: boolean }) {
    if (typeof event.body === "string") {
      const buf = event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
      req.rawBody = buf;
      // Replace the body with the buffer so existing handlers
      // (which call `getStripe().webhooks.constructEvent(req.body, ...)`)
      // get the bytes they need.
      req.body = buf;
    }
  },
});
