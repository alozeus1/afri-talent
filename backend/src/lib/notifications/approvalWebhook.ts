// ─────────────────────────────────────────────────────────────────────────────
// n8n approval broker — outbound emitter + signed decision tokens
//
// When a LangGraph run pauses for a human approval gate (approvalState becomes
// REQUESTED), we notify a self-hosted n8n workflow so the operator gets an email
// with full context. The email offers:
//   - a DEEP LINK into the admin console for the actual approval, which stays
//     behind the platform's TOTP gate (adminTotpGate on /api/admin). n8n never
//     grants a sensitive action itself.
//   - a one-click DENY, which is always safe: denying blocks the pending action
//     and never executes a sensitive side effect. That is what the signed
//     decision token below authorizes on the callback route.
//
// All sends are best-effort and non-fatal: the approval audit layer must never
// break a workflow (mirrors prismaTools.ts). Secrets come from env, never args.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import logger from "../logger.js";
import { recordOpsEvent } from "../ops/events.js";
import { redisClient } from "../redis.js";
import type { WorkflowType } from "../ai/langgraph/state/schemas.js";

/** The only decision n8n may drive without human TOTP: block the pending action. */
export type OneClickDecision = "deny";

const DECISION_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days to act from the inbox

interface ApprovalWebhookConfig {
  url: string;
  secret: string;
  adminUrl: string;
}

/** Read config at call time (not module load) so tests and rotation behave. */
function readConfig(): ApprovalWebhookConfig | null {
  const url = process.env.N8N_APPROVAL_WEBHOOK_URL?.trim();
  const secret = process.env.N8N_APPROVAL_HMAC_SECRET?.trim();
  if (!url || !secret) {
    return null; // feature disabled until both are set — silent no-op
  }
  const adminUrl =
    process.env.APP_ADMIN_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    "http://localhost:3000";
  return { url, secret, adminUrl };
}

// ── Human-gate taxonomy ──────────────────────────────────────────────────────
// Maps the graph workflow type to the sensitive action it is gating and where
// the operator completes the (TOTP-protected) approval in the admin console.

interface GateMeta {
  sensitiveAction: string;
  riskTier: "HIGH" | "LOW";
  /** Console path (relative to adminUrl) where the real approval is completed. */
  consolePath: string;
}

const GATE_META: Partial<Record<WorkflowType, GateMeta>> = {
  employer_verification: {
    sensitiveAction: "approve_high_risk_employer",
    riskTier: "HIGH",
    consolePath: "/admin/trust/employers",
  },
  candidate_verification: {
    sensitiveAction: "verify_sensitive_document",
    riskTier: "HIGH",
    consolePath: "/admin/trust/artifacts",
  },
  trust_moderation: {
    sensitiveAction: "resolve_high_risk_trust_event",
    riskTier: "HIGH",
    consolePath: "/admin/trust/cases",
  },
  blog_automation: {
    sensitiveAction: "publish_blog",
    riskTier: "HIGH",
    consolePath: "/admin/blog",
  },
  candidate_autopilot: {
    sensitiveAction: "send_application",
    riskTier: "HIGH",
    consolePath: "/admin/autopilot",
  },
  follow_up: {
    sensitiveAction: "send_employer_email",
    riskTier: "HIGH",
    consolePath: "/admin/autopilot",
  },
  billing_recovery: {
    sensitiveAction: "manual_billing_change",
    riskTier: "HIGH",
    consolePath: "/admin/billing",
  },
};

const FALLBACK_META: GateMeta = {
  sensitiveAction: "human_approval",
  riskTier: "HIGH",
  consolePath: "/admin",
};

export function gateMetaFor(workflowType: string): GateMeta {
  return GATE_META[workflowType as WorkflowType] ?? FALLBACK_META;
}

// ── Signing helpers ──────────────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** HMAC-SHA256 of a raw string body, hex. Used for the outbound body signature. */
export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Constant-time compare of two hex signatures. */
export function verifyBodySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = signBody(rawBody, secret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface DecisionTokenClaims {
  graphRunId: string;
  action: OneClickDecision;
  exp: number; // unix seconds
  jti?: string;
}

/**
 * Mint a signed, expiring token that authorizes exactly one deny for one run.
 * Format: base64url(claimsJson).base64url(hmac). Single-use is enforced on the
 * callback via Redis (best-effort — deny is idempotent, so this is defense in
 * depth rather than a correctness requirement).
 */
export function mintDecisionToken(
  graphRunId: string,
  action: OneClickDecision,
  secret: string,
  nowSeconds: number,
): string {
  const claims: DecisionTokenClaims = {
    graphRunId,
    action,
    exp: nowSeconds + DECISION_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const body = base64url(JSON.stringify(claims));
  const sig = base64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export interface VerifiedToken {
  ok: boolean;
  reason?: "malformed" | "bad_signature" | "expired";
  claims?: DecisionTokenClaims;
}

export function verifyDecisionToken(token: string, secret: string, nowSeconds: number): VerifiedToken {
  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expectedSig = base64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  let claims: DecisionTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DecisionTokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.exp !== "number" || claims.exp < nowSeconds) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims };
}

/**
 * Consume a token id once. Returns true if this is the first use (proceed),
 * false if already consumed. Fails OPEN when Redis is unavailable — deny is
 * idempotent, so re-processing a deny is harmless.
 */
export async function consumeDecisionTokenOnce(graphRunId: string, ttlSeconds: number): Promise<boolean> {
  if (!redisClient) return true;
  try {
    const res = await redisClient.set(`n8n:approval:used:${graphRunId}`, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  } catch {
    return true;
  }
}

// ── Emitter ──────────────────────────────────────────────────────────────────

export interface ApprovalGraphRunSnapshot {
  graphRunId: string;
  workflowType: string;
  userId?: string | null;
  candidateId?: string | null;
  employerId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  riskFlags?: unknown;
  currentStep?: string | null;
}

/**
 * Notify n8n that a run is awaiting human approval. Best-effort and non-fatal.
 * No-ops silently when the feature is unconfigured. PII-free payload (ids only),
 * matching the GraphRun audit table's own privacy stance.
 */
export async function emitApprovalRequested(run: ApprovalGraphRunSnapshot, nowSeconds: number): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;

  const meta = gateMetaFor(run.workflowType);
  const denyToken = mintDecisionToken(run.graphRunId, "deny", cfg.secret, nowSeconds);
  const approveDeepLink = `${cfg.adminUrl}${meta.consolePath}?graphRun=${encodeURIComponent(run.graphRunId)}`;

  const payload = {
    kind: "approval_requested" as const,
    graphRunId: run.graphRunId,
    workflowType: run.workflowType,
    sensitiveAction: meta.sensitiveAction,
    riskTier: meta.riskTier,
    subject: {
      userId: run.userId ?? null,
      candidateId: run.candidateId ?? null,
      employerId: run.employerId ?? null,
      jobId: run.jobId ?? null,
      applicationId: run.applicationId ?? null,
    },
    riskFlags: run.riskFlags ?? null,
    currentStep: run.currentStep ?? null,
    // How the operator acts:
    approveDeepLink, // completes the real, TOTP-gated approval in the console
    denyToken, // authorizes a one-click deny on the callback route
    emittedAt: new Date(nowSeconds * 1000).toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const signature = signBody(rawBody, cfg.secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-afritalent-signature": signature,
        "x-afritalent-event": "approval_requested",
      },
      body: rawBody,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`n8n responded ${res.status}`);
    }
    recordOpsEvent({
      metricName: "n8n_approval_emitted",
      category: "notifications",
      details: { workflow_type: run.workflowType, risk_tier: meta.riskTier, action: meta.sensitiveAction },
    });
  } catch (err) {
    logger.warn(
      { err: String(err), graph_run_id: run.graphRunId, workflow_type: run.workflowType },
      "[n8n] approval webhook emit failed (non-fatal)",
    );
    recordOpsEvent({
      metricName: "n8n_approval_emit_failed",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: { workflow_type: run.workflowType },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const __testing = { DECISION_TOKEN_TTL_SECONDS, readConfig };
