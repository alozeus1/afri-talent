import { Redis } from "ioredis";
import logger from "./logger.js";
const REDIS_URL = process.env.REDIS_URL;
const BLOCKLIST_PREFIX = "blocklist:";
let client = null;
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
    client.on("error", (err) => {
        if (available) {
            logger.warn({ err: err.message }, "[redis] connection lost — token revocation degraded");
        }
        available = false;
    });
    client.connect().catch((err) => {
        logger.warn({ err: err.message }, "[redis] initial connect failed — token revocation degraded");
    });
}
else {
    logger.warn("[redis] REDIS_URL not set — token revocation disabled");
}
/**
 * Add a JWT to the blocklist until it naturally expires.
 * No-op if Redis is unavailable (graceful degradation).
 */
export async function blockToken(token, ttlSeconds) {
    if (!client || !available || ttlSeconds <= 0)
        return;
    try {
        await client.set(`${BLOCKLIST_PREFIX}${token}`, "1", "EX", ttlSeconds);
    }
    catch {
        // graceful degradation — do not crash
    }
}
/**
 * Check if a JWT has been blocklisted.
 * Returns false if Redis is unavailable (fail-open).
 */
export async function isTokenBlocked(token) {
    if (!client || !available)
        return false;
    try {
        const result = await client.get(`${BLOCKLIST_PREFIX}${token}`);
        return result !== null;
    }
    catch {
        return false; // fail-open on Redis error
    }
}
export { client as redisClient };
//# sourceMappingURL=redis.js.map