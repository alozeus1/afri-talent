import { describe, it, expect } from "vitest";
import {
  assessContentRisk,
  assessJobPostingRisk,
  assessEmployerTrust,
  riskLevelForScore,
} from "../risk.js";

// NOTE: assessJobTextRisk does not exist in risk.ts.
// The actual exported function for assessing free-text job content is assessContentRisk.
// assessJobPostingRisk wraps assessContentRisk and also factors in employer risk score.
// Both are tested below.

describe("scam-detection / clean legitimate job", () => {
  it("returns LOW risk for a clean, legitimate job description", () => {
    const result = assessContentRisk(
      "Senior Software Engineer at Andela. Remote-first role. " +
        "We are looking for 5+ years of experience in Node.js and PostgreSQL. " +
        "Competitive salary, health benefits, and equity. Apply via our careers portal.",
    );
    expect(result.flags).toHaveLength(0);
    expect(result.score).toBe(0);
    expect(result.level).toBe("LOW");
    expect(result.autoHold).toBe(false);
  });
});

describe("scam-detection / WhatsApp contact flag", () => {
  it("flags a job that requests WhatsApp contact", () => {
    const result = assessContentRisk(
      "Data Entry Clerk needed. Send your CV on WhatsApp +234-801-234-5678. Immediate start.",
    );
    const offPlatformFlags = result.flags.filter((f) => f.startsWith("off_platform_contact"));
    expect(offPlatformFlags.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("assessJobPostingRisk also elevates score for WhatsApp contact", () => {
    const result = assessJobPostingRisk({
      title: "Data Entry Clerk",
      description: "Contact recruiter via WhatsApp for interview details. Immediate start.",
      employerRiskScore: 0,
    });
    const offPlatformFlags = result.flags.filter((f) => f.startsWith("off_platform_contact"));
    expect(offPlatformFlags.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("scam-detection / advance fee detection", () => {
  it("flags 'application fee' language with advance_fee flag and high score", () => {
    const result = assessContentRisk(
      "Exciting opportunity abroad! Pay a small application fee of $50 to unlock your interview slot.",
    );
    const advanceFeeFlags = result.flags.filter((f) => f.startsWith("advance_fee"));
    expect(advanceFeeFlags.length).toBeGreaterThan(0);
    // advance_fee adds 35 per flag — score should be at least 35
    expect(result.score).toBeGreaterThanOrEqual(35);
  });

  it("flags 'processing fee' language", () => {
    const result = assessContentRisk(
      "A processing fee of $30 is required before we can process your application documents.",
    );
    const advanceFeeFlags = result.flags.filter((f) => f.startsWith("advance_fee"));
    expect(advanceFeeFlags.length).toBeGreaterThan(0);
  });

  it("sets autoHold when advance fee score reaches threshold", () => {
    // Two advance_fee hits = 70 score → autoHold
    const result = assessContentRisk(
      "Pay the application fee and training fee upfront to secure your position.",
    );
    expect(result.autoHold).toBe(true);
  });
});

describe("scam-detection / low-trust spam language", () => {
  it("flags 'quick money' pattern as spam_language", () => {
    const result = assessContentRisk(
      "Make quick money from home! No experience needed. Earn guaranteed income every week.",
    );
    const spamFlags = result.flags.filter((f) => f.startsWith("spam_language"));
    expect(spamFlags.length).toBeGreaterThan(0);
  });

  it("flags 'guaranteed income' pattern", () => {
    const result = assessContentRisk(
      "Join our team and enjoy guaranteed income of $500/week without any prior experience.",
    );
    const spamFlags = result.flags.filter((f) => f.startsWith("spam_language"));
    expect(spamFlags.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });
});

describe("scam-detection / throwaway email for corporate role", () => {
  it("detects throwaway domain for a corporate employer posting", () => {
    // Gmail / Yahoo are free-inbox providers — throwaway for a corporate job posting
    const result = assessEmployerTrust({
      email: "recruiter@gmail.com",
      website: "https://acmecorporation.com",
      approvedBusinessDocs: 0,
      approvedManualReviews: 0,
      openReports: 0,
      postingVelocity24h: 1,
      isPremiumSubscription: false,
    });
    expect(result.throwawayDomainDetected).toBe(true);
    expect(result.riskScore).toBeGreaterThan(0);
    // Domain mismatch between gmail.com and acmecorporation.com → no verified domain
    expect(result.verifiedDomain).toBeNull();
    expect(result.websiteMatchesEmail).toBe(false);
    // warnings should mention using a company email
    expect(result.warnings.some((w) => w.toLowerCase().includes("company email"))).toBe(true);
  });

  it("also flags off-platform Gmail contact in job description", () => {
    const result = assessContentRisk(
      "Senior Product Manager at GlobalCorp. Please email your CV to hr@gmail.com for consideration.",
    );
    const offPlatformFlags = result.flags.filter((f) => f.startsWith("off_platform_contact"));
    expect(offPlatformFlags.length).toBeGreaterThan(0);
  });
});

describe("scam-detection / riskLevelForScore thresholds", () => {
  it("returns LOW for score below 25", () => {
    expect(riskLevelForScore(0)).toBe("LOW");
    expect(riskLevelForScore(24)).toBe("LOW");
  });

  it("returns MEDIUM for score 25–54", () => {
    expect(riskLevelForScore(25)).toBe("MEDIUM");
    expect(riskLevelForScore(54)).toBe("MEDIUM");
  });

  it("returns HIGH for score 55–79", () => {
    expect(riskLevelForScore(55)).toBe("HIGH");
    expect(riskLevelForScore(79)).toBe("HIGH");
  });

  it("returns CRITICAL for score 80+", () => {
    expect(riskLevelForScore(80)).toBe("CRITICAL");
    expect(riskLevelForScore(100)).toBe("CRITICAL");
  });
});
