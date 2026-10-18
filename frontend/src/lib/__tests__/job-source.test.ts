import { jobSourceDisplayName } from "@/lib/job-source";

type Input = Parameters<typeof jobSourceDisplayName>[0];

function job(overrides: Partial<Input>): Input {
  return { jobSource: "AGGREGATED", sourceUrl: undefined, discovery: undefined, ...overrides } as Input;
}

describe("jobSourceDisplayName", () => {
  it("maps crawler feed ids to their brand names", () => {
    expect(jobSourceDisplayName(job({ discovery: { sourceNames: ["WEWORKREMOTELY"] } as Input["discovery"] }))).toBe("We Work Remotely");
    expect(jobSourceDisplayName(job({ discovery: { sourceNames: ["greenhouse"] } as Input["discovery"] }))).toBe("Greenhouse");
  });

  it("falls back to the source URL host for unknown feeds", () => {
    expect(
      jobSourceDisplayName(job({ sourceUrl: "https://www.careers.example.org/jobs/1", discovery: { sourceNames: ["CAREERPAGES"] } as Input["discovery"] })),
    ).toBe("careers.example.org");
    expect(jobSourceDisplayName(job({ sourceUrl: "https://boards.greenhouse.io/x/jobs/1" }))).toBe("boards.greenhouse.io");
  });

  it("returns null for employer-posted jobs and when nothing is known", () => {
    expect(jobSourceDisplayName(job({ jobSource: "EMPLOYER_POSTED", discovery: { sourceNames: ["LEVER"] } as Input["discovery"] }))).toBeNull();
    expect(jobSourceDisplayName(job({ sourceUrl: "not a url" }))).toBeNull();
  });
});
