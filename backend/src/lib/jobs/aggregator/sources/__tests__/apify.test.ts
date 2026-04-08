import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApifySource, parseApifyTaskConfigs } from "../apify.js";

describe("ApifySource", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses valid task configuration JSON", () => {
    const tasks = parseApifyTaskConfigs(
      JSON.stringify([
        {
          taskId: "acme~job-feed",
          label: "Acme Feed",
          overrideKeywordsField: "query",
          overrideLimitField: "maxItems",
        },
      ]),
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.taskId).toBe("acme~job-feed");
    expect(tasks[0]?.overrideKeywordsField).toBe("query");
  });

  it("normalizes job items returned from a task run", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "job-1",
          title: "Senior DevOps Engineer",
          companyName: "Remote Rocket",
          location: "Remote - Nigeria",
          description: "Visa sponsorship available. Relocation support. AWS and Terraform.",
          url: "https://example.com/jobs/job-1",
          employmentType: "Full-time",
          postedAt: "2026-04-07T00:00:00.000Z",
          skills: ["AWS", "Terraform"],
        },
      ],
    });

    const source = new ApifySource("token-1", [
      {
        taskId: "acme~job-feed",
        label: "Acme Feed",
        overrideKeywordsField: "query",
        overrideLimitField: "maxItems",
      },
    ]);

    const result = await source.fetchJobs({
      keywords: ["devops"],
      remote: true,
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe("POST");
    expect(result.source).toBe("APIFY");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.company).toBe("Remote Rocket");
    expect(result.jobs[0]?.visaSponsorship).toBe("YES");
    expect(result.jobs[0]?.relocationAssistance).toBe(true);
    expect(result.jobs[0]?.locationType).toBe("remote");
  });

  it("captures upstream failures without crashing", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const source = new ApifySource("token-1", [{ taskId: "acme~job-feed" }]);
    const result = await source.fetchJobs({
      keywords: [],
      limit: 10,
    });

    expect(result.jobs).toHaveLength(0);
    expect(result.errors?.[0]).toContain("HTTP 429");
  });
});
