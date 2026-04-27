import { describe, expect, it } from "vitest";
import { resolveSourceCatalog } from "./index.js";
import { classifyJobField } from "./taxonomy.js";
import { parseCompanyCareerSourceConfigs } from "./sources/company-careers.js";

describe("resolveSourceCatalog", () => {
  it("merges configured tokens with curated defaults and de-duplicates", () => {
    const resolved = resolveSourceCatalog("reddit, custom-board, coinbase", ["coinbase", "reddit", "canonical"]);

    expect(resolved).toEqual(["reddit", "custom-board", "coinbase", "canonical"]);
  });

  it("returns only configured tokens when curated defaults are disabled", () => {
    const resolved = resolveSourceCatalog("reddit, custom-board", ["coinbase", "canonical"], {
      includeDefaults: false,
    });

    expect(resolved).toEqual(["reddit", "custom-board"]);
  });
});

describe("job field taxonomy", () => {
  it("classifies non-technical occupations for broader discovery", () => {
    expect(classifyJobField({ title: "Registered Nurse", description: "Clinical patient care" })).toBe("Healthcare");
    expect(classifyJobField({ title: "Senior Accountant", description: "Audit and payroll" })).toBe("Accounting");
    expect(classifyJobField({ title: "Data Analyst", description: "SQL dashboards and product analytics" })).toBe("Data");
    expect(classifyJobField({ title: "Supply Chain Manager", description: "Procurement and logistics" })).toBe("Logistics");
  });
});

describe("parseCompanyCareerSourceConfigs", () => {
  it("normalizes direct company career sources and keeps configured sources above defaults", () => {
    const resolved = parseCompanyCareerSourceConfigs(
      JSON.stringify([
        {
          provider: "generic",
          companyName: "Example Health",
          providerKey: "https://example.com/careers",
          careersUrl: "https://example.com/careers",
          targetFields: ["Healthcare"],
        },
      ]),
      [
        {
          provider: "LEVER",
          companyName: "Default Co",
          providerKey: "default-co",
          careersUrl: "https://jobs.lever.co/default-co",
        },
      ],
    );

    expect(resolved).toEqual([
      {
        provider: "LEVER",
        companyName: "Default Co",
        providerKey: "default-co",
        careersUrl: "https://jobs.lever.co/default-co",
      },
      {
        provider: "GENERIC",
        companyName: "Example Health",
        providerKey: "https://example.com/careers",
        careersUrl: "https://example.com/careers",
        targetFields: ["Healthcare"],
        enabled: true,
      },
    ]);
  });
});
