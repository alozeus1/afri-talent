import { describe, expect, it, vi } from "vitest";
import { HttpClient, HttpError, RobotsDisallowedError } from "../http.js";
import { isAllowed, parseRobots } from "../robots.js";
import { CircuitBreakerRegistry, mapWithConcurrency } from "../circuit-breaker.js";

describe("robots.txt", () => {
  const robots = `
User-agent: *
Disallow: /api/*
Allow: /api/public
Disallow: /*?q=
Crawl-delay: 2

User-agent: AfriTalentBot
Disallow: /private
`;

  it("prefers the group naming our product token", () => {
    const policy = parseRobots(robots, "AfriTalentBot");
    expect(isAllowed(policy, "/api/jobs")).toBe(true);
    expect(isAllowed(policy, "/private/x")).toBe(false);
  });

  it("applies longest-match with Allow winning ties, wildcards and query rules", () => {
    const policy = parseRobots(robots, "SomeOtherBot");
    expect(isAllowed(policy, "/api/jobs")).toBe(false);
    expect(isAllowed(policy, "/api/public")).toBe(true);
    expect(isAllowed(policy, "/jobs?q=dev")).toBe(false);
    expect(isAllowed(policy, "/jobs")).toBe(true);
    expect(policy.crawlDelaySeconds).toBe(2);
  });

  it("treats an empty Disallow as allow-all and supports $ anchors", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:", "x"), "/anything")).toBe(true);
    const anchored = parseRobots("User-agent: *\nDisallow: /*.xml$", "x");
    expect(isAllowed(anchored, "/feed.xml")).toBe(false);
    expect(isAllowed(anchored, "/feed.xml?x=1")).toBe(true);
  });
});

function response(status: number, body = "", headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : body, { status, headers });
}

describe("HttpClient", () => {
  const noSleep = async () => {};

  it("sends an identifying User-Agent and honours robots.txt", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return response(200, "User-agent: *\nDisallow: /api/");
      return response(200, "{}");
    });
    const client = new HttpClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, minHostIntervalMs: 0 });
    await expect(client.get("https://example.com/api/jobs")).rejects.toBeInstanceOf(RobotsDisallowedError);
    await client.get("https://example.com/feed.json");
    const [, init] = fetchImpl.mock.calls.at(-1)! as [string, RequestInit];
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/AfriTalentBot/);
  });

  it("treats an unreachable robots.txt (5xx) as disallow-all and 404 as allow-all", async () => {
    const down = new HttpClient({
      fetchImpl: (async () => response(503)) as unknown as typeof fetch,
      sleep: noSleep,
      minHostIntervalMs: 0,
    });
    await expect(down.get("https://down.example/jobs")).rejects.toBeInstanceOf(RobotsDisallowedError);

    const missing = new HttpClient({
      fetchImpl: (async (url: string) => (String(url).endsWith("/robots.txt") ? response(404) : response(200, "ok"))) as unknown as typeof fetch,
      sleep: noSleep,
      minHostIntervalMs: 0,
    });
    await expect(missing.get("https://missing.example/jobs")).resolves.toMatchObject({ status: 200, body: "ok" });
  });

  it("retries 429/5xx with backoff and honours Retry-After, but not 4xx", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const client = new HttpClient({
      fetchImpl: (async () => {
        calls += 1;
        if (calls === 1) return response(429, "", { "retry-after": "3" });
        if (calls === 2) return response(503);
        return response(200, "done");
      }) as unknown as typeof fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      minHostIntervalMs: 0,
      maxRetries: 3,
    });
    const result = await client.get("https://api.example/jobs", { robotsExempt: true });
    expect(result.body).toBe("done");
    expect(calls).toBe(3);
    expect(sleeps[0]).toBe(3000);

    let notFoundCalls = 0;
    const notFound = new HttpClient({
      fetchImpl: (async () => {
        notFoundCalls += 1;
        return response(404);
      }) as unknown as typeof fetch,
      sleep: noSleep,
      minHostIntervalMs: 0,
    });
    await expect(notFound.get("https://api.example/x", { robotsExempt: true })).rejects.toBeInstanceOf(HttpError);
    expect(notFoundCalls).toBe(1);
  });

  it("uses ETag / Last-Modified and returns the cached body on 304", async () => {
    const seen: Array<Record<string, string>> = [];
    let call = 0;
    const client = new HttpClient({
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen.push(init.headers as Record<string, string>);
        call += 1;
        return call === 1 ? response(200, '{"a":1}', { etag: '"v1"', "last-modified": "Tue, 13 Oct 2026 00:00:00 GMT" }) : response(304);
      }) as unknown as typeof fetch,
      sleep: noSleep,
      minHostIntervalMs: 0,
    });
    const first = await client.getJson<{ a: number }>("https://api.example/feed", { robotsExempt: true });
    const second = await client.getJson<{ a: number }>("https://api.example/feed", { robotsExempt: true });
    expect(first).toEqual({ data: { a: 1 }, notModified: false });
    expect(second).toEqual({ data: { a: 1 }, notModified: true });
    expect(seen[1]["If-None-Match"]).toBe('"v1"');
    expect(seen[1]["If-Modified-Since"]).toBe("Tue, 13 Oct 2026 00:00:00 GMT");
  });

  it("stops when the per-source abort signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new HttpClient({ fetchImpl: (async () => response(200)) as unknown as typeof fetch, sleep: noSleep });
    await expect(client.get("https://api.example/x", { robotsExempt: true, signal: controller.signal })).rejects.toThrow(/budget/);
  });
});

describe("CircuitBreakerRegistry", () => {
  it("opens after N consecutive failures, half-opens after cooldown, closes on success", () => {
    const breakers = new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 1000 });
    breakers.recordFailure("x", 0);
    expect(breakers.stateOf("x", 0)).toBe("closed");
    breakers.recordFailure("x", 10);
    expect(breakers.canAttempt("x", 20)).toBe(false);
    expect(breakers.stateOf("x", 1500)).toBe("half_open");
    breakers.recordFailure("x", 1500); // half-open failure re-opens immediately
    expect(breakers.stateOf("x", 1600)).toBe("open");
    breakers.recordSuccess("x", 3000);
    expect(breakers.stateOf("x", 3000)).toBe("closed");
  });

  it("enforces the per-source minimum interval", () => {
    const breakers = new CircuitBreakerRegistry();
    breakers.recordSuccess("remotive", 0);
    expect(breakers.intervalElapsed("remotive", 360, 60 * 60_000)).toBe(false);
    expect(breakers.intervalElapsed("remotive", 360, 361 * 60_000)).toBe(true);
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds the limit and preserves order", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });
});
