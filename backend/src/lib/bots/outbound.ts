// ─────────────────────────────────────────────────────────────────────────────
// Outbound bot messaging (WhatsApp / Telegram)
//
// The bot integration is bridge-based: an external bot service receives our
// POST and relays it to the chat platform, mirroring the inbound webhook in
// routes/bots.ts (same shared secret, opposite direction). This keeps Meta /
// Telegram credentials out of the backend entirely.
//
// Fully inert unless BOTH are set:
//   PHASE4_BOTS_ENABLED=1        — the existing bots feature flag
//   BOT_BRIDGE_OUTBOUND_URL      — where the bridge accepts outbound sends
// Failures are non-fatal: a chat message is never worth failing a digest run.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../prisma.js";
import logger from "../logger.js";

const log = logger.child({ lib: "bots-outbound" });

function isOutboundConfigured(): boolean {
  const flag = (process.env.PHASE4_BOTS_ENABLED ?? "").toLowerCase();
  const flagOn = flag === "1" || flag === "true" || flag === "yes" || flag === "on";
  return flagOn && Boolean(process.env.BOT_BRIDGE_OUTBOUND_URL);
}

export interface BotSendResult {
  attempted: number;
  delivered: number;
}

/**
 * Send a plain-text message to all of a user's verified, active bot
 * subscriptions that opted into job-match content. Returns delivery counts;
 * never throws.
 */
export async function sendBotJobDigest(userId: string, text: string): Promise<BotSendResult> {
  if (!isOutboundConfigured()) return { attempted: 0, delivered: 0 };

  const bridgeUrl = process.env.BOT_BRIDGE_OUTBOUND_URL as string;
  const secret = process.env.BOT_WEBHOOK_SECRET ?? "";

  let subscriptions;
  try {
    subscriptions = await prisma.botSubscription.findMany({
      where: { userId, status: "ACTIVE", isJobMatchesEnabled: true },
      select: { id: true, channel: true, chatHandle: true },
    });
  } catch (err) {
    log.warn({ err, userId }, "[bots] subscription lookup failed — skipping outbound send");
    return { attempted: 0, delivered: 0 };
  }

  let delivered = 0;
  for (const sub of subscriptions) {
    try {
      const resp = await fetch(bridgeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bot-webhook-secret": secret,
        },
        body: JSON.stringify({
          channel: sub.channel,
          chatHandle: sub.chatHandle,
          message: text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        log.warn(
          { status: resp.status, channel: sub.channel },
          "[bots] bridge rejected outbound message",
        );
        continue;
      }
      delivered += 1;
      await prisma.botSubscription
        .update({ where: { id: sub.id }, data: { lastNotifiedAt: new Date() } })
        .catch(() => undefined);
    } catch (err) {
      log.warn({ err, channel: sub.channel }, "[bots] outbound send failed — continuing");
    }
  }

  if (subscriptions.length > 0) {
    log.info(
      { userId, attempted: subscriptions.length, delivered },
      "[bots] outbound digest fan-out complete",
    );
  }
  return { attempted: subscriptions.length, delivered };
}
