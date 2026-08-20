import { describe, it, expect } from "vitest";
import pino from "pino";
import { httpLoggerConfig, redactPaths } from "../lib/logger.js";

/**
 * L2 hardening: phone numbers and OTP codes must never appear in logs.
 * Builds a pino instance with the production redact config writing to an
 * in-memory sink, then asserts sensitive keys are censored.
 */
function captureLog(fields: Record<string, unknown>): Record<string, unknown> {
  const lines: string[] = [];
  const sink = {
    write(line: string) {
      lines.push(line);
    },
  };
  const testLogger = pino(
    { redact: { paths: redactPaths, censor: "[REDACTED]" } },
    sink,
  );
  testLogger.info(fields, "test message");
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

describe("logger redaction (L2)", () => {
  it("redacts top-level sensitive fields", () => {
    const out = captureLog({
      password: "hunter2",
      token: "jwt-abc",
      secret: "s3cr3t",
      email: "candidate@example.com",
      to: "employer@example.com",
      replyTo: "candidate@example.com",
      phone: "+2348012345678",
      phoneNumber: "+2348012345678",
      otp: "123456",
      otpCode: "123456",
    });
    for (const key of ["password", "token", "secret", "email", "to", "replyTo", "phone", "phoneNumber", "otp", "otpCode"]) {
      expect(out[key], key).toBe("[REDACTED]");
    }
  });

  it("redacts one-level-nested sensitive fields", () => {
    const out = captureLog({
      payload: {
        phoneNumber: "+2348012345678",
        otpCode: "654321",
        password: "hunter2",
        email: "candidate@example.com",
        replyTo: "candidate@example.com",
      },
    });
    const payload = out.payload as Record<string, unknown>;
    expect(payload.phoneNumber).toBe("[REDACTED]");
    expect(payload.otpCode).toBe("[REDACTED]");
    expect(payload.password).toBe("[REDACTED]");
    expect(payload.email).toBe("[REDACTED]");
    expect(payload.replyTo).toBe("[REDACTED]");
  });

  it("redacts authorization and cookie request headers", () => {
    const out = captureLog({
      req: { headers: { authorization: "Bearer xyz", cookie: "session=abc" } },
    });
    const headers = (out.req as { headers: Record<string, unknown> }).headers;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
  });

  it("logs only the request path, not sensitive query parameters or headers", () => {
    const request = httpLoggerConfig.serializers.req({
      id: "req-1",
      method: "GET",
      url: "/api/auth/reset?token=reset-token&email=candidate%40example.com",
      headers: {
        authorization: "Bearer jwt-abc",
        cookie: "session=abc",
        "user-agent": "security-test",
      },
      remoteAddress: "127.0.0.1",
    });

    expect(request).toEqual({
      id: "req-1",
      method: "GET",
      url: "/api/auth/reset",
      userAgent: "security-test",
      remoteAddress: "127.0.0.1",
    });
  });

  it("leaves non-sensitive fields intact", () => {
    const out = captureLog({ userId: "user-123", channel: "SMS" });
    expect(out.userId).toBe("user-123");
    expect(out.channel).toBe("SMS");
  });
});
