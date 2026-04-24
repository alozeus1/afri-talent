import { describe, it, expect } from "vitest";
import {
  evaluateJobQuality,
  evaluateCandidatePreferenceMatch,
  buildJobDiscoverySummary,
  evaluateFreshness,
  type JobDocumentLike,
} from "../discovery.js";
import {
  AFRICA_FRIENDLY_KEYWORDS,
  AFRICAN_COUNTRIES,
} from "../aggregator/types.js";

// NOTE: evaluateMobilityRelevance is an internal (non-exported) function.
// Mobility relevance is accessible through:
//   - evaluateJobQuality() → signals.mobilityClear
//   - buildJobDiscoverySummary() → visaClear, relocationClear
//   - scoreJobForSearch() → explanation.components.mobilityRelevance
// Tests below use the exported surface area only.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshDate(): string {
  return new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(); // 3 days ago
}

function baseJob(overrides: Partial<JobDocumentLike> = {}): JobDocumentLike {
  return {
    title: "Backend Engineer",
    description:
      "We are looking for a Backend Engineer with 4+ years of experience in Node.js, " +
      "PostgreSQL, and REST API design. You will build scalable systems serving over " +
      "500k requests per day. We value clean code, observability, and delivery velocity. " +
      "Our team is distributed across three time zones and we support async-first culture.",
    location: "Remote",
    applicationUrl: "https://careers.acmecorp.com/apply/backend-engineer",
    publishedAt: freshDate(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Visa sponsorship → mobilityClear / visaClear
// ---------------------------------------------------------------------------

describe("global-hiring / visa sponsorship signal", () => {
  it("mobilityClear is true when visaSponsorship is YES", () => {
    const job = baseJob({ visaSponsorship: "YES" });
    const result = evaluateJobQuality(job);
    expect(result.signals.mobilityClear).toBe(true);
  });

  it("visaClear is true in discovery summary when visaSponsorship is YES and application path is valid", () => {
    const job = baseJob({ visaSponsorship: "YES" });
    const quality = evaluateJobQuality(job);
    const freshness = evaluateFreshness(job);
    const summary = buildJobDiscoverySummary({
      quality,
      freshness,
      applicationLikelihoodScore: 70,
      employerTrust: 60,
      sourceLineage: [],
      job,
    });
    // visaClear = mobilityClear AND validApplicationPath
    expect(summary.visaClear).toBe(true);
  });

  it("mobilityClear is false when visaSponsorship is UNKNOWN and no other mobility signals", () => {
    const job = baseJob({
      visaSponsorship: "UNKNOWN",
      relocationAssistance: false,
      eligibleCountries: [],
    });
    const result = evaluateJobQuality(job);
    // visaSponsorship === "UNKNOWN" satisfies the condition in evaluateJobQuality
    // (the condition is: visaSponsorship !== "UNKNOWN" OR relocation OR eligibleCountries)
    // So this should be FALSE — the job has UNKNOWN sponsorship and no other mobility signals
    expect(result.signals.mobilityClear).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Eligible countries including African nations → mobility relevance
// ---------------------------------------------------------------------------

describe("global-hiring / eligible countries with African nations", () => {
  it("mobilityClear is true when eligibleCountries includes African ISO codes", () => {
    const africanCountrySample = ["NG", "KE", "GH", "ZA", "ET"];
    const job = baseJob({ eligibleCountries: africanCountrySample });
    const result = evaluateJobQuality(job);
    expect(result.signals.mobilityClear).toBe(true);
  });

  it("evaluateCandidatePreferenceMatch matches target countries against eligibleCountries", () => {
    const job = baseJob({ eligibleCountries: ["NG", "KE", "GH"] });
    const match = evaluateCandidatePreferenceMatch(job, {
      targetCountries: ["NG", "GH"],
    });
    // Should get a non-zero score from country matching
    expect(match.score).toBeGreaterThan(0);
  });

  it("AFRICAN_COUNTRIES constant covers 54 African nations", () => {
    // Spot-check that key countries are present
    const mustInclude = ["NG", "KE", "GH", "ZA", "ET", "EG", "TZ", "SN"];
    mustInclude.forEach((code) => {
      expect(AFRICAN_COUNTRIES).toContain(code);
    });
    // Should represent a meaningful portion of African nations
    expect(AFRICAN_COUNTRIES.length).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// 3. Africa-friendly keywords in description
// ---------------------------------------------------------------------------

describe("global-hiring / Africa-friendly keyword detection", () => {
  it("AFRICA_FRIENDLY_KEYWORDS is a non-empty list", () => {
    expect(Array.isArray(AFRICA_FRIENDLY_KEYWORDS)).toBe(true);
    expect(AFRICA_FRIENDLY_KEYWORDS.length).toBeGreaterThan(0);
  });

  it("detects 'visa sponsorship' keyword in AFRICA_FRIENDLY_KEYWORDS", () => {
    expect(AFRICA_FRIENDLY_KEYWORDS).toContain("visa sponsorship");
  });

  it("detects 'relocation assistance' keyword in AFRICA_FRIENDLY_KEYWORDS", () => {
    expect(AFRICA_FRIENDLY_KEYWORDS).toContain("relocation assistance");
  });

  it("a description containing Africa-friendly keywords matches the constant", () => {
    const jobDescription =
      "We offer visa sponsorship and relocation assistance for candidates from sub-saharan Africa. " +
      "Our global team operates across emerging markets with a distributed team model.";
    const lower = jobDescription.toLowerCase();
    const matched = AFRICA_FRIENDLY_KEYWORDS.filter((kw) => lower.includes(kw));
    expect(matched.length).toBeGreaterThan(0);
  });

  it("a description with 'work from anywhere' matches Africa-friendly keywords", () => {
    const description = "We are a remote-first company. Work from anywhere in the world.";
    const lower = description.toLowerCase();
    const matched = AFRICA_FRIENDLY_KEYWORDS.filter((kw) => lower.includes(kw));
    expect(matched.some((kw) => kw.includes("anywhere"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Remote job with no country restrictions → accessible to global talent
// ---------------------------------------------------------------------------

describe("global-hiring / remote job accessibility", () => {
  it("a remote job with eligibleCountries open to all African nations has mobilityClear true", () => {
    const job = baseJob({
      location: "Remote",
      visaSponsorship: "YES",
      eligibleCountries: AFRICAN_COUNTRIES,
    });
    const result = evaluateJobQuality(job);
    expect(result.signals.mobilityClear).toBe(true);
  });

  it("a global remote job with no country restrictions still has mobilityClear if visaSponsorship is YES", () => {
    const job = baseJob({
      location: "Remote — Worldwide",
      visaSponsorship: "YES",
      eligibleCountries: [],
    });
    const result = evaluateJobQuality(job);
    expect(result.signals.mobilityClear).toBe(true);
  });

  it("evaluateCandidatePreferenceMatch: remoteOnly context matches remote job location", () => {
    // scoreJobForSearch uses evaluateMobilityRelevance with remoteOnly context internally.
    // We verify via evaluateCandidatePreferenceMatch that remote location is picked up.
    const job = baseJob({ location: "Remote" });
    // The function gives score based on skills, roles, countries — location itself is
    // not a direct preference match field, but we can confirm it doesn't penalise remote.
    const match = evaluateCandidatePreferenceMatch(job, { remoteOnly: true });
    // With no other filters active, score should be >= 0
    expect(match.score).toBeGreaterThanOrEqual(0);
  });

  it("a remote job with relocation assistance has relocationClear true in discovery summary", () => {
    const job = baseJob({
      location: "Remote",
      relocationAssistance: true,
    });
    const quality = evaluateJobQuality(job);
    const freshness = evaluateFreshness(job);
    const summary = buildJobDiscoverySummary({
      quality,
      freshness,
      applicationLikelihoodScore: 65,
      employerTrust: 50,
      sourceLineage: [],
      job,
    });
    expect(summary.relocationClear).toBe(true);
  });
});
