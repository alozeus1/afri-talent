import { describe, expect, it, vi } from "vitest";

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
const opsMocks = vi.hoisted(() => ({ recordOpsEvent: vi.fn() }));

vi.mock("../lib/logger.js", () => ({ default: loggerMocks }));
vi.mock("../lib/ops/events.js", () => opsMocks);
vi.mock("../lib/ops/resilience.js", () => ({
  pushDeadLetter: vi.fn(),
  withRetry: vi.fn(),
}));

import { accountEmailVerificationEmail } from "../lib/email.js";

describe("email fallback logging", () => {
  it("never logs a verification URL or token when delivery is disabled", async () => {
    const verificationUrl = "https://app.example.test/verify?token=synthetic-token-for-test";

    await accountEmailVerificationEmail({
      to: "candidate@example.test",
      candidateName: "Candidate",
      verifyUrl: verificationUrl,
      expiresInHours: 24,
    });

    const serializedCalls = JSON.stringify([
      ...loggerMocks.warn.mock.calls,
      ...loggerMocks.debug.mock.calls,
      ...loggerMocks.info.mock.calls,
      ...loggerMocks.error.mock.calls,
    ]);
    expect(serializedCalls).not.toContain(verificationUrl);
    expect(serializedCalls).not.toContain("synthetic-token-for-test");
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      expect.objectContaining({ template: "account_email_verification" }),
      "[email] delivery skipped; body redacted",
    );
  });
});
