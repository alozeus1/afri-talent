/**
 * §2.4 — `REDIS_REQUIRED` fail-closed gate.
 *
 * In test mode, REDIS_URL is unset → the Redis client is null → both legacy
 * (fail-open) and new (fail-closed) behaviour can be exercised by flipping
 * `REDIS_REQUIRED` per case. `isRedisRequired()` and `isTokenBlocked()` read
 * the env var at call-time, so vitest's `vi.stubEnv` works without a module
 * reload.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { isRedisRequired, isTokenBlocked } from "../lib/redis.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("redis fail-closed flag (§2.4)", () => {
  it("isRedisRequired() defaults to false", () => {
    vi.stubEnv("REDIS_REQUIRED", "");
    expect(isRedisRequired()).toBe(false);
  });

  it("isRedisRequired() reads true when REDIS_REQUIRED=true", () => {
    vi.stubEnv("REDIS_REQUIRED", "true");
    expect(isRedisRequired()).toBe(true);
  });

  it("isTokenBlocked returns false (fail-open) when Redis unavailable and REDIS_REQUIRED is unset", async () => {
    vi.stubEnv("REDIS_REQUIRED", "");
    expect(await isTokenBlocked("any.jwt.value")).toBe(false);
  });

  it("isTokenBlocked returns true (fail-closed) when Redis unavailable and REDIS_REQUIRED=true", async () => {
    vi.stubEnv("REDIS_REQUIRED", "true");
    expect(await isTokenBlocked("any.jwt.value")).toBe(true);
  });

  it("isTokenBlocked still fails open if REDIS_REQUIRED is any value other than the literal 'true'", async () => {
    vi.stubEnv("REDIS_REQUIRED", "1");
    expect(await isTokenBlocked("any.jwt.value")).toBe(false);
    vi.stubEnv("REDIS_REQUIRED", "yes");
    expect(await isTokenBlocked("any.jwt.value")).toBe(false);
  });
});
