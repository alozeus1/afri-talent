// Feed adapters against payloads recorded from the live public APIs on
// 2026-10-14 (trimmed). No network: a fake fetch serves the fixtures.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HttpClient } from "../http.js";
import {
  arbeitnowFeed,
  jobicyFeed,
  parseHimalayas,
  parseRemoteOk,
  parseRemotive,
  parseWeWorkRemotely,
  remotiveFeed,
  weWorkRemotelyFeed,
  workingNomadsFeed,
} from "../feeds/public-boards.js";
import { ashbyFeed, greenhouseFeed, leverFeed, parseCareerPage, parseSmartRecruiters, workableFeed } from "../feeds/ats.js";
import { parseAdzuna } from "../feeds/adzuna.js";
import { normalizePosting } from "../normalize-posting.js";
import type { FeedFetchContext } from "../types.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), "utf8");
const json = <T>(name: string) => JSON.parse(read(name)) as T;

const NOW = new Date("2026-10-15T00:00:00Z");
const LONG_AGO = new Date("2020-01-01T00:00:00Z");

function fixtureClient(routes: Record<string, string>, robots = ""): { http: HttpClient; requested: string[] } {
  const requested: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("/robots.txt")) return new Response(robots, { status: robots ? 200 : 404 });
    const match = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!match) return new Response("not found", { status: 404 });
    return new Response(read(match[1]), { status: 200 });
  }) as unknown as typeof fetch;
  return { http: new HttpClient({ fetchImpl, sleep: async () => {}, minHostIntervalMs: 0 }), requested };
}

function ctx(http: HttpClient, overrides: Partial<FeedFetchContext> = {}): FeedFetchContext {
  return { http, signal: new AbortController().signal, now: NOW, postedAfter: LONG_AGO, maxPostings: 500, ...overrides };
}

describe("public board parsers", () => {
  it("Remotive: maps candidate_required_location to restrictions", () => {
    const postings = parseRemotive(json("remotive.json"), { postedAfter: LONG_AGO });
    expect(postings.length).toBeGreaterThan(0);
    expect(postings[0]).toMatchObject({ externalId: expect.stringMatching(/^remotive:/), remote: true });
    expect(postings[0].locationRestrictions?.length).toBeGreaterThan(0);
    expect(postings[0].salary?.min).toBeGreaterThan(1000);
  });

  it("RemoteOK: skips the legal notice element and links back to RemoteOK", () => {
    const postings = parseRemoteOk(json("remoteok.json"), { postedAfter: LONG_AGO });
    expect(postings.length).toBe(5);
    for (const posting of postings) expect(posting.applyUrl).toMatch(/remoteok\.com/i);
  });

  it("Himalayas: keeps structured location and timezone restrictions", () => {
    const postings = parseHimalayas(json("himalayas.json"));
    expect(postings.length).toBe(6);
    expect(postings[0].locationRestrictions).toEqual(["Brazil"]);
    expect(postings[0].timezoneRestrictions).toEqual([-5, -4, -3, -2]);
    expect(normalizePosting("himalayas", postings[0], NOW).eligibility.verdict).toBe("ineligible");
  });

  it("We Work Remotely RSS: splits company from title and reads <region>", async () => {
    const postings = await parseWeWorkRemotely(read("weworkremotely.rss"), { postedAfter: LONG_AGO });
    expect(postings.length).toBeGreaterThan(0);
    const first = postings[0];
    expect(first.company).toBe("HR Plus");
    expect(first.title).toMatch(/^Web Developer/);
    expect(normalizePosting("weworkremotely", first, NOW).eligibility.scopes).toEqual(["REMOTE_WORLDWIDE"]);
    const americas = postings.find((posting) => /Americas/.test(posting.location));
    expect(americas && normalizePosting("weworkremotely", americas, NOW).eligibility.verdict).toBe("ineligible");
  });

  it("filters by the posting window", () => {
    const recentOnly = parseRemotive(json("remotive.json"), { postedAfter: new Date("2100-01-01") });
    expect(recentOnly).toEqual([]);
  });
});

describe("feeds through the polite HTTP client (fixtures)", () => {
  it("Remotive is skipped when robots.txt disallows /api/", async () => {
    const { http } = fixtureClient({ "https://remotive.com/api/remote-jobs": "remotive.json" }, "User-agent: *\nDisallow: /api/*");
    await expect(remotiveFeed().fetch(ctx(http))).rejects.toThrow(/robots/);
  });

  it("public JSON/RSS feeds return postings and a single complete scope", async () => {
    const { http } = fixtureClient({
      "https://www.arbeitnow.com/api/job-board-api": "arbeitnow.json",
      "https://jobicy.com/api/v2/remote-jobs": "jobicy.json",
      "https://www.workingnomads.com/api/exposed_jobs/": "workingnomads.json",
      "https://weworkremotely.com/remote-jobs.rss": "weworkremotely.rss",
    });
    for (const feed of [arbeitnowFeed(), jobicyFeed(), workingNomadsFeed(), weWorkRemotelyFeed()]) {
      const result = await feed.fetch(ctx(http));
      expect(result.postings.length, feed.id).toBeGreaterThan(0);
      expect(result.scopes).toHaveLength(1);
      expect(result.scopes[0].ok).toBe(true);
    }
  });

  it("ATS feeds fetch each company as its own scope and isolate failures", async () => {
    const { http } = fixtureClient({
      "https://boards-api.greenhouse.io/v1/boards/gitlab/jobs": "greenhouse-gitlab.json",
      "https://api.lever.co/v0/postings/toptal": "lever-toptal.json",
      "https://api.ashbyhq.com/posting-api/job-board/andela": "ashby-andela.json",
      "https://apply.workable.com/api/v1/widget/accounts/kuda": "workable-kuda.json",
    });
    const companies = [
      { provider: "GREENHOUSE" as const, token: "gitlab", name: "GitLab" },
      { provider: "GREENHOUSE" as const, token: "doesnotexist", name: "Ghost" },
      { provider: "LEVER" as const, token: "toptal", name: "Toptal" },
      { provider: "ASHBY" as const, token: "andela", name: "Andela" },
      { provider: "WORKABLE" as const, token: "kuda", name: "Kuda" },
    ];

    const greenhouse = await greenhouseFeed(companies).fetch(ctx(http));
    expect(greenhouse.scopes.map((scope) => [scope.scopeKey, scope.ok])).toEqual([
      ["greenhouse:gitlab:", true],
      ["greenhouse:doesnotexist:", false],
    ]);
    expect(greenhouse.postings[0]).toMatchObject({ company: "GitLab", externalId: expect.stringMatching(/^greenhouse:gitlab:/) });
    // HTML-escaped Greenhouse content is decoded into readable text.
    const normalized = normalizePosting("greenhouse", greenhouse.postings[0], NOW);
    expect(normalized.job.description).not.toMatch(/&lt;|<div/);

    const lever = await leverFeed(companies).fetch(ctx(http));
    expect(lever.postings[0].location).toMatch(/Canada/);

    const ashby = await ashbyFeed(companies).fetch(ctx(http));
    expect(ashby.postings[0]).toMatchObject({ company: "Andela", remote: true });

    const workable = await workableFeed(companies).fetch(ctx(http));
    const lagos = workable.postings.find((posting) => /Lagos/.test(posting.location));
    expect(lagos && normalizePosting("workable", lagos, NOW).eligibility.scopes).toEqual(["AFRICA_BASED"]);
  });

  it("SmartRecruiters and Adzuna parsers map structured locations", () => {
    const sr = parseSmartRecruiters({ provider: "SMARTRECRUITERS", token: "Canva", name: "Canva" }, json("smartrecruiters-canva.json"));
    expect(sr[0].location).toMatch(/Sydney/);
    const adzuna = parseAdzuna("za", {
      results: [{ id: 1, title: "Accountant", description: "Ledger work", created: "2026-10-10T00:00:00Z", redirect_url: "https://www.adzuna.co.za/x", company: { display_name: "Acme" }, location: { display_name: "Johannesburg, Gauteng" } }],
    });
    expect(normalizePosting("adzuna", adzuna[0], NOW).eligibility.scopes).toEqual(["AFRICA_BASED"]);
  });

  it("career pages: extracts schema.org JobPosting JSON-LD", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "JobPosting",
          title: "Field Engineer",
          identifier: { value: "FE-1" },
          url: "https://acme.example/jobs/fe-1",
          datePosted: "2026-10-01",
          description: "<p>Install solar systems.</p>",
          jobLocation: { address: { addressLocality: "Nairobi", addressCountry: "KE" } },
        },
      ],
    })}</script></head></html>`;
    const postings = parseCareerPage({ provider: "GENERIC", token: "https://acme.example/careers", name: "Acme" }, html);
    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({ title: "Field Engineer", location: "Nairobi, KE" });
    expect(normalizePosting("careerpages", postings[0], NOW).eligibility.verdict).toBe("eligible");
  });
});
