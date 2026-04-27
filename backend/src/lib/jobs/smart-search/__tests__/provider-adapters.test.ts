import { describe, expect, it } from "vitest";
import {
  createProviderAdapter,
  isCareerProvider,
  providerImplemented,
  SUPPORTED_CAREER_PROVIDERS,
} from "../provider-adapters.js";

describe("career provider adapters", () => {
  it("defines implemented and stub ATS providers without enabling unsupported scraping", () => {
    expect(SUPPORTED_CAREER_PROVIDERS).toEqual(expect.arrayContaining([
      "GREENHOUSE",
      "WORKDAY",
      "ICIMS",
      "SAP_SUCCESSFACTORS",
      "ORACLE_TALEO",
      "ADP",
    ]));
    expect(isCareerProvider("workday")).toBe(true);
    expect(providerImplemented("GREENHOUSE")).toBe(true);
    expect(providerImplemented("WORKDAY")).toBe(false);
  });

  it("normalizes implemented provider records to the common NormalizedJob contract", () => {
    const adapter = createProviderAdapter("GREENHOUSE");
    const job = adapter.normalize({
      id: "123",
      title: "Security Engineer",
      companyName: "Acme",
      description: "Cloud security and incident response.",
      url: "https://example.com/jobs/123",
    });

    expect(job).toMatchObject({
      externalId: "123",
      provider: "GREENHOUSE",
      companyName: "Acme",
      title: "Security Engineer",
      applyUrl: "https://example.com/jobs/123",
    });
  });

  it("throws for provider stubs until explicit adapters are implemented", () => {
    const adapter = createProviderAdapter("WORKDAY");
    expect(adapter.implemented).toBe(false);
    expect(() => adapter.normalize({})).toThrow(/WORKDAY adapter is defined but not implemented/);
  });
});
