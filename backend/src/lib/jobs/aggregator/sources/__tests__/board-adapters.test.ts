import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GreenhouseSource } from "../greenhouse.js";
import { LeverSource } from "../lever.js";
import { WorkableSource } from "../workable.js";

describe("Job board adapter normalization", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes Greenhouse jobs with visa/relocation metadata", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: 101,
            title: "Senior TypeScript Engineer",
            content: "<p>Visa sponsorship available. Relocation support. React + TypeScript.</p>",
            updated_at: recentDate,
            absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
            location: { name: "Remote" },
            metadata: [{ name: "Employment Type", value: "Full-time" }],
          },
        ],
      }),
    });

    const source = new GreenhouseSource(["acme"]);
    const result = await source.fetchJobs({
      keywords: ["typescript"],
      remote: true,
      postedWithinDays: 30,
      limit: 10,
    });

    expect(result.source).toBe("GREENHOUSE");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalId).toContain("greenhouse-acme-101");
    expect(result.jobs[0].locationType).toBe("remote");
    expect(result.jobs[0].visaSponsorship).toBe("YES");
    expect(result.jobs[0].relocationAssistance).toBe(true);
    expect(result.jobs[0].skills).toEqual(expect.arrayContaining(["typescript", "react"]));
  });

  it("imports non-technical roles that match the broader keyword set", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: 202,
            title: "Accountant",
            content:
              "<p>Partner with engineering, product, and developer teams on month-end close.</p>",
            updated_at: recentDate,
            absolute_url: "https://boards.greenhouse.io/acme/jobs/202",
            location: { name: "Remote - USA" },
            metadata: [{ name: "Employment Type", value: "Full-time" }],
          },
        ],
      }),
    });

    const source = new GreenhouseSource(["acme"]);
    const result = await source.fetchJobs({
      keywords: ["accountant", "developer", "software engineer"],
      remote: true,
      postedWithinDays: 30,
      limit: 10,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].title).toBe("Accountant");
  });

  it("normalizes Lever jobs and maps commitment into jobType", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "lever-1",
          text: "Frontend Developer",
          descriptionPlain: "No visa sponsorship. Strong JavaScript and Vue required.",
          hostedUrl: "https://jobs.lever.co/beta/lever-1",
          createdAt: Date.now(),
          categories: {
            location: "Nairobi, Kenya",
            commitment: "Part-time",
          },
        },
      ],
    });

    const source = new LeverSource(["beta"]);
    const result = await source.fetchJobs({
      keywords: [],
      limit: 10,
    });

    expect(result.source).toBe("LEVER");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].externalId).toContain("lever-beta-lever-1");
    expect(result.jobs[0].jobType).toBe("Part-time");
    expect(result.jobs[0].locationType).toBe("onsite");
    expect(result.jobs[0].visaSponsorship).toBe("NO");
  });

  it("captures Workable upstream errors without crashing the adapter", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const source = new WorkableSource([{ account: "example-org", token: "token-1" }]);
    const result = await source.fetchJobs({
      keywords: [],
      limit: 10,
    });

    expect(result.source).toBe("WORKABLE");
    expect(result.jobs).toHaveLength(0);
    expect(result.totalFound).toBe(0);
    expect(result.errors?.[0]).toContain("HTTP 500");
  });
});
