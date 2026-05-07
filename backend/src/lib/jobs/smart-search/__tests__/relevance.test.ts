import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../normalized-job.js";
import { scoreFinalJob, scoreRelevance } from "../scoring.js";

const job: NormalizedJob = {
  externalId: "job-1",
  provider: "LEVER",
  companyName: "Acme",
  title: "Platform Engineer",
  description: "Build Kubernetes and cloud infrastructure for remote teams.",
  location: "Remote - United States",
  remoteType: "REMOTE",
  employmentType: "Full-time",
  seniority: "Senior",
  salaryMin: 120000,
  salaryMax: 160000,
  currency: "USD",
  applyUrl: "https://jobs.example.com/platform",
  sourceUrl: "https://jobs.example.com",
  postedAt: new Date(),
  discoveredAt: new Date(),
  skills: ["kubernetes", "cloud"],
  countriesAllowed: ["US"],
  visaSponsorship: "UNKNOWN",
  hiringForeigners: true,
  scamRiskScore: 5,
  qualityScore: 82,
  relevanceScore: 0,
  finalScore: 0,
};

describe("job relevance scoring", () => {
  it("returns an explainable score breakdown for matching jobs", () => {
    const relevance = scoreRelevance(job, {
      query: "DevOps Engineer",
      expandedKeywords: ["platform engineer", "cloud engineer"],
      skills: ["kubernetes"],
      location: "United States",
      remoteOnly: true,
      salaryMin: 100000,
      companyQuality: 9,
    });

    expect(relevance.score).toBeGreaterThan(70);
    expect(relevance.signals).toEqual(expect.arrayContaining(["title_match", "skills_match", "location_fit", "remote_fit"]));
    expect(relevance.components).toMatchObject({
      titleMatch: expect.any(Number),
      skillsMatch: expect.any(Number),
      scamPenalty: expect.any(Number),
    });
  });

  it("combines relevance, quality, salary, and scam risk into final score", () => {
    const final = scoreFinalJob(job, 90);

    expect(final.score).toBeGreaterThan(70);
    expect(final.components).toMatchObject({
      relevance: 45,
      scamRisk: -1,
    });
  });
});
