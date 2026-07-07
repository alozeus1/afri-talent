import { africaEligibility, africaPill, deriveJobTrustLabels } from "@/lib/job-trust-labels";
import type { Job } from "@/lib/api";

const baseJob = {
  id: "j1",
  title: "Backend Engineer",
  slug: "backend-engineer",
  description: "Build APIs",
  location: "Remote",
  type: "Full-time",
  seniority: "Senior",
  tags: [],
  status: "PUBLISHED",
  createdAt: new Date().toISOString(),
  employer: { companyName: "Acme", location: "Lagos" },
} as unknown as Job;

describe("africaEligibility", () => {
  it("confirms when hiresFromAfrica is set", () => {
    const verdict = africaEligibility({ ...baseJob, hiresFromAfrica: true });
    expect(verdict.status).toBe("confirmed");
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });

  it("confirms when an African country is explicitly eligible", () => {
    const verdict = africaEligibility({
      ...baseJob,
      location: "Lagos",
      eligibleCountries: ["NG"],
    });
    expect(verdict.status).toBe("confirmed");
    expect(verdict.reasons[0]).toContain("African countries");
  });

  it("confirms when the listing is explicitly open worldwide", () => {
    const verdict = africaEligibility({
      ...baseJob,
      location: "London",
      eligibleCountries: ["GLOBAL"],
    });
    expect(verdict.status).toBe("confirmed");
    expect(verdict.reasons[0]).toContain("worldwide");
  });

  it("restricts when eligible countries exclude Africa and GLOBAL", () => {
    const verdict = africaEligibility({ ...baseJob, location: "Berlin", eligibleCountries: ["DE", "US"] });
    expect(verdict.status).toBe("restricted");
    expect(verdict.reasons[0]).toContain("DE");
  });

  it("marks remote-but-unstated listings as possible", () => {
    const verdict = africaEligibility({ ...baseJob, workplaceType: "remote" });
    expect(verdict.status).toBe("possible");
  });

  it("falls back to not_confirmed — never guesses", () => {
    const verdict = africaEligibility({ ...baseJob, location: "London" });
    expect(verdict.status).toBe("not_confirmed");
    expect(verdict.headline).toBe("Not confirmed");
  });
});

describe("africaPill", () => {
  it("returns null when hiresFromAfrica is set — the card already shows that badge", () => {
    expect(africaPill({ ...baseJob, hiresFromAfrica: true })).toBeNull();
    expect(africaPill({ ...baseJob, hiresFromAfrica: true, eligibleCountries: ["NG"] })).toBeNull();
  });

  it("shows Open to Africa when confirmed via eligible countries", () => {
    const pill = africaPill({ ...baseJob, location: "Lagos", eligibleCountries: ["NG"] });
    expect(pill).toEqual({ label: "Open to Africa", variant: "success" });
  });

  it("shows Possibly open for remote listings with unstated eligibility", () => {
    const pill = africaPill({ ...baseJob, workplaceType: "remote" });
    expect(pill).toEqual({ label: "Possibly open to Africa", variant: "info" });
  });

  it("warns on region-restricted listings", () => {
    const pill = africaPill({ ...baseJob, location: "Berlin", eligibleCountries: ["DE", "US"] });
    expect(pill).toEqual({ label: "Region-restricted", variant: "warning" });
  });

  it("returns null for not_confirmed — a dense card should make no claim", () => {
    expect(africaPill({ ...baseJob, location: "London" })).toBeNull();
  });
});

describe("deriveJobTrustLabels", () => {
  it("labels salary, confirmed visa, freshness, and source type", () => {
    const labels = deriveJobTrustLabels({
      ...baseJob,
      salaryMin: 50000,
      visaSponsorship: "YES",
      lastCheckedAt: new Date().toISOString(),
      jobSource: "AGGREGATED",
    }).map((l) => l.label);
    expect(labels).toEqual([
      "Salary available",
      "Visa status confirmed",
      "Recently refreshed",
      "External source",
    ]);
  });

  it("shows Apply on AfriTalent for employer-posted jobs without extras", () => {
    const labels = deriveJobTrustLabels({ ...baseJob, jobSource: "EMPLOYER_POSTED" }).map((l) => l.label);
    expect(labels).toEqual(["Apply on AfriTalent"]);
  });

  it("describes publication as publication rather than verification", () => {
    const labels = deriveJobTrustLabels({
      ...baseJob,
      publishedAt: new Date().toISOString(),
      jobSource: "EMPLOYER_POSTED",
    }).map((l) => l.label);
    expect(labels).toEqual(["Recently published", "Apply on AfriTalent"]);
  });

  it("does not claim an unknown source is on-platform", () => {
    const labels = deriveJobTrustLabels(baseJob).map((l) => l.label);
    expect(labels).toEqual(["Source not confirmed"]);
  });
});
