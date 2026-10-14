import { describe, it, expect, afterEach } from "vitest";
import { validateRuntimeEnv } from "../config/env.js";

describe("validateRuntimeEnv — ANTHROPIC_API_KEY requirement", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setProductionEnv() {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://test";
    process.env.FRONTEND_URL = "https://example.com";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.SENTRY_DSN = "https://test@sentry.example.com/1";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MOCK_AI;
    delete process.env.AI_DISABLED;
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    delete process.env.N8N_APPROVAL_WEBHOOK_URL;
  }

  it("throws in production when the key is missing and AI is live", () => {
    setProductionEnv();
    expect(() => validateRuntimeEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws in production when MOCK_AI is set to something other than 1", () => {
    setProductionEnv();
    process.env.MOCK_AI = "0";
    expect(() => validateRuntimeEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("does not require the key when MOCK_AI=1", () => {
    setProductionEnv();
    process.env.MOCK_AI = "1";
    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it("does not require the key when AI_DISABLED=1", () => {
    setProductionEnv();
    process.env.AI_DISABLED = "1";
    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it("passes in production when the key is set", () => {
    setProductionEnv();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(() => validateRuntimeEnv()).not.toThrow();
  });
});
