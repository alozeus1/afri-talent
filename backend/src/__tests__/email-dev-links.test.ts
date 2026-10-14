import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/logger.js", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { default: logger, logger };
});
vi.mock("../lib/ops/events.js", () => ({ recordOpsEvent: vi.fn() }));

import logger from "../lib/logger.js";
import {
  accountEmailVerificationEmail,
  passwordResetEmail,
  shouldLogDevEmailLinks,
} from "../lib/email.js";

const info = vi.mocked(logger.info);

describe("shouldLogDevEmailLinks", () => {
  it("never logs when SES is configured, even with the opt-in flag", () => {
    expect(
      shouldLogDevEmailLinks({ SES_FROM_EMAIL: "no-reply@x.com", NODE_ENV: "development", EMAIL_DEV_LOG_LINKS: "1" }),
    ).toBe(false);
  });

  it("logs outside deployed environments when SES is unset", () => {
    expect(shouldLogDevEmailLinks({ NODE_ENV: "development" })).toBe(true);
    expect(shouldLogDevEmailLinks({ NODE_ENV: "test" })).toBe(true);
  });

  it("does not log in production/staging unless explicitly opted in", () => {
    expect(shouldLogDevEmailLinks({ NODE_ENV: "production" })).toBe(false);
    expect(shouldLogDevEmailLinks({ NODE_ENV: "staging" })).toBe(false);
    expect(shouldLogDevEmailLinks({ NODE_ENV: "production", EMAIL_DEV_LOG_LINKS: "1" })).toBe(true);
  });
});

describe("dev email link logging (SES unset)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    info.mockClear();
    delete process.env.SES_FROM_EMAIL;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("logs the verification link at info level", async () => {
    const verifyUrl = "http://localhost:3000/verify-email?token=abc";
    await accountEmailVerificationEmail({ to: "a@b.com", candidateName: "A", verifyUrl, expiresInHours: 24 });
    expect(info).toHaveBeenCalledWith({ verifyUrl }, "DEV email verification link");
  });

  it("logs the password reset link at info level", async () => {
    const resetUrl = "http://localhost:3000/reset-password?token=abc";
    await passwordResetEmail({ to: "a@b.com", userName: "A", resetUrl, expiresInHours: 1 });
    expect(info).toHaveBeenCalledWith({ resetUrl }, "DEV password reset link");
  });

  it("does not log links in production without the opt-in flag", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_DEV_LOG_LINKS;
    await accountEmailVerificationEmail({
      to: "a@b.com",
      candidateName: "A",
      verifyUrl: "http://x/verify-email?token=t",
      expiresInHours: 24,
    });
    expect(info).not.toHaveBeenCalledWith(expect.anything(), "DEV email verification link");
  });
});
