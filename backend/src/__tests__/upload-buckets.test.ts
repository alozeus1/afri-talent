/**
 * §2.11 — `bucketForScope` routes trust scopes to TRUST_S3_BUCKET when
 * provisioned, falling back to the main uploads bucket during migration.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { bucketForScope } from "../lib/upload-buckets.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bucketForScope (§2.11)", () => {
  it("resume scope always returns the main bucket, never the trust bucket", () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "main-uploads");
    vi.stubEnv("TRUST_S3_BUCKET", "trust-bucket");
    expect(bucketForScope("resume")).toBe("main-uploads");
  });

  it("trust scopes use TRUST_S3_BUCKET when set", () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "main-uploads");
    vi.stubEnv("TRUST_S3_BUCKET", "trust-bucket");
    expect(bucketForScope("candidate-verification")).toBe("trust-bucket");
    expect(bucketForScope("employer-verification")).toBe("trust-bucket");
  });

  it("trust scopes can use TRUST_S3_BUCKET even when the main bucket is unset", () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "");
    vi.stubEnv("TRUST_S3_BUCKET", "trust-bucket");
    expect(bucketForScope("resume")).toBeUndefined();
    expect(bucketForScope("candidate-verification")).toBe("trust-bucket");
    expect(bucketForScope("employer-verification")).toBe("trust-bucket");
  });

  it("trust scopes fall back to the main bucket when TRUST_S3_BUCKET is unset (migration window)", () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "main-uploads");
    vi.stubEnv("TRUST_S3_BUCKET", "");
    expect(bucketForScope("candidate-verification")).toBe("main-uploads");
    expect(bucketForScope("employer-verification")).toBe("main-uploads");
  });

  it("returns undefined when no bucket is configured (matches files.ts 503 guard)", () => {
    vi.stubEnv("S3_UPLOADS_BUCKET", "");
    vi.stubEnv("TRUST_S3_BUCKET", "");
    expect(bucketForScope("resume")).toBeUndefined();
    expect(bucketForScope("candidate-verification")).toBeUndefined();
  });
});
