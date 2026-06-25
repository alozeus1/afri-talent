import { describe, it, expect, beforeEach } from "vitest";
import { JobStatus, TrustRiskLevel } from "@prisma/client";
import {
  jobPersistenceForDecision,
  sourceReliability,
  gateJobIngestion,
} from "../integration/jobIngestionAdapter.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
});

describe("jobPersistenceForDecision", () => {
  it("rejects → null (caller skips persistence)", () => {
    expect(jobPersistenceForDecision("reject", 90)).toBeNull();
  });
  it("hold → PENDING_REVIEW with risk tier from scam score", () => {
    expect(jobPersistenceForDecision("hold", 60)).toEqual({
      status: JobStatus.PENDING_REVIEW,
      riskScore: 60,
      riskLevel: TrustRiskLevel.HIGH,
    });
  });
  it("publish_with_warning → PUBLISHED + MEDIUM", () => {
    expect(jobPersistenceForDecision("publish_with_warning", 10)).toEqual({
      status: JobStatus.PUBLISHED,
      riskScore: 10,
      riskLevel: TrustRiskLevel.MEDIUM,
    });
  });
  it("publish → PUBLISHED + LOW", () => {
    expect(jobPersistenceForDecision("publish", 0)).toEqual({
      status: JobStatus.PUBLISHED,
      riskScore: 0,
      riskLevel: TrustRiskLevel.LOW,
    });
  });
});

describe("sourceReliability", () => {
  it("ranks ATS boards above aggregators, with a default", () => {
    expect(sourceReliability("GREENHOUSE")).toBeGreaterThan(sourceReliability("ADZUNA"));
    expect(sourceReliability("UNKNOWN_SOURCE")).toBe(60);
  });
});

describe("gateJobIngestion (end-to-end, real content-risk)", () => {
  it("publishes a clean, complete job", async () => {
    const out = await gateJobIngestion({
      jobRef: "ext-1",
      source: "GREENHOUSE",
      fingerprint: "fp-clean",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      description: "We are hiring a senior backend engineer to build scalable services. ".repeat(20),
      requirements: ["5+ years", "TypeScript", "AWS"],
      hasSalary: true,
      hasLocation: true,
      postedAt: new Date(),
    });
    expect(out.decision).toBe("publish");
    expect(out.qualityScore).toBeGreaterThanOrEqual(60);
  });
});
