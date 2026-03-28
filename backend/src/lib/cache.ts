import { redisClient } from "./redis.js";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildCacheKey(prefix: string, data: unknown): string {
  return `${prefix}:${stableSerialize(data)}`;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!redisClient) return null;

  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!redisClient) return;
  if (ttlSeconds <= 0) return;

  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // graceful degradation
  }
}

export async function delCache(key: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch {
    // graceful degradation
  }
}
