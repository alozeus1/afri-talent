// §4.5 — normalize.ts unit tests.

import { describe, expect, it } from "vitest";
import {
  normalizeCompany,
  normalizeTitle,
  normalizeLocation,
} from "../lib/jobs/normalize.js";

describe("normalizeCompany", () => {
  it("title-cases generic names", () => {
    expect(normalizeCompany("acme widgets")).toBe("Acme Widgets");
    expect(normalizeCompany("ACME WIDGETS")).toBe("Acme Widgets");
  });

  it("applies known brand overrides regardless of input casing", () => {
    expect(normalizeCompany("fivetran")).toBe("Fivetran");
    expect(normalizeCompany("FIVETRAN")).toBe("Fivetran");
    expect(normalizeCompany("reddit")).toBe("Reddit");
    expect(normalizeCompany("eBay")).toBe("eBay");
    expect(normalizeCompany("paypal")).toBe("PayPal");
    expect(normalizeCompany("github")).toBe("GitHub");
    expect(normalizeCompany("hubspot")).toBe("HubSpot");
    expect(normalizeCompany("openai")).toBe("OpenAI");
    expect(normalizeCompany("mongodb")).toBe("MongoDB");
    expect(normalizeCompany("nvidia")).toBe("NVIDIA");
    expect(normalizeCompany("aws")).toBe("AWS");
    expect(normalizeCompany("ibm")).toBe("IBM");
    expect(normalizeCompany("mtn")).toBe("MTN");
  });

  it("preserves already-correct mixed-case brands", () => {
    expect(normalizeCompany("DoorDash")).toBe("DoorDash");
    expect(normalizeCompany("PostgreSQL")).toBe("PostgreSQL");
  });

  it("strips corporate suffixes", () => {
    expect(normalizeCompany("Acme, Inc.")).toBe("Acme");
    expect(normalizeCompany("Globex LLC")).toBe("Globex");
    expect(normalizeCompany("Initech GmbH")).toBe("Initech");
  });

  it("handles empty / null input", () => {
    expect(normalizeCompany(null)).toBe("");
    expect(normalizeCompany(undefined)).toBe("");
    expect(normalizeCompany("   ")).toBe("");
  });

  it("compacts whitespace", () => {
    expect(normalizeCompany("  acme   widgets  ")).toBe("Acme Widgets");
  });
});

describe("normalizeTitle (dedup form)", () => {
  it("lowercases and strips trailing punctuation", () => {
    expect(normalizeTitle("Senior Backend Engineer")).toBe("backend engineer");
    expect(normalizeTitle("Lead Product Designer")).toBe("product designer");
  });

  it("strips seniority prefixes", () => {
    expect(normalizeTitle("Sr. Software Engineer")).toBe("software engineer");
    expect(normalizeTitle("Jr. Data Analyst")).toBe("data analyst");
    expect(normalizeTitle("Staff Engineer")).toBe("engineer");
    expect(normalizeTitle("Principal Architect")).toBe("architect");
    expect(normalizeTitle("Head of Product")).toBe("product");
  });

  it("strips trailing levels", () => {
    expect(normalizeTitle("Engineer II")).toBe("engineer");
    expect(normalizeTitle("Designer 2")).toBe("designer");
  });

  it("drops trailing parens and qualifiers after a dash", () => {
    expect(normalizeTitle("Backend Engineer (React, TypeScript)")).toBe("backend engineer");
    expect(normalizeTitle("Software Engineer — Platform")).toBe("software engineer");
    expect(normalizeTitle("Engineer - Growth")).toBe("engineer");
  });

  it("treats em-dashes and pipes as separators", () => {
    expect(normalizeTitle("Senior PM | Payments")).toBe("pm");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTitle(null)).toBe("");
    expect(normalizeTitle("")).toBe("");
  });
});

describe("normalizeLocation", () => {
  it("parses city, region, country triples", () => {
    const loc = normalizeLocation("San Francisco, CA, USA");
    expect(loc.city).toBe("San Francisco");
    expect(loc.region).toBe("CA");
    expect(loc.country).toBe("United States");
  });

  it("parses city and country pairs", () => {
    const loc = normalizeLocation("Lagos, Nigeria");
    expect(loc.city).toBe("Lagos");
    expect(loc.country).toBe("Nigeria");
    expect(loc.region).toBeNull();
  });

  it("recognises remote with no city", () => {
    const loc = normalizeLocation("Remote");
    expect(loc.workArrangement).toBe("REMOTE");
    expect(loc.city).toBeNull();
    expect(loc.country).toBeNull();
    expect(loc.display).toBe("Remote");
  });

  it("strips remote hint from compound strings", () => {
    const loc = normalizeLocation("Remote, Nigeria");
    expect(loc.workArrangement).toBe("REMOTE");
    expect(loc.country).toBe("Nigeria");
  });

  it("honours explicit hint over text detection", () => {
    const loc = normalizeLocation("Lagos, Nigeria", "remote");
    expect(loc.workArrangement).toBe("REMOTE");
  });

  it("detects hybrid in parens", () => {
    const loc = normalizeLocation("London, UK (Hybrid)");
    expect(loc.workArrangement).toBe("HYBRID");
    expect(loc.country).toBe("United Kingdom");
  });

  it("expands country aliases", () => {
    expect(normalizeLocation("Dubai, UAE").country).toBe("United Arab Emirates");
    expect(normalizeLocation("Boston, US").country).toBe("United States");
  });

  it("handles empty input", () => {
    const loc = normalizeLocation(null);
    expect(loc.display).toBe("");
    expect(loc.workArrangement).toBeNull();
  });
});
