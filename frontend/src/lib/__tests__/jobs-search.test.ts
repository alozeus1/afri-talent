import {
  buildJobsHref,
  hasActiveJobFilters,
  parseJobSearchState,
  toJobListParams,
} from "@/lib/jobs-search";

describe("jobs-search helpers", () => {
  it("parses search params into stable filter state", () => {
    expect(
      parseJobSearchState({
        search: "backend engineer",
        location: "Kenya",
        remote: "true",
        page: "3",
      }),
    ).toEqual({
      search: "backend engineer",
      location: "Kenya",
      type: "",
      jobField: "",
      workplaceType: "",
      seniority: "",
      visaSponsorship: "",
      relocationAssistance: "",
      hiresFromAfrica: "",
      remote: "true",
      sortBy: "relevance",
      page: 3,
      limit: 12,
    });
  });

  it("builds compact hrefs and strips default values", () => {
    expect(
      buildJobsHref({
        search: "platform",
        location: "Remote",
        jobField: "Healthcare",
        workplaceType: "REMOTE",
        remote: "true",
        page: 1,
        limit: 12,
      }),
    ).toBe("/jobs?search=platform&location=Remote&jobField=Healthcare&workplaceType=REMOTE&remote=true");
  });

  it("converts filter state to API params and detects active filters", () => {
    const state = parseJobSearchState({
      visaSponsorship: "YES",
      page: "2",
      limit: "24",
    });

    expect(hasActiveJobFilters(state)).toBe(true);
    expect(toJobListParams(state)).toEqual({
      search: undefined,
      location: undefined,
      type: undefined,
      jobField: undefined,
      workplaceType: undefined,
      seniority: undefined,
      visaSponsorship: "YES",
      relocationAssistance: undefined,
      remote: undefined,
      page: 2,
      limit: 24,
    });
  });

  it("maps the legacy filter=remote|visa alias onto real filters", () => {
    expect(parseJobSearchState({ filter: "remote" })).toMatchObject({ remote: "true", visaSponsorship: "" });
    expect(parseJobSearchState({ filter: "visa" })).toMatchObject({ visaSponsorship: "YES", remote: "" });
    // Explicit params win over the alias.
    expect(parseJobSearchState({ filter: "visa", visaSponsorship: "NO" }).visaSponsorship).toBe("NO");
    expect(parseJobSearchState({ filter: "unknown" })).toMatchObject({ remote: "", visaSponsorship: "" });
  });

  it("parses, serializes and forwards sortBy, dropping the relevance default", () => {
    expect(parseJobSearchState({ sortBy: "newest" }).sortBy).toBe("newest");
    expect(parseJobSearchState({ sortBy: "salary" }).sortBy).toBe("salary");
    expect(parseJobSearchState({ sortBy: "bogus" }).sortBy).toBe("relevance");
    expect(parseJobSearchState({}).sortBy).toBe("relevance");

    expect(buildJobsHref({ search: "go", sortBy: "newest" })).toBe("/jobs?search=go&sortBy=newest");
    expect(buildJobsHref({ search: "go", sortBy: "relevance" })).toBe("/jobs?search=go");

    expect(toJobListParams(parseJobSearchState({ sortBy: "salary" })).sortBy).toBe("salary");
    expect(toJobListParams(parseJobSearchState({})).sortBy).toBeUndefined();
  });

  it("forwards hiresFromAfrica to API params", () => {
    expect(toJobListParams(parseJobSearchState({ hiresFromAfrica: "true" })).hiresFromAfrica).toBe("true");
    expect(buildJobsHref({ hiresFromAfrica: "true" })).toBe("/jobs?hiresFromAfrica=true");
  });
});
