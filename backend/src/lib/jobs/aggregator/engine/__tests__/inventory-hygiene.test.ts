import { describe, expect, it } from "vitest";
import { isEvergreenPosting } from "../quality.js";
import { qualifiesForAfricaBadge } from "../eligibility.js";
import { normalizePosting } from "../normalize-posting.js";
import { africaBadge } from "../persist.js";
import { contentHash, groupDuplicates } from "../dedupe.js";
import { runIngestion } from "../pipeline.js";
import { CircuitBreakerRegistry } from "../circuit-breaker.js";
import { HttpClient } from "../http.js";
import { EligibilityTieBreaker } from "../llm-tiebreak.js";
import { normalizeWorkplaceType, signalsRemote } from "../../taxonomy.js";
import { buildDedupKeys, canonicalDedupLocation } from "../../../dedup.js";
import type { FeedSource, RawPosting } from "../types.js";

const NOW = new Date("2026-10-15T00:00:00Z");

function raw(overrides: Partial<RawPosting> = {}): RawPosting {
  return {
    externalId: "arbeitnow:x",
    scopeKey: "arbeitnow:",
    title: "Customer Care Specialist",
    company: "Acme",
    location: "Paris",
    descriptionHtml: "<p>Help our customers. Relocation package available for the right candidate.</p>",
    applyUrl: "https://jobs.example.com/x",
    sourceUrl: "https://jobs.example.com/x",
    postedAt: new Date("2026-10-10T00:00:00Z"),
    ...overrides,
  };
}

function badgeFor(posting: RawPosting): boolean {
  const normalized = normalizePosting("arbeitnow", posting, NOW);
  return africaBadge({ canonical: normalized, variants: [normalized] });
}

describe("isEvergreenPosting", () => {
  it.each([
    "Don't see your role but inspired to apply?",
    "Don’t see the right role? Apply here",
    "General Application",
    "Open Application - Engineering",
    "Spontaneous application (m/f/d)",
    "Join our Talent Pool",
    "Talent Community – Lagos",
  ])("flags %s", (title) => {
    expect(isEvergreenPosting(title)).toBe(true);
  });

  it.each(["Senior Backend Engineer", "Talent Acquisition Specialist", "Application Security Engineer", "Head of Talent"])(
    "keeps %s",
    (title) => {
      expect(isEvergreenPosting(title)).toBe(false);
    },
  );
});

describe("Hires-from-Africa badge", () => {
  it("is withheld from on-site roles abroad that only offer relocation", () => {
    const normalized = normalizePosting("arbeitnow", raw(), NOW);
    expect(normalized.eligibility).toMatchObject({ verdict: "eligible", scopes: ["RELOCATION"] });
    expect(badgeFor(raw())).toBe(false);
  });

  it("is withheld from on-site roles abroad with no stated sponsorship", () => {
    expect(
      qualifiesForAfricaBadge({ verdict: "eligible", scopes: ["REMOTE_WORLDWIDE"] }, { remote: false, visaSponsorship: "UNKNOWN" }),
    ).toBe(false);
  });

  it("is granted for visa sponsorship, African locations and remote worldwide/EMEA roles", () => {
    expect(
      badgeFor(raw({ descriptionHtml: "<p>We offer visa sponsorship and relocation support.</p>", location: "Berlin" })),
    ).toBe(true);
    expect(badgeFor(raw({ location: "Lagos, Nigeria" }))).toBe(true);
    expect(badgeFor(raw({ location: "Remote", remote: true, descriptionHtml: "<p>We hire from anywhere in the world.</p>" }))).toBe(true);
    expect(badgeFor(raw({ location: "EMEA", remote: true }))).toBe(true);
  });

  it("is never granted to ineligible or uncertain postings", () => {
    expect(qualifiesForAfricaBadge({ verdict: "uncertain", scopes: [] }, { remote: true, visaSponsorship: "YES" })).toBe(false);
    expect(qualifiesForAfricaBadge({ verdict: "ineligible", scopes: [] }, { remote: true, visaSponsorship: "UNKNOWN" })).toBe(false);
  });

  it("changes the persisted content hash when only the badge changes", () => {
    const job = normalizePosting("arbeitnow", raw(), NOW).job;
    expect(contentHash(job, [true, "ONSITE"])).not.toBe(contentHash(job, [false, "ONSITE"]));
    expect(contentHash(job)).toBe(contentHash(job, []));
  });
});

describe("workplace type honours 'Remote' in the title or location", () => {
  it("detects delimited remote qualifiers", () => {
    expect(signalsRemote("Sr Security Engineer | Remote | Europe")).toBe(true);
    expect(signalsRemote("Senior People Partner (Remote Europe)")).toBe(true);
    expect(signalsRemote("Backend Engineer - Remote")).toBe(true);
    expect(signalsRemote("Berlin or Remote")).toBe(true);
    expect(signalsRemote("Remote")).toBe(true);
  });

  it("ignores remote as part of a job name and hybrid roles", () => {
    expect(signalsRemote("Remote Sensing Scientist")).toBe(false);
    expect(signalsRemote("Backend Engineer")).toBe(false);
    expect(signalsRemote("Engineer (Hybrid / Remote)")).toBe(false);
  });

  it("maps an on-site source posting with a remote title to REMOTE", () => {
    expect(normalizeWorkplaceType("onsite", { title: "Sr Security Engineer | Remote | Europe", location: "Berlin Office" })).toBe(
      "REMOTE",
    );
    expect(normalizeWorkplaceType("onsite", { title: "HR Partner", location: "Hamburg" })).toBe("ONSITE");
    expect(normalizeWorkplaceType("hybrid", { title: "Engineer | Remote" })).toBe("HYBRID");

    const normalized = normalizePosting(
      "arbeitnow",
      raw({ title: "Sr Security Engineer | Remote | Europe", location: "Berlin Office" }),
      NOW,
    );
    expect(normalized.job.workplaceType).toBe("REMOTE");
    expect(normalized.job.locationType).toBe("remote");
  });
});

describe("dedup location canonicalisation", () => {
  it("collapses board labels and repeated segments", () => {
    expect(canonicalDedupLocation("EMEA; Roles - EMEA")).toBe("EMEA");
    expect(canonicalDedupLocation("Roles - EMEA")).toBe("EMEA");
    expect(canonicalDedupLocation("Berlin Office")).toBe("Berlin");
    expect(canonicalDedupLocation("APAC; EMEA; Roles - EMEA")).toBe("APAC; EMEA");
    expect(canonicalDedupLocation("Lagos, Nigeria")).toBe("Lagos, Nigeria");
  });

  it("gives the two OKX 'Head of Marketing Compliance' postings the same K1", () => {
    const a = buildDedupKeys({ title: "Head of Marketing Compliance", company: "OKX", location: "EMEA; Roles - EMEA" });
    const b = buildDedupKeys({ title: "Head of Marketing Compliance", company: "OKX", location: "Roles - EMEA" });
    expect(a.k1).toBe(b.k1);
  });

  it("keeps same-title roles at different companies apart", () => {
    const a = buildDedupKeys({ title: "Lead Product Manager", company: "Lattice", location: "Anywhere in the World" });
    const b = buildDedupKeys({ title: "Lead Product Manager", company: "Oyster HR", location: "EMEA / Romania / Spain" });
    expect(a.k1).not.toBe(b.k1);
  });

  it("groups the OKX postings in-run", () => {
    const one = normalizePosting(
      "greenhouse",
      raw({ externalId: "greenhouse:okx:1", title: "Head of Marketing Compliance", company: "OKX", location: "EMEA; Roles - EMEA", applyUrl: "https://boards.greenhouse.io/okx/jobs/1" }),
      NOW,
    );
    const two = normalizePosting(
      "greenhouse",
      raw({ externalId: "greenhouse:okx:2", title: "Head of Marketing Compliance", company: "OKX", location: "Roles - EMEA", applyUrl: "https://boards.greenhouse.io/okx/jobs/2" }),
      NOW,
    );
    expect(groupDuplicates([one, two])).toHaveLength(1);
  });
});

describe("runIngestion drops evergreen postings", () => {
  it("counts them as rejected and never keeps them", async () => {
    const feed: FeedSource = {
      id: "arbeitnow",
      name: "arbeitnow",
      kind: "public_api",
      minIntervalMinutes: 0,
      async fetch() {
        return {
          postings: [
            raw({ externalId: "arbeitnow:a", title: "Don't see your role but inspired to apply?", location: "Lagos, Nigeria" }),
            raw({ externalId: "arbeitnow:b", title: "Backend Engineer", location: "Lagos, Nigeria", applyUrl: "https://jobs.example.com/b" }),
          ],
          scopes: [{ scopeKey: "arbeitnow:", ok: true, complete: true }],
        };
      },
    };
    const report = await runIngestion({
      dryRun: true,
      now: NOW,
      http: new HttpClient({ fetchImpl: (async () => new Response("")) as unknown as typeof fetch }),
      breakers: new CircuitBreakerRegistry(),
      tieBreaker: new EligibilityTieBreaker({ enabled: false }),
      feeds: [feed],
      sampleSize: 5,
    });
    expect(report.totals).toMatchObject({ fetched: 2, eligible: 1, rejected: 1 });
    expect(report.sample?.map((item) => item.title)).toEqual(["Backend Engineer"]);
  });
});
