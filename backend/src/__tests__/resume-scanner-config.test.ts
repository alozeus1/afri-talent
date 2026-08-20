import { describe, expect, it } from "vitest";
import { getResumeScannerConfiguration, validateResumeScannerConfiguration } from "../lib/resume-scanner/config.js";

const production = { NODE_ENV: "production", DATABASE_URL: "postgresql://unused", FRONTEND_URL: "https://app.example.test", JWT_SECRET: "x", ANTHROPIC_API_KEY: "x" };

describe("resume scanner production configuration", () => {
  it("requires an explicit production mode", () => {
    expect(() => validateResumeScannerConfiguration(production)).toThrow(/RESUME_SCANNER_MODE/);
  });

  it("requires a strong callback secret without exposing it", () => {
    expect(() => validateResumeScannerConfiguration({ ...production, RESUME_SCANNER_MODE: "callback" })).toThrow(/RESUME_SCANNER_WEBHOOK_SECRET/);
    expect(() => validateResumeScannerConfiguration({ ...production, RESUME_SCANNER_MODE: "callback", RESUME_SCANNER_WEBHOOK_SECRET: "short" })).toThrow(/at least 32/);
    expect(() => validateResumeScannerConfiguration({ ...production, RESUME_SCANNER_MODE: "callback", RESUME_SCANNER_WEBHOOK_SECRET: "s".repeat(32) })).not.toThrow();
  });

  it("keeps disabled mode fail-closed for new registrations", () => {
    expect(getResumeScannerConfiguration({ ...production, RESUME_SCANNER_MODE: "disabled" })).toMatchObject({ registrationEnabled: false, readinessReason: "disabled" });
  });
});
