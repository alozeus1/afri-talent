import { describe, expect, it, vi } from "vitest";
import { expandSearchKeywords, getDefaultSmartKeywords } from "../keywords.js";

describe("smart keyword expansion", () => {
  it("expands DevOps intent into adjacent platform roles when enabled", () => {
    vi.stubEnv("SMART_SEARCH_KEYWORD_EXPANSION_ENABLED", "1");
    const result = expandSearchKeywords({
      query: "DevOps Engineer",
      includeExpandedKeywords: true,
    });

    expect(result.enabled).toBe(true);
    expect(result.expanded).toEqual(expect.arrayContaining([
      "platform engineer",
      "sre",
      "cloud engineer",
      "infrastructure engineer",
      "kubernetes engineer",
      "devsecops engineer",
      "ci/cd engineer",
    ]));
    vi.unstubAllEnvs();
  });

  it("does not expand when the feature flag is disabled", () => {
    vi.stubEnv("SMART_SEARCH_KEYWORD_EXPANSION_ENABLED", "0");
    const result = expandSearchKeywords({
      query: "DevOps Engineer",
      includeExpandedKeywords: true,
    });

    expect(result.expanded).toEqual([]);
    expect(result.all).toEqual(["devops engineer"]);
    vi.unstubAllEnvs();
  });

  it("keeps grouped defaults broad across fields", () => {
    expect(getDefaultSmartKeywords()).toEqual(expect.arrayContaining([
      "cybersecurity engineer",
      "nurse practitioner",
      "hvac technician",
      "renewable energy engineer",
    ]));
  });
});
