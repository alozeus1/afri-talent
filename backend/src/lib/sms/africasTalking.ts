/**
 * Africa's Talking SMS adapter.
 *
 * Phase 2 — near-zero-cost SMS for phone OTP + select security alerts.
 *
 * Behaviour:
 *   - When the SMS_ENABLED env flag is "false" we treat SMS as a no-op (delivery
 *     log row is still written with status SKIPPED so we keep an audit trail).
 *   - When AT_API_KEY/AT_USERNAME are missing we fall back to a structured logger
 *     entry instead of calling the network (dev-mode + tests).
 *   - When fully configured we POST to the Africa's Talking REST endpoint,
 *     normalise the response, persist a SmsDeliveryLog row, and return a
 *     stable result shape.
 *
 * The adapter is intentionally provider-agnostic at the call site; the
 * dispatcher only knows about `sendSms()` + `isSmsConfigured()`.
 */
import logger from "../logger.js";
import { prisma } from "../prisma.js";

export interface SendSmsParams {
  to: string;
  message: string;
  template: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SendSmsResult {
  delivered: boolean;
  status: "SENT" | "DELIVERED" | "FAILED" | "SKIPPED" | "QUEUED";
  providerMsgId?: string;
  errorCode?: string;
  errorMessage?: string;
  deliveryLogId?: string;
}

const PROVIDER = "africastalking";
const AT_ENDPOINT = "https://api.africastalking.com/version1/messaging";
const AT_SANDBOX_ENDPOINT = "https://api.sandbox.africastalking.com/version1/messaging";

function isKillSwitched(): boolean {
  const flag = (process.env.SMS_ENABLED ?? "true").trim().toLowerCase();
  return flag === "false" || flag === "0" || flag === "no";
}

export function isSmsConfigured(): boolean {
  if (isKillSwitched()) return false;
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}

async function logDelivery(
  params: SendSmsParams,
  status: SendSmsResult["status"],
  extra: Partial<{ providerMsgId: string; errorCode: string; errorMessage: string }>,
): Promise<string | undefined> {
  try {
    const row = await prisma.smsDeliveryLog.create({
      data: {
        userId: params.userId ?? null,
        phoneNumber: params.to,
        provider: PROVIDER,
        providerMsgId: extra.providerMsgId ?? null,
        template: params.template,
        status,
        errorCode: extra.errorCode ?? null,
        errorMessage: extra.errorMessage ?? null,
        metadata: (params.metadata as object | undefined) ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : "unknown", template: params.template },
      "[sms.africastalking] failed to persist delivery log",
    );
    return undefined;
  }
}

export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  if (isKillSwitched()) {
    const id = await logDelivery(params, "SKIPPED", {
      errorCode: "SMS_DISABLED",
      errorMessage: "SMS_ENABLED flag is false",
    });
    return { delivered: false, status: "SKIPPED", deliveryLogId: id, errorCode: "SMS_DISABLED" };
  }

  if (!isSmsConfigured()) {
    logger.info(
      {
        template: params.template,
        to: maskPhone(params.to),
        message: params.message,
        userId: params.userId,
      },
      "[sms.africastalking] dev-mode (no AT credentials) — message logged not sent",
    );
    const id = await logDelivery(params, "SKIPPED", {
      errorCode: "PROVIDER_UNCONFIGURED",
      errorMessage: "AT_API_KEY or AT_USERNAME missing",
    });
    return {
      delivered: false,
      status: "SKIPPED",
      deliveryLogId: id,
      errorCode: "PROVIDER_UNCONFIGURED",
    };
  }

  const apiKey = process.env.AT_API_KEY!;
  const username = process.env.AT_USERNAME!;
  const senderId = process.env.AT_SENDER_ID;
  const useSandbox = (process.env.AT_SANDBOX ?? "false").toLowerCase() === "true";
  const endpoint = useSandbox ? AT_SANDBOX_ENDPOINT : AT_ENDPOINT;

  const body = new URLSearchParams();
  body.set("username", username);
  body.set("to", params.to);
  body.set("message", params.message);
  if (senderId) body.set("from", senderId);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const errorCode = `HTTP_${response.status}`;
      const errorMessage = text.slice(0, 480) || response.statusText;
      logger.warn(
        { errorCode, template: params.template, to: maskPhone(params.to) },
        "[sms.africastalking] HTTP failure",
      );
      const id = await logDelivery(params, "FAILED", { errorCode, errorMessage });
      return {
        delivered: false,
        status: "FAILED",
        deliveryLogId: id,
        errorCode,
        errorMessage,
      };
    }

    const json = (await response.json()) as {
      SMSMessageData?: {
        Message?: string;
        Recipients?: Array<{
          status?: string;
          messageId?: string;
          number?: string;
          cost?: string;
        }>;
      };
    };

    const recipient = json.SMSMessageData?.Recipients?.[0];
    const recipientStatus = (recipient?.status ?? "").toLowerCase();
    const success = recipientStatus.includes("success") || recipientStatus.includes("sent");

    if (!success) {
      const errorCode = recipient?.status ?? "PROVIDER_REJECTED";
      const errorMessage = json.SMSMessageData?.Message ?? "Africa's Talking rejected the message";
      const id = await logDelivery(params, "FAILED", { errorCode, errorMessage });
      return {
        delivered: false,
        status: "FAILED",
        deliveryLogId: id,
        errorCode,
        errorMessage,
      };
    }

    const id = await logDelivery(params, "SENT", {
      providerMsgId: recipient?.messageId,
    });
    return {
      delivered: true,
      status: "SENT",
      providerMsgId: recipient?.messageId,
      deliveryLogId: id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "network_error";
    logger.warn(
      { template: params.template, to: maskPhone(params.to), errorMessage },
      "[sms.africastalking] send failed",
    );
    const id = await logDelivery(params, "FAILED", {
      errorCode: "NETWORK_ERROR",
      errorMessage,
    });
    return {
      delivered: false,
      status: "FAILED",
      deliveryLogId: id,
      errorCode: "NETWORK_ERROR",
      errorMessage,
    };
  }
}

export const __testing = { isKillSwitched, maskPhone };
