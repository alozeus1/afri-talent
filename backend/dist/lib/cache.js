import { redisClient } from "./redis.js";
function stableSerialize(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
        return `{${entries
            .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
export function buildCacheKey(prefix, data) {
    return `${prefix}:${stableSerialize(data)}`;
}
export async function getCachedJson(key) {
    if (!redisClient)
        return null;
    try {
        const cached = await redisClient.get(key);
        if (!cached)
            return null;
        return JSON.parse(cached);
    }
    catch {
        return null;
    }
}
export async function setCachedJson(key, value, ttlSeconds) {
    if (!redisClient)
        return;
    if (ttlSeconds <= 0)
        return;
    try {
        await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
    }
    catch {
        // graceful degradation
    }
}
export async function delCache(key) {
    if (!redisClient)
        return;
    try {
        await redisClient.del(key);
    }
    catch {
        // graceful degradation
    }
}
//# sourceMappingURL=cache.js.map