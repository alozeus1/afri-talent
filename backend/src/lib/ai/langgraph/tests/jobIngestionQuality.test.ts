import { describe, it, expect, beforeEach } from "vitest";
import {
  runJobIngestionQuality,
  type JobIngestionDeps,
  type JobQualityInput,
} from "../graphs/jobIngestionQuality.graph.js";
import { _resetCheckpointer } from "../memory/checkpointer.js";
import { _resetGraphEventSinks } from "../observability/graphEvents.js";

beforeEach(() => {
  _resetCheckpointer();
  _resetGraphEventSinks();
});

interface Spy { embedded: number; decision?: string }

function goodJob(over: Partial<JobQualityInput> = {}): JobQualityInput {
  return {
    jobRef: "job-1",
    source: "GREENHOUSE",
    fingerprint: `fp-${Math.random()}`,
    title: "Senior Engineer",
    company: "Acme",
    descriptionLength: 800,
    requirementsCount: 5,
    hasSalary: true,
    hasLocation: true,
    postedAt: new Date(),
    scamSampleText: "Join our engineering team.",
    ...over,
  };
}

function deps(spy: Spy, over: Partial<JobIngestionDeps> = {}): JobIngestionDeps {
  return {
    isDuplicate: async () => false,
    assessContentRisk: () => 10, // LOW
    getSourceReliability: async () => 80,
    embedJob: async () => { spy.embedded += 1; },
    recordDecision: async (_r, d) => { spy.decision = d; },
    ...over,
  };
}

describe("job ingestion quality graph", () => {
  it("publishes a high-quality job and embeds it", async () => {
    const spy: Spy = { embedded: 0 };
    const out = await runJobIngestionQuality(goodJob(), deps(spy));
    expect(out.decision).toBe("publish");
    expect(spy.embedded).toBe(1);
    expect(out.qualityScore).toBeGreaterThanOrEqual(60);
  });

  it("rejects a duplicate without embedding", async () => {
    const spy: Spy = { embedded: 0 };
    const out = await runJobIngestionQuality(goodJob(), deps(spy, { isDuplicate: async () => true }));
    expect(out.decision).toBe("reject");
    expect(spy.embedded).toBe(0);
  });

  it("publishes with warning for a mid-quality job", async () => {
    const spy: Spy = { embedded: 0 };
    const job = goodJob({ hasSalary: false, hasLocation: false, requirementsCount: 0, descriptionLength: 100 });
    const out = await runJobIngestionQuality(job, deps(spy, { getSourceReliability: async () => 50 }));
    expect(out.decision).toBe("publish_with_warning");
    expect(spy.embedded).toBe(1); // warned jobs still get indexed
  });

  it("holds a very low-quality job (no embed)", async () => {
    const spy: Spy = { embedded: 0 };
    const job = goodJob({ hasSalary: false, hasLocation: false, requirementsCount: 0, descriptionLength: 50 });
    const out = await runJobIngestionQuality(job, deps(spy, { getSourceReliability: async () => 20 }));
    expect(out.decision).toBe("hold");
    expect(spy.embedded).toBe(0);
  });

  it("rejects a CRITICAL scam-risk job", async () => {
    const spy: Spy = { embedded: 0 };
    const out = await runJobIngestionQuality(goodJob(), deps(spy, { assessContentRisk: () => 90 }));
    expect(out.decision).toBe("reject");
    expect(spy.embedded).toBe(0);
  });

  it("holds a HIGH scam-risk job for review", async () => {
    const spy: Spy = { embedded: 0 };
    const out = await runJobIngestionQuality(goodJob(), deps(spy, { assessContentRisk: () => 65 }));
    expect(out.decision).toBe("hold");
    expect(spy.embedded).toBe(0);
  });
});
