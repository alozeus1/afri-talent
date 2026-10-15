import { describe, expect, it } from "vitest";
import {
  detectRelocationText,
  detectVisaSponsorshipText,
  evaluateAfricaEligibility,
  mentionsAfrica,
  parseTimezoneWindow,
} from "../eligibility.js";

const base = { title: "Software Engineer", description: "Build things." };

describe("evaluateAfricaEligibility — deterministic rules", () => {
  it("accepts roles based in African countries and cities", () => {
    expect(evaluateAfricaEligibility({ ...base, location: "Lagos, Nigeria" })).toMatchObject({
      verdict: "eligible",
      scopes: ["AFRICA_BASED"],
    });
    expect(evaluateAfricaEligibility({ ...base, location: "Remote, Kenya", remote: true }).scopes).toEqual(["REMOTE_AFRICA"]);
    expect(evaluateAfricaEligibility({ ...base, location: "Cape Town" }).verdict).toBe("eligible");
  });

  it("accepts remote worldwide / EMEA roles", () => {
    expect(evaluateAfricaEligibility({ ...base, location: "Anywhere in the World", remote: true }).scopes).toEqual(["REMOTE_WORLDWIDE"]);
    expect(evaluateAfricaEligibility({ ...base, location: "Remote - EMEA", remote: true }).scopes).toEqual(["REMOTE_EMEA"]);
    expect(
      evaluateAfricaEligibility({ ...base, location: "Remote", locationRestrictions: ["Worldwide"] }).verdict,
    ).toBe("eligible");
  });

  it("rejects remote roles restricted to non-African regions", () => {
    for (const location of ["Remote - US", "Remote (Canada)", "Remote, Portugal", "Remote - Americas", "North America"]) {
      expect(evaluateAfricaEligibility({ ...base, location, remote: true }).verdict, location).toBe("ineligible");
    }
    expect(
      evaluateAfricaEligibility({ ...base, location: "Remote", remote: true, locationRestrictions: ["USA", "Canada"] }).verdict,
    ).toBe("ineligible");
  });

  it("rejects remote roles whose description restricts residence or work authorisation", () => {
    const result = evaluateAfricaEligibility({
      title: "Support Specialist",
      description: "Fully remote. You must be located in the United States.",
      location: "Remote",
      remote: true,
    });
    expect(result.verdict).toBe("ineligible");
    expect(
      evaluateAfricaEligibility({
        title: "Engineer",
        description: "Candidates must be legally authorized to work in the US.",
        location: "Remote",
        remote: true,
      }).verdict,
    ).toBe("ineligible");
  });

  it("rejects on-site roles abroad unless visa sponsorship or relocation is offered", () => {
    expect(evaluateAfricaEligibility({ ...base, location: "Berlin, Germany" }).verdict).toBe("ineligible");
    expect(
      evaluateAfricaEligibility({ ...base, location: "Berlin, Germany", description: "Visa sponsorship is available for this role." }).scopes,
    ).toEqual(["VISA_SPONSORSHIP"]);
    expect(
      evaluateAfricaEligibility({ ...base, location: "Amsterdam", description: "We offer a relocation package." }).scopes,
    ).toEqual(["RELOCATION"]);
  });

  it("does not let domestic relocation open a remote, country-restricted role", () => {
    expect(
      evaluateAfricaEligibility({
        ...base,
        location: "Remote",
        remote: true,
        locationRestrictions: ["United States"],
        description: "Relocation assistance available.",
      }).verdict,
    ).toBe("ineligible");
  });

  it("uses structured timezone windows", () => {
    expect(evaluateAfricaEligibility({ ...base, location: "Remote", remote: true, timezoneRestrictions: [0, 1, 2] }).scopes).toEqual([
      "REMOTE_TIMEZONE_COMPATIBLE",
    ]);
    expect(evaluateAfricaEligibility({ ...base, location: "Remote", remote: true, timezoneRestrictions: [-8, -7, -6] }).verdict).toBe(
      "ineligible",
    );
    expect(
      evaluateAfricaEligibility({ ...base, location: "Remote (Time zone: CET (+/- 3 hours))", remote: true, locationRestrictions: ["Time zone: CET (+/- 3 hours)"] }).scopes,
    ).toEqual(["REMOTE_TIMEZONE_COMPATIBLE"]);
    expect(evaluateAfricaEligibility({ ...base, location: "Remote (EST)", remote: true }).verdict).toBe("ineligible");
  });

  it("marks remote roles with no scope as uncertain (LLM tie-break candidates)", () => {
    expect(evaluateAfricaEligibility({ ...base, location: "Remote", remote: true }).verdict).toBe("uncertain");
    expect(
      evaluateAfricaEligibility({ ...base, location: "Remote", remote: true, description: "We hire globally and work async." }).verdict,
    ).toBe("eligible");
  });

  it("does not treat Papua New Guinea as Africa", () => {
    expect(mentionsAfrica("Port Moresby, Papua New Guinea")).toBe(false);
    expect(mentionsAfrica("Conakry, Guinea")).toBe(true);
  });
});

describe("visa / relocation text signals", () => {
  it("respects negation", () => {
    expect(detectVisaSponsorshipText("We do not provide visa assistance.")).toBe("NO");
    expect(detectVisaSponsorshipText("Unfortunately we cannot sponsor visas.")).toBe("NO");
    expect(detectVisaSponsorshipText("No visa sponsorship.")).toBe("NO");
    expect(detectVisaSponsorshipText("Visa sponsorship is available.")).toBe("YES");
    expect(detectVisaSponsorshipText("We are a team.")).toBe("UNKNOWN");
    expect(detectRelocationText("Relocation package provided")).toBe(true);
    expect(detectRelocationText("There is no relocation package for this role")).toBe(false);
  });

  it("parses timezone windows", () => {
    expect(parseTimezoneWindow("CET (+/- 3 hours)")).toEqual([-2, 4]);
    expect(parseTimezoneWindow("UTC+1 to UTC+3")).toEqual([0, 4]);
    expect(parseTimezoneWindow("PST")).toEqual([-9, -7]);
    expect(parseTimezoneWindow("Berlin")).toBeNull();
  });
});
