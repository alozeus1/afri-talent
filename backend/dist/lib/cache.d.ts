export declare function buildCacheKey(prefix: string, data: unknown): string;
export declare function getCachedJson<T>(key: string): Promise<T | null>;
export declare function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void>;
export declare function delCache(key: string): Promise<void>;
//# sourceMappingURL=cache.d.ts.map