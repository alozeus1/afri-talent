import { parseProfilePeriod } from "@/lib/profile-period";

describe("parseProfilePeriod", () => {
  it("preserves an end-only month", () => {
    expect(parseProfilePeriod("– 2025-06")).toEqual({
      start: "",
      end: "2025-06",
      isPresent: false,
    });
  });

  it("parses legacy ASCII-separated year ranges", () => {
    expect(parseProfilePeriod("2018 - 2022")).toEqual({
      start: "2018-01",
      end: "2022-01",
      isPresent: false,
    });
  });

  it("parses current roles without assigning an end month", () => {
    expect(parseProfilePeriod("2022-03 – Present")).toEqual({
      start: "2022-03",
      end: "",
      isPresent: true,
    });
  });
});
