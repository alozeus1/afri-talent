// ─────────────────────────────────────────────────────────────────────────────
// n8n approval broker — inbound callback
//
// The self-hosted n8n workflow calls this route when the operator clicks
// "Deny" in an approval email. Auth is the signed, expiring, single-use decision
// token minted by the emitter (approvalWebhook.ts) — no admin JWT, no TOTP,
// because DENY only blocks a pending sensitive action and never executes one.
//
// Approve is deliberately NOT handled here: granting a sensitive action stays
// behind the platform's TOTP gate (adminTotpGate on /api/admin). The email's
// approve path is a deep link into the admin console, not this endpoint.
//
// Mounted under /api/webhooks/n8n with express.raw — the body arrives as a
// Buffer (see app.ts), so we parse it defensively here.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { recordOpsEvent } from "../lib/ops/events.js";
import {
  verifyDecisionToken,
  consumeDecisionTokenOnce,
  gateMetaFor,
} from "../lib/notifications/approvalWebhook.js";

const router = Router();

const DECISION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 3;

function parseRawJsonBody(req: Request): Record<string, unknown> | null {
  if (!req.body) return null;
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof req.body === "object") return req.body as Record<string, unknown>;
  return null;
}

// POST /api/webhooks/n8n/approval — one-click deny from an approval email
router.post("/approval", async (req: Request, res: Response) => {
  const secret = process.env.N8N_APPROVAL_HMAC_SECRET?.trim();
  if (!secret) {
    // Feature not configured — refuse rather than accept unauthenticated writes.
    res.status(503).json({ error: "n8n approval callback not configured" });
    return;
  }

  const body = parseRawJsonBody(req);
  const token = typeof body?.token === "string" ? body.token : "";
  const reason =
    typeof body?.reason === "string" ? body.reason.slice(0, 500) : "denied via n8n approval email";

  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const verified = verifyDecisionToken(token, secret, nowSeconds);
  if (!verified.ok || !verified.claims) {
    recordOpsEvent({
      metricName: "n8n_approval_callback_rejected",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: { reason: verified.reason ?? "invalid" },
    });
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const { graphRunId, action } = verified.claims;

  // The token only ever authorizes a deny. Defensive: reject anything else.
  if (action !== "deny") {
    res.status(403).json({ error: "This token cannot approve. Approve in the admin console." });
    return;
  }

  // Single-use (best-effort; deny is idempotent so failing open is safe).
  const first = await consumeDecisionTokenOnce(graphRunId, DECISION_TOKEN_TTL_SECONDS);
  if (!first) {
    res.status(200).json({ status: "already_processed", graphRunId });
    return;
  }

  const run = await prisma.graphRun.findUnique({ where: { graphRunId } });
  if (!run) {
    res.status(404).json({ error: "Unknown graph run" });
    return;
  }

  try {
    // Persist DENIED. This is a hard terminal decision: every graph resume path
    // calls assertGraphRunNotDenied() and refuses to resume a DENIED run, so a
    // later console/user approval can never drive the paused checkpoint into a
    // sensitive side effect (publish/send/verify) after an email deny.
    await prisma.graphRun.update({
      where: { graphRunId },
      data: { approvalState: "DENIED", status: "BLOCKED" },
    });
    await prisma.graphRunEvent.create({
      data: {
        graphRunId,
        type: "human_approval_denied",
        node: "n8n_callback",
        details: { source: "n8n_email", reason },
      },
    });
  } catch (err) {
    logger.error({ err: String(err), graph_run_id: graphRunId }, "[n8n] deny persist failed");
    res.status(500).json({ error: "Failed to record denial" });
    return;
  }

  const meta = gateMetaFor(run.workflowType);
  recordOpsEvent({
    metricName: "n8n_approval_denied",
    category: "notifications",
    details: { workflow_type: run.workflowType, action: meta.sensitiveAction },
  });
  logger.info(
    { graph_run_id: graphRunId, workflow_type: run.workflowType },
    "[n8n] approval denied via email callback",
  );

  res.status(200).json({
    status: "denied",
    graphRunId,
    workflowType: run.workflowType,
    sensitiveAction: meta.sensitiveAction,
  });
});

export default router;
