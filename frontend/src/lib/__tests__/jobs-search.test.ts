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
      remote: "true",
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
});
