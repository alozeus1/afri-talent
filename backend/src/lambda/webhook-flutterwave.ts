// ─────────────────────────────────────────────────────────────────────────────
// Lambda entry — Flutterwave webhooks
//
// Deployed behind a Lambda Function URL. The URL is configured in the
// Flutterwave dashboard as the webhook endpoint.
//
// Symmetric to webhook-stripe.ts — see that file for design rationale.
//
// Env contract (set by Terraform):
//   FLUTTERWAVE_SECRET_KEY    — from SSM SecureString
//   FLUTTERWAVE_SECRET_HASH   — from SSM SecureString (verif-hash header value)
//   DATABASE_URL              — RDS Proxy endpoint
//   FLUTTERWAVE_PLAN_CATALOG_JSON
//   NODE_ENV=production
// ─────────────────────────────────────────────────────────────────────────────

import express, { type Request, type Response, type NextFunction } from "express";
import serverlessHttp from "serverless-http";
import webhooksRouter from "../routes/webhooks.js";
import logger from "../lib/logger.js";

const app = express();

// Allow only POST /flutterwave on this Lambda.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "POST" || req.path !== "/flutterwave") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

// Flutterwave delivers JSON, not raw — but we let the existing router parse it
// via the same `parseRawJsonBody` helper it uses in the Express path. No body
// transformation needed.
app.use(express.json({ limit: "1mb" }));

app.use("/", webhooksRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: err.message }, "[lambda webhook-flutterwave] unhandled error");
  res.status(500).json({ error: "Internal error" });
});

export const handler = serverlessHttp(app);
