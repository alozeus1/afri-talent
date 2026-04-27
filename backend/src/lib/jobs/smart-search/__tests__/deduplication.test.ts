import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../normalized-job.js";
import { deduplicateJobs, normalizeTitleForDedup } from "../deduplication.js";

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    externalId: "job-1",
    provider: "GREENHOUSE",
    companyName: "Acme",
    title: "Senior Platform Engineer",
    description: "Build cloud platforms for international engineering teams.",
    location: "Remote",
    remoteType: "REMOTE",
    employmentType: "Full-time",
    seniority: "Senior",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    applyUrl: "https://jobs.acme.com/platform-engineer",
    sourceUrl: "https://jobs.acme.com",
    postedAt: new Date("2026-04-01T00:00:00.000Z"),
    discoveredAt: new Date("2026-04-02T00:00:00.000Z"),
    skills: ["cloud"],
    countriesAllowed: [],
    visaSponsorship: "UNKNOWN",
    hiringForeigners: true,
    scamRiskScore: 0,
    qualityScore: 70,
    relevanceScore: 0,
    finalScore: 0,
    ...overrides,
  };
}

describe("job deduplication", () => {
  it("normalizes seniority and reordered title variations", () => {
    expect(normalizeTitleForDedup("Sr. Engineer, Platform")).toBe(normalizeTitleForDedup("Senior Platform Engineer"));
  });

  it("marks duplicates safely instead of blindly deleting data", () => {
    const duplicate = job({
      externalId: "job-2",
      title: "Sr. Engineer Platform",
      description: "Build cloud platforms.",
    });
    const result = deduplicateJobs([job(), duplicate]);

    expect(result.jobs).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.duplicates[0].duplicate.externalId).toBe("job-2");
    expect(result.duplicates[0].duplicate.duplicateOfExternalId).toBe("job-1");
  });
});
