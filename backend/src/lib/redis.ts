import { Redis } from "ioredis";
import logger from "./logger.js";

const REDIS_URL = process.env.REDIS_URL;
const BLOCKLIST_PREFIX = "blocklist:";

let client: InstanceType<typeof Redis> | null = null;
let available = false;

if (REDIS_URL) {
  client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  client.on("connect", () => {
    available = true;
    logger.info("[redis] connected — token revocation active");
  });

  client.on("error", (err: Error) => {
    if (available) {
      logger.warn({ err: err.message }, "[redis] connection lost — token revocation degraded");
    }
    available = false;
  });

  client.connect().catch((err: Error) => {
    logger.warn({ err: err.message }, "[redis] initial connect failed — token revocation degraded");
  });
} else {
  logger.warn("[redis] REDIS_URL not set — token revocation disabled");
}

/**
 * §2.4 — when `REDIS_REQUIRED=true`, treat Redis unavailability as a hard
 * failure (token rejection / readiness 503) rather than the legacy fail-open
 * behaviour. Defaults to false so existing deployments are unaffected until
 * the founder flips the flag in SSM post-ElastiCache provisioning.
 *
 * Read at call-time so tests can flip the env var per case without reloading
 * the module.
 */
export function isRedisRequired(): boolean {
  return process.env.REDIS_REQUIRED === "true";
}

/**
 * Add a JWT to the blocklist until it naturally expires.
 * No-op if Redis is unavailable (graceful degradation).
 */
export async function blockToken(token: string, ttlSeconds: number): Promise<void> {
  if (!client || !available || ttlSeconds <= 0) return;
  try {
    await client.set(`${BLOCKLIST_PREFIX}${token}`, "1", "EX", ttlSeconds);
  } catch {
    // graceful degradation — do not crash
  }
}

/**
 * Check if a JWT has been blocklisted.
 *
 * §2.4 — behaviour depends on `REDIS_REQUIRED`:
 *  - `REDIS_REQUIRED=true` and Redis unavailable/erroring → returns `true`
 *    (fail-closed: callers treat the token as revoked and reject the request).
 *  - Otherwise → returns `false` (fail-open: legacy behaviour, preserves
 *    availability when Redis is genuinely optional).
 */
export async function isTokenBlocked(token: string): Promise<boolean> {
  if (!client || !available) {
    if (isRedisRequired()) {
      logger.warn(
        "[redis] fail-closed: rejecting token because Redis is unavailable and REDIS_REQUIRED=true",
      );
      return true;
    }
    return false;
  }
  try {
    const result = await client.get(`${BLOCKLIST_PREFIX}${token}`);
    return result !== null;
  } catch (err) {
    if (isRedisRequired()) {
      logger.warn(
        { err: (err as Error).message },
        "[redis] fail-closed: rejecting token because Redis query failed and REDIS_REQUIRED=true",
      );
      return true;
    }
    return false;
  }
}

export function isRedisConfigured(): boolean {
  return Boolean(REDIS_URL);
}

export function isRedisAvailable(): boolean {
  return available;
}

export async function redisHealthStatus(): Promise<"connected" | "degraded" | "not_configured"> {
  if (!REDIS_URL) {
    return "not_configured";
  }

  if (!client || !available) {
    return "degraded";
  }

  try {
    await client.ping();
    return "connected";
  } catch {
    return "degraded";
  }
}

export { client as redisClient };
