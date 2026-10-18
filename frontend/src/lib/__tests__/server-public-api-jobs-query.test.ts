import { buildJobsQuery } from "../server-public-api";

describe("buildJobsQuery", () => {
  it("returns an empty string when no params are set", () => {
    expect(buildJobsQuery({})).toBe("");
  });

  it("forwards hiresFromAfrica and a non-default sortBy", () => {
    const query = new URLSearchParams(
      buildJobsQuery({ search: "react", hiresFromAfrica: "true", sortBy: "newest", page: 2, limit: 12 }).slice(1),
    );
    expect(query.get("search")).toBe("react");
    expect(query.get("hiresFromAfrica")).toBe("true");
    expect(query.get("sortBy")).toBe("newest");
    expect(query.get("page")).toBe("2");
    expect(query.get("limit")).toBe("12");
  });

  it("omits sortBy when it is the relevance default", () => {
    expect(buildJobsQuery({ sortBy: "relevance" })).toBe("");
  });

  it("keeps the other mobility filters", () => {
    const query = new URLSearchParams(
      buildJobsQuery({ remote: "true", visaSponsorship: "YES", jobField: "Engineering", workplaceType: "REMOTE" }).slice(1),
    );
    expect(query.get("remote")).toBe("true");
    expect(query.get("visaSponsorship")).toBe("YES");
    expect(query.get("jobField")).toBe("Engineering");
    expect(query.get("workplaceType")).toBe("REMOTE");
  });
});
