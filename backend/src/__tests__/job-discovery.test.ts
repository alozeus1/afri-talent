import { describe, expect, it } from "vitest";
import {
  buildJobIntelligenceUpdate,
  buildSourceFingerprint,
  collapseDuplicateRankedJobs,
  evaluateFreshness,
  evaluateJobQuality,
  scoreJobForSearch,
} from "../lib/jobs/discovery.js";

const baseJob = {
  id: "job_1",
  title: "Senior Backend Engineer",
  description:
    "Join our team to build reliable APIs, distributed systems, hiring workflows, and data products for cross-border recruitment. You will work with Node.js, TypeScript, PostgreSQL, queues, and cloud infrastructure.",
  location: "Remote - Europe",
  type: "FULL_TIME",
  seniority: "Senior",
  tags: ["node.js", "typescript", "postgresql", "api"],
  salaryMin: 90000,
  salaryMax: 120000,
  currency: "USD",
  visaSponsorship: "YES",
  relocationAssistance: true,
  eligibleCountries: ["NG", "KE", "GH"],
  sourceUrl: "https://jobs.example.com/backend-engineer",
  applicationUrl: "https://jobs.example.com/backend-engineer/apply",
  sourceId: "src-1",
  sourceName: "TechCorp",
  jobSource: "GREENHOUSE",
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  sourceFirstSeenAt: new Date(),
  sourceLastSeenAt: new Date(),
  riskScore: 8,
  riskLevel: "LOW" as const,
  employer: {
    companyName: "TechCorp",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    trustProfile: {
      verificationLevel: "MANUAL_REVIEW_APPROVED",
      authenticityScore: 84,
      riskScore: 12,
      riskLevel: "LOW",
    },
  },
};

describe("job discovery intelligence", () => {
  it("builds stable fingerprints for duplicate jobs", () => {
    const first = buildSourceFingerprint(baseJob);
    const second = buildSourceFingerprint({
      ...baseJob,
      sourceId: "src-2",
      sourceName: "TechCorp",
    });

    expect(first).toBe(second);
  });

  it("scores freshness and quality for complete trusted jobs", () => {
    const freshness = evaluateFreshness(baseJob, new Date(baseJob.publishedAt.getTime() + 2 * 86400000));
    const quality = evaluateJobQuality(baseJob);

    expect(freshness.label).toBe("FRESH");
    expect(freshness.score).toBeGreaterThanOrEqual(80);
    expect(["TRUSTED", "SOLID"]).toContain(quality.label);
    expect(quality.score).toBeGreaterThanOrEqual(64);
  });

  it("merges source lineage into persisted job intelligence", () => {
    const intelligence = buildJobIntelligenceUpdate(baseJob, null, [
      baseJob,
      {
        ...baseJob,
        sourceId: "src-2",
        jobSource: "REMOTEOK",
        sourceName: "RemoteOK",
        sourceUrl: "https://remoteok.com/backend-engineer",
        applicationUrl: "https://remoteok.com/backend-engineer/apply",
      },
    ]);

    const lineage = intelligence.sourceLineage as Array<{ source: string }>;
    expect(lineage).toHaveLength(2);
    expect(intelligence.qualityScore).toBeGreaterThan(0);
    expect(intelligence.freshnessScore).toBeGreaterThan(0);
  });

  it("collapses duplicate ranked jobs and keeps the strongest canonical listing", () => {
    const ranked = collapseDuplicateRankedJobs([
      scoreJobForSearch(baseJob, { query: "backend engineer", skills: ["typescript"] }),
      scoreJobForSearch(
        {
          ...baseJob,
          id: "job_2",
          sourceId: "src-2",
          sourceName: "RemoteOK",
          sourceUrl: "https://remoteok.com/backend-engineer",
          applicationUrl: "https://remoteok.com/backend-engineer/apply",
        },
        { query: "backend engineer", skills: ["typescript"] },
      ),
    ]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].explanation.summary.length).toBeGreaterThan(0);
  });
});
