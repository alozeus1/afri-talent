// ─────────────────────────────────────────────────────────────────────────────
// Agent 1 — ContentSourceAgent
//
// Gathers raw articles and hiring trend data from multiple trusted public APIs
// and the internal AfriTalent job database. All sources are free or key-optional.
//
// Sources:
//   • Hacker News Firebase API — "Ask HN: Who is Hiring?" threads (no key)
//   • Dev.to API — top remote/tech articles (no key)
//   • WeWorkRemotely RSS feed — remote job blog (no key)
//   • Remote.co RSS feed — remote work news (no key)
//   • NewsAPI — global hiring trend headlines (key optional)
//   • Internal DB — top skills/categories from the last 7 days of ingested jobs
// ─────────────────────────────────────────────────────────────────────────────

import { parseStringPromise } from "xml2js";
import prisma from "../../prisma.js";
import logger from "../../logger.js";
import type { RawContent } from "../types.js";
import { AFRICA_RELEVANCE_KEYWORDS } from "../types.js";

const log = logger.child({ agent: "ContentSourceAgent" });

// ── Relevance scoring ─────────────────────────────────────────────────────────

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of AFRICA_RELEVANCE_KEYWORDS) {
    if (lower.includes(kw)) score += 10;
  }
  return Math.min(score, 100);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

// ── Hacker News — "Ask HN: Who is Hiring?" ───────────────────────────────────

interface HNStory {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  time?: number;
}

async function fetchHackerNews(): Promise<RawContent[]> {
  const results: RawContent[] = [];
  try {
    const topStoriesUrl = "https://hacker-news.firebaseio.com/v0/topstories.json";
    const resp = await fetch(topStoriesUrl, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`HN topstories HTTP ${resp.status}`);

    const ids = (await resp.json()) as number[];
    // Check first 80 stories for hiring/remote/tech jobs content
    const sample = ids.slice(0, 80);

    const storyFetches = sample.map(async (id) => {
      try {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!r.ok) return null;
        return (await r.json()) as HNStory;
      } catch {
        return null;
      }
    });

    const stories = (await Promise.all(storyFetches)).filter(Boolean) as HNStory[];

    for (const story of stories) {
      if (!story.title) continue;
      const titleLower = story.title.toLowerCase();
      const isRelevant =
        titleLower.includes("hiring") ||
        titleLower.includes("remote") ||
        titleLower.includes("developer") ||
        titleLower.includes("engineer") ||
        titleLower.includes("jobs") ||
        titleLower.includes("talent") ||
        titleLower.includes("africa");

      if (!isRelevant) continue;

      const url = story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
      const excerpt = story.text
        ? story.text.replace(/<[^>]+>/g, "").slice(0, 300)
        : story.title;

      const relevanceScore = scoreRelevance(story.title + " " + excerpt);
      if (relevanceScore < 10) continue;

      results.push({
        title: story.title,
        url,
        excerpt,
        sourceName: "Hacker News",
        sourceDomain: "news.ycombinator.com",
        publishedAt: story.time
          ? new Date(story.time * 1000).toISOString()
          : new Date().toISOString(),
        relevanceScore,
      });
    }

    log.info({ count: results.length }, "[ContentSourceAgent] HN fetch complete");
  } catch (err) {
    log.warn({ err }, "[ContentSourceAgent] HN fetch failed, continuing");
  }
  return results;
}

// ── Dev.to API ────────────────────────────────────────────────────────────────

interface DevToArticle {
  id: number;
  title: string;
  description: string;
  url: string;
  published_at: string;
  tag_list: string[];
}

async function fetchDevTo(): Promise<RawContent[]> {
  const results: RawContent[] = [];
  try {
    const tags = ["remote", "career", "jobs", "hiring", "webdev"];
    for (const tag of tags) {
      const resp = await fetch(
        `https://dev.to/api/articles?tag=${tag}&per_page=10&top=7`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!resp.ok) continue;

      const articles = (await resp.json()) as DevToArticle[];
      for (const article of articles) {
        const relevanceScore = scoreRelevance(article.title + " " + article.description);
        if (relevanceScore < 10) continue;

        results.push({
          title: article.title,
          url: article.url,
          excerpt: article.description?.slice(0, 300) || article.title,
          sourceName: "Dev.to",
          sourceDomain: "dev.to",
          publishedAt: article.published_at,
          relevanceScore,
        });
      }
    }
    log.info({ count: results.length }, "[ContentSourceAgent] Dev.to fetch complete");
  } catch (err) {
    log.warn({ err }, "[ContentSourceAgent] Dev.to fetch failed, continuing");
  }
  return results;
}

// ── WeWorkRemotely RSS ────────────────────────────────────────────────────────

async function fetchRssFeed(
  url: string,
  sourceName: string,
  sourceDomain: string
): Promise<RawContent[]> {
  const results: RawContent[] = [];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`RSS HTTP ${resp.status}`);

    const xml = await resp.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });

    const channel = parsed?.rss?.channel;
    if (!channel) return results;

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);

    for (const item of items.slice(0, 15)) {
      const title = item.title?._cdata ?? item.title ?? "";
      const link = item.link ?? "";
      const description = (item.description?._cdata ?? item.description ?? "")
        .replace(/<[^>]+>/g, "")
        .slice(0, 300);
      const pubDate = item.pubDate ?? new Date().toISOString();

      const relevanceScore = scoreRelevance(title + " " + description);
      if (relevanceScore < 5) continue;

      results.push({
        title,
        url: link,
        excerpt: description || title,
        sourceName,
        sourceDomain,
        publishedAt: new Date(pubDate).toISOString(),
        relevanceScore,
      });
    }

    log.info({ source: sourceName, count: results.length }, "[ContentSourceAgent] RSS fetch complete");
  } catch (err) {
    log.warn({ err, source: sourceName }, "[ContentSourceAgent] RSS fetch failed, continuing");
  }
  return results;
}

// ── NewsAPI ───────────────────────────────────────────────────────────────────

interface NewsAPIArticle {
  title: string;
  description: string | null;
  url: string;
  source: { name: string };
  publishedAt: string;
}

async function fetchNewsAPI(): Promise<RawContent[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];

  const results: RawContent[] = [];
  const queries = [
    "remote work hiring Africa technology",
    "global tech talent shortage 2025",
    "African developer jobs remote",
  ];

  try {
    for (const q of queries) {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", q);
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", "10");
      url.searchParams.set("language", "en");
      url.searchParams.set("apiKey", apiKey);

      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) continue;

      const data = (await resp.json()) as { articles: NewsAPIArticle[] };
      for (const article of data.articles ?? []) {
        if (!article.url || !article.title || article.title === "[Removed]") continue;

        const text = article.title + " " + (article.description ?? "");
        const relevanceScore = scoreRelevance(text);

        results.push({
          title: article.title,
          url: article.url,
          excerpt: article.description?.slice(0, 300) ?? article.title,
          sourceName: article.source.name,
          sourceDomain: domainOf(article.url),
          publishedAt: article.publishedAt,
          relevanceScore,
        });
      }
    }
    log.info({ count: results.length }, "[ContentSourceAgent] NewsAPI fetch complete");
  } catch (err) {
    log.warn({ err }, "[ContentSourceAgent] NewsAPI fetch failed, continuing");
  }
  return results;
}

// ── Internal DB trends ────────────────────────────────────────────────────────

async function fetchInternalTrends(weekOf: Date): Promise<RawContent[]> {
  try {
    const since = new Date(weekOf.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Top job categories in the last 7 days
    const recentJobs = await prisma.job.findMany({
      where: {
        createdAt: { gte: since },
        publishedAt: { not: null },
      },
      select: { title: true, location: true, tags: true },
      take: 200,
    });

    if (recentJobs.length === 0) return [];

    // Build a trend summary as a synthetic content item
    const locationCounts: Record<string, number> = {};
    const skillCounts: Record<string, number> = {};

    for (const job of recentJobs) {
      const loc = job.location?.toLowerCase() || "unknown";
      if (loc.includes("remote")) locationCounts["Remote"] = (locationCounts["Remote"] ?? 0) + 1;

      if (Array.isArray(job.tags)) {
        for (const skill of job.tags.slice(0, 5)) {
          skillCounts[skill] = (skillCounts[skill] ?? 0) + 1;
        }
      }
    }

    const topSkills = Object.entries(skillCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([skill]) => skill);

    const remoteCount = locationCounts["Remote"] ?? 0;
    const remotePercent = Math.round((remoteCount / recentJobs.length) * 100);

    const excerpt =
      `AfriTalent internal data: ${recentJobs.length} jobs listed in the past 7 days. ` +
      `${remotePercent}% are remote-friendly. ` +
      `Top in-demand skills: ${topSkills.slice(0, 5).join(", ")}.`;

    return [
      {
        title: `AfriTalent Weekly Snapshot: ${recentJobs.length} New Jobs, Top Skills: ${topSkills.slice(0, 3).join(", ")}`,
        url: "https://afritalent.io/jobs",
        excerpt,
        sourceName: "AfriTalent Platform",
        sourceDomain: "afritalent.io",
        publishedAt: weekOf.toISOString(),
        relevanceScore: 100,
      },
    ];
  } catch (err) {
    log.warn({ err }, "[ContentSourceAgent] internal DB trend query failed, continuing");
    return [];
  }
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function deduplicate(items: RawContent[]): RawContent[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.url.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function ContentSourceAgent(weekOf: Date): Promise<RawContent[]> {
  log.info({ weekOf: weekOf.toISOString() }, "[ContentSourceAgent] starting");

  const [hn, devTo, wwr, remoteCo, newsApi, internal] = await Promise.allSettled([
    fetchHackerNews(),
    fetchDevTo(),
    fetchRssFeed(
      "https://weworkremotely.com/remote-jobs.rss",
      "WeWorkRemotely",
      "weworkremotely.com"
    ),
    fetchRssFeed(
      "https://remote.co/remote-jobs/feed/",
      "Remote.co",
      "remote.co"
    ),
    fetchNewsAPI(),
    fetchInternalTrends(weekOf),
  ]);

  const all: RawContent[] = [];
  for (const result of [hn, devTo, wwr, remoteCo, newsApi, internal]) {
    if (result.status === "fulfilled") all.push(...result.value);
  }

  const unique = deduplicate(all);

  // Keep at most 30 items sorted by relevance desc to limit token cost in Agent 2
  const top = unique
    .filter((i) => i.relevanceScore >= 10)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 30);

  log.info(
    { total: all.length, unique: unique.length, passing: top.length },
    "[ContentSourceAgent] done"
  );

  return top;
}
