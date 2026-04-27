import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../normalized-job.js";
import { scoreQuality, scoreScamRisk } from "../scoring.js";

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    externalId: "job-1",
    provider: "GENERIC",
    companyName: "Acme",
    title: "Operations Analyst",
    description: "Analyze operations performance, improve workflows, and collaborate with cross-functional teams across regions.",
    location: "Remote",
    remoteType: "REMOTE",
    employmentType: "Full-time",
    seniority: "Mid",
    salaryMin: 70000,
    salaryMax: 95000,
    currency: "USD",
    applyUrl: "https://acme.example/jobs/operations-analyst",
    sourceUrl: "https://acme.example/careers",
    postedAt: new Date("2026-04-01T00:00:00.000Z"),
    discoveredAt: new Date("2026-04-02T00:00:00.000Z"),
    skills: ["analytics", "operations"],
    countriesAllowed: ["NG", "KE"],
    visaSponsorship: "UNKNOWN",
    hiringForeigners: true,
    scamRiskScore: 0,
    qualityScore: 0,
    relevanceScore: 0,
    finalScore: 0,
    ...overrides,
  };
}

describe("job scam and quality scoring", () => {
  it("detects high-risk scam signals without blocking the job automatically", () => {
    const risk = scoreScamRisk(job({
      description: "Apply by WhatsApp only. Pay processing fee first.",
      applyUrl: "not-a-url",
      sourceUrl: null,
      salaryMax: 1_200_000,
    }));

    expect(risk.score).toBeGreaterThanOrEqual(80);
    expect(risk.signals).toEqual(expect.arrayContaining([
      "no_valid_apply_url",
      "unrealistic_salary",
      "poor_job_description",
      "requests_payment",
      "whatsapp_only_communication",
    ]));
  });

  it("rewards complete jobs with valid application URLs and transparent salary", () => {
    const quality = scoreQuality(job({
      description: "A".repeat(600),
    }), 0);

    expect(quality.score).toBeGreaterThan(80);
    expect(quality.signals).toEqual(expect.arrayContaining([
      "complete_description",
      "valid_apply_url",
      "salary_transparent",
    ]));
  });
});
