import { Redis } from "ioredis";
declare let client: InstanceType<typeof Redis> | null;
/**
 * Add a JWT to the blocklist until it naturally expires.
 * No-op if Redis is unavailable (graceful degradation).
 */
export declare function blockToken(token: string, ttlSeconds: number): Promise<void>;
/**
 * Check if a JWT has been blocklisted.
 * Returns false if Redis is unavailable (fail-open).
 */
export declare function isTokenBlocked(token: string): Promise<boolean>;
export { client as redisClient };
//# sourceMappingURL=redis.d.ts.map