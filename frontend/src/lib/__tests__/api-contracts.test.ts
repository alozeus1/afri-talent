import {
  adminAts,
  analyticsEventsApi,
  ats,
  auth,
  billing,
  candidateAnalytics,
  pricing,
  publicStats,
  savedSearches,
} from "../api";

describe("Frontend API contract builders", () => {
  beforeEach(() => {
    // Seed the CSRF cookie so mutating requests don't trigger the lazy
    // /api/auth/me token seeding (fetchAPI ensures a token before writes).
    document.cookie = "afri_csrf=test-csrf-token";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("builds login request with cookie credentials", async () => {
    await auth.login("candidate@example.com", "Password123!");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://localhost:4000/api/auth/login");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({
      email: "candidate@example.com",
      password: "Password123!",
    });
  });

  it("builds regional pricing query params correctly", async () => {
    await pricing.get("AFRICA", "NGN");

    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4000/api/pricing?region=AFRICA&currency=NGN");
  });

  it("posts checkout payload for plan upgrades", async () => {
    await billing.checkout("PROFESSIONAL", "YEARLY");

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://localhost:4000/api/billing/checkout");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      plan: "PROFESSIONAL",
      interval: "YEARLY",
    });
  });

  it("sends analytics event batches using ingestion contract", async () => {
    await analyticsEventsApi.ingest([
      {
        category: "ACQUISITION",
        eventName: "signup_started",
        sessionId: "sess-1",
        path: "/register",
        properties: { role: "candidate" },
      },
    ]);

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://localhost:4000/api/analytics/events");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      events: [
        expect.objectContaining({
          category: "ACQUISITION",
          eventName: "signup_started",
        }),
      ],
    });
  });

  it("loads public hero stats from backend aggregate endpoint", async () => {
    await publicStats.get();
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4000/api/public/stats");
  });

  it("builds ATS credential save requests for employers", async () => {
    await ats.createConnection({
      provider: "LEVER",
      externalOrgId: "acme",
      accessToken: "token-12345678",
      webhookSecret: "secret-123456",
      webhookSyncEnabled: true,
      twoWaySyncEnabled: true,
      metadata: {
        performAsUserId: "member-1",
      },
    });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    expect(url).toBe("http://localhost:4000/api/ats/connections");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual(
      expect.objectContaining({
        provider: "LEVER",
        externalOrgId: "acme",
        webhookSyncEnabled: true,
        twoWaySyncEnabled: true,
      }),
    );
  });

  it("loads ATS fleet operations for admins", async () => {
    await adminAts.dashboard();
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4000/api/admin/ats/dashboard");
  });

  it("loads candidate retention summary from the analytics surface", async () => {
    await candidateAnalytics.retentionSummary();
    const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4000/api/candidate-analytics/retention-summary");
  });

  it("unwraps saved search list responses from the backend route shape", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        savedSearches: [
          {
            id: "search-1",
            name: "Remote backend roles",
          },
        ],
      }),
    } as Response);

    const searches = await savedSearches.list();

    expect(searches).toEqual([
      expect.objectContaining({
        id: "search-1",
        name: "Remote backend roles",
      }),
    ]);
  });
});
