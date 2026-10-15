// ─────────────────────────────────────────────────────────────────────────────
// Customer support — ticket helpers, outbound notifications and n8n hand-off.
//
// Everything here that talks to the outside world (SES, n8n) is best-effort:
// a support submission must never fail or stall because email or automation
// is down. Callers fire these with `void` and the helpers swallow + log.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { SupportTicket } from "@prisma/client";
import logger from "../logger.js";
import { sendEmail } from "../email.js";
import { recordOpsEvent } from "../ops/events.js";
import { signBody } from "../notifications/approvalWebhook.js";

// Crockford-ish alphabet without look-alikes (0/O, 1/I/L) so a customer can
// read the reference out over the phone.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateTicketReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `AT-${out}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br/>");
}

function frontendUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export const TOPIC_LABELS: Record<string, string> = {
  GENERAL: "General question",
  ACCOUNT: "Account & sign-in",
  JOBS: "Jobs & applications",
  EMPLOYER: "Employers & hiring",
  TRUST_SAFETY: "Trust & safety",
  TECHNICAL: "Technical problem",
  FEEDBACK: "Product feedback",
  PARTNERSHIP: "Partnerships & press",
  PRIVACY: "Privacy & data",
  OTHER: "Something else",
};

type TicketForNotify = Pick<
  SupportTicket,
  "id" | "reference" | "name" | "email" | "topic" | "subject" | "message" | "priority" | "userId" | "userRole" | "locale" | "createdAt"
>;

const FOOTER = `<p style="color:#6b7280;font-size:12px;">AfriTalent — Connecting African professionals to global opportunities</p>`;

/** Acknowledgement to the person who opened the ticket. Never throws. */
export async function sendTicketAcknowledgement(ticket: TicketForNotify): Promise<void> {
  try {
    const topic = TOPIC_LABELS[ticket.topic] ?? ticket.topic;
    await sendEmail({
      to: ticket.email,
      subject: `We received your message [${ticket.reference}]`,
      templateName: "support_ack",
      html: `
        <h2>Hi ${escapeHtml(ticket.name)},</h2>
        <p>Thanks for contacting AfriTalent. A member of our team will reply to this address, usually within one business day.</p>
        <p><strong>Reference:</strong> ${escapeHtml(ticket.reference)}<br/><strong>Topic:</strong> ${escapeHtml(topic)}</p>
        <blockquote style="border-left:3px solid #059669;margin:0;padding:8px 12px;color:#374151;">${nl2br(ticket.message)}</blockquote>
        <p>If you need to add details, just reply to this email and keep the reference in the subject line.</p>
        ${FOOTER}
      `,
      text: `Hi ${ticket.name},\n\nThanks for contacting AfriTalent. A member of our team will reply to this address, usually within one business day.\n\nReference: ${ticket.reference}\nTopic: ${topic}\n\nYour message:\n${ticket.message}\n`,
    });
  } catch (error) {
    logger.warn({ err: String(error), ticketId: ticket.id }, "[support] acknowledgement email failed (non-fatal)");
  }
}

/** Internal alert to the support inbox. No-op (logged) when SUPPORT_ADMIN_EMAIL is unset. */
export async function sendTicketAdminNotification(ticket: TicketForNotify): Promise<void> {
  const to = process.env.SUPPORT_ADMIN_EMAIL?.trim();
  if (!to) {
    logger.info({ ticketId: ticket.id }, "[support] SUPPORT_ADMIN_EMAIL not set — admin notification skipped");
    return;
  }
  try {
    const topic = TOPIC_LABELS[ticket.topic] ?? ticket.topic;
    const link = `${frontendUrl()}/admin/support?ticket=${encodeURIComponent(ticket.id)}`;
    await sendEmail({
      to,
      subject: `[Support ${ticket.reference}] ${topic}${ticket.subject ? ` — ${ticket.subject}` : ""}`,
      templateName: "support_admin_alert",
      html: `
        <h2>New support ticket ${escapeHtml(ticket.reference)}</h2>
        <p><strong>From:</strong> ${escapeHtml(ticket.name)} &lt;${escapeHtml(ticket.email)}&gt;${ticket.userRole ? ` (${escapeHtml(ticket.userRole)})` : " (guest)"}<br/>
        <strong>Topic:</strong> ${escapeHtml(topic)}<br/>
        <strong>Priority:</strong> ${escapeHtml(ticket.priority)}</p>
        <blockquote style="border-left:3px solid #059669;margin:0;padding:8px 12px;color:#374151;">${nl2br(ticket.message)}</blockquote>
        <p><a href="${escapeHtml(link)}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Open in admin</a></p>
      `,
      text: `New support ticket ${ticket.reference}\nFrom: ${ticket.name} <${ticket.email}>\nTopic: ${topic}\nPriority: ${ticket.priority}\n\n${ticket.message}\n\n${link}`,
    });
  } catch (error) {
    logger.warn({ err: String(error), ticketId: ticket.id }, "[support] admin notification email failed (non-fatal)");
  }
}

/** Staff reply to the customer. Returns whether delivery was attempted successfully. */
export async function sendTicketReplyEmail(
  ticket: Pick<SupportTicket, "id" | "reference" | "name" | "email">,
  body: string,
): Promise<boolean> {
  try {
    await sendEmail({
      to: ticket.email,
      subject: `Re: your AfriTalent support request [${ticket.reference}]`,
      templateName: "support_reply",
      html: `
        <h2>Hi ${escapeHtml(ticket.name)},</h2>
        <div style="color:#111827;">${nl2br(body)}</div>
        <p style="color:#6b7280;">Reference: ${escapeHtml(ticket.reference)}</p>
        ${FOOTER}
      `,
      text: `Hi ${ticket.name},\n\n${body}\n\nReference: ${ticket.reference}`,
    });
    return Boolean(process.env.SES_FROM_EMAIL?.trim());
  } catch (error) {
    logger.warn({ err: String(error), ticketId: ticket.id }, "[support] reply email failed");
    return false;
  }
}

// ── n8n hand-off ─────────────────────────────────────────────────────────────

export type SupportWebhookEvent = "support.ticket_created" | "support.ticket_updated" | "support.ticket_replied";

type WebhookConfig = { url: string; hmacSecret: string | null; jwtSecret: string | null };

/** Read at call time so tests and secret rotation behave. */
function readWebhookConfig(): WebhookConfig | null {
  const url = process.env.N8N_SUPPORT_WEBHOOK_URL?.trim();
  if (!url) return null;
  const hmacSecret = process.env.N8N_SUPPORT_HMAC_SECRET?.trim() || null;
  const jwtSecret = process.env.N8N_WEBHOOK_SECRET?.trim() || null;
  if (!hmacSecret && !jwtSecret) {
    logger.warn(
      "[support] N8N_SUPPORT_WEBHOOK_URL set without N8N_WEBHOOK_SECRET or N8N_SUPPORT_HMAC_SECRET — webhook disabled",
    );
    return null;
  }
  return { url, hmacSecret, jwtSecret };
}

/**
 * Flat fields expected by the n8n "Route AfriTalent support and review events"
 * workflow (docs/n8n/README.md). Only ticket creation has an n8n contract.
 */
function n8nContractFields(event: SupportWebhookEvent, data: Record<string, unknown>): Record<string, unknown> {
  if (event !== "support.ticket_created") return { kind: event.replace("support.", "support_") };
  return {
    kind: "support_ticket_created",
    ticketId: data.id,
    reference: data.reference,
    category: typeof data.topic === "string" ? data.topic.toLowerCase() : undefined,
    subject: data.subject,
    message: data.messagePreview,
    name: data.name,
    email: data.email,
    locale: data.locale,
    role: data.userRole ?? null,
    adminUrl: data.adminUrl,
    // The backend sends its own localized acknowledgement when SES is configured.
    ackRequested: !process.env.SES_FROM_EMAIL?.trim(),
    createdAt: data.createdAt,
  };
}

/**
 * POST a signed event to the optional n8n support workflow.
 *
 * Auth (at least one is configured, never unsigned):
 * - N8N_WEBHOOK_SECRET: `Authorization: Bearer <HS256 JWT, 60s expiry>`, checked
 *   by the n8n Webhook node's JWT Auth credential. In JWT-only mode only
 *   support.ticket_created is sent (the n8n workflow 400s other kinds).
 * - N8N_SUPPORT_HMAC_SECRET: x-afritalent-event, x-afritalent-timestamp (unix
 *   seconds) and x-afritalent-signature = hex HMAC-SHA256(secret,
 *   `${timestamp}.${rawBody}`). The receiver must recompute over the raw body
 *   and reject stale timestamps.
 * Never throws; 5s timeout.
 */
export async function emitSupportWebhook(
  event: SupportWebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const cfg = readWebhookConfig();
  if (!cfg) return;
  if (!cfg.hmacSecret && event !== "support.ticket_created") return;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({ ...n8nContractFields(event, data), event, emittedAt: new Date().toISOString(), data });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-afritalent-event": event,
    "x-afritalent-timestamp": timestamp,
  };
  if (cfg.hmacSecret) headers["x-afritalent-signature"] = signBody(`${timestamp}.${rawBody}`, cfg.hmacSecret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    if (cfg.jwtSecret) {
      const kind = event.replace("support.", "support_");
      headers.authorization = `Bearer ${jwt.sign({ iss: "afritalent-backend", kind }, cfg.jwtSecret, {
        algorithm: "HS256",
        expiresIn: 60,
      })}`;
    }
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`n8n responded ${res.status}`);
    recordOpsEvent({ metricName: "n8n_support_emitted", category: "notifications", details: { event } });
  } catch (err) {
    logger.warn({ err: String(err), event }, "[support] n8n webhook emit failed (non-fatal)");
    recordOpsEvent({
      metricName: "n8n_support_emit_failed",
      category: "notifications",
      outcome: "failure",
      severity: "warning",
      details: { event },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** PII-light payload for automation: no internal notes, message truncated. */
export function ticketWebhookPayload(ticket: TicketForNotify & { status?: string }): Record<string, unknown> {
  return {
    id: ticket.id,
    reference: ticket.reference,
    topic: ticket.topic,
    priority: ticket.priority,
    status: ticket.status ?? "OPEN",
    name: ticket.name,
    email: ticket.email,
    subject: ticket.subject,
    messagePreview: ticket.message.slice(0, 500),
    isRegisteredUser: Boolean(ticket.userId),
    userRole: ticket.userRole,
    locale: ticket.locale,
    createdAt: ticket.createdAt,
    adminUrl: `${frontendUrl()}/admin/support?ticket=${encodeURIComponent(ticket.id)}`,
  };
}

export const __testing = { readWebhookConfig };
