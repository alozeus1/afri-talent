// ─────────────────────────────────────────────────────────────────────────────
// Agent 3 — BlogWriterAgent
//
// Uses Claude Sonnet to synthesize verified content into a professional,
// AfriTalent-branded weekly blog post in markdown format.
//
// Post structure:
//   Intro → 3–5 Key Trends → Africa Spotlight → Actionable Takeaways → Sources
//
// Every stat or claim must have an inline citation: [Source Name](url)
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { nanoid } from "nanoid";
import logger from "../../logger.js";
import type { VerifiedContent, DraftPost } from "../types.js";
import { BLOG_CATEGORY } from "../types.js";

const log = logger.child({ agent: "BlogWriterAgent" });

const QUAL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not set — BlogWriterAgent unavailable");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Zod output schema ─────────────────────────────────────────────────────────

const DraftPostSchema = z.object({
  title: z.string().min(10).max(120),
  excerpt: z.string().min(50).max(300),
  content: z.string().min(500),
  topicKeywords: z.array(z.string()).min(1).max(8),
  estimatedReadMinutes: z.number().int().min(1).max(20),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
    })
  ),
});

// ── Slug generation ───────────────────────────────────────────────────────────

function toSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, "");
  return `${base}-${nanoid(6)}`;
}

// ── Week label helper ─────────────────────────────────────────────────────────

function weekLabel(date: Date): string {
  const month = date.toLocaleString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `Week of ${month} ${day}, ${year}`;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const BLOG_WRITER_SYSTEM = `You are the lead content writer for AfriTalent, Africa's premier platform connecting African tech professionals to global remote job opportunities.

Your audience: African software engineers, designers, product managers, and data professionals who want to work remotely for international companies. They are ambitious, tech-savvy, and hungry for accurate, actionable information about the global job market.

Your writing style:
- Authoritative yet encouraging — be a trusted industry voice, not a hype machine
- Data-driven: every claim must cite a source using markdown link syntax [Source Name](url)
- Africa-first lens: always connect global trends back to what they mean for African talent
- Practical: end with actionable steps readers can take this week
- Professional: clean formatting, no jargon bloat, no filler

You will receive a list of verified items. Each has a TYPE:
- article       → citable editorial/news content; may appear in ## Sources
- job_listing   → a live job posting; treat ONLY as a market demand signal (e.g. "companies like X are hiring for Y"). NEVER cite job listings in ## Sources.
- internal_data → AfriTalent platform data; cite as "AfriTalent platform data"

Synthesize them into ONE compelling weekly blog post.

MANDATORY blog structure (use these exact markdown headings):

## Introduction
[2–3 sentences: frame the week's theme, hook the reader]

## Key Trend [N]: [Trend Name]
[Repeat for 3–5 distinct trends. Each trend: 1 paragraph with inline citations + 1–3 bullet points of key data]

## Africa Spotlight
[1–2 paragraphs specifically connecting the week's trends to African tech professionals. Include AfriTalent platform data if provided.]

## Actionable Takeaways This Week
[Bullet list of 4–6 specific, concrete steps readers can take: job search tips, skill focuses, networking actions]

## Sources
[Markdown list of all cited sources with links]

RULES:
- Title must include the week date (e.g., "Weekly Remote Jobs Digest — May 5, 2025")
- Use bold (**text**) for key statistics and company names
- Keep total word count between 600–900 words
- estimatedReadMinutes = ceil(word_count / 200)
- topicKeywords: 4–8 keywords that describe the post for image search (e.g., ["Africa remote work", "tech jobs", "hiring trends"])
- Return ONLY valid JSON, no prose, no markdown fences

Output schema:
{
  "title": string,
  "excerpt": string (1–2 sentence summary, 50–200 chars),
  "content": string (full markdown post),
  "topicKeywords": string[],
  "estimatedReadMinutes": number,
  "sources": [{"name": string, "url": string}]
}`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function BlogWriterAgent(
  content: VerifiedContent[],
  weekOf: Date
): Promise<DraftPost> {
  if (content.length === 0) {
    throw new Error("BlogWriterAgent: no verified content to write from");
  }

  log.info({ contentCount: content.length, weekOf: weekOf.toISOString() }, "[BlogWriterAgent] starting");

  const client = getClient();

  const sourcesBlock = content
    .map(
      (item) =>
        `SOURCE: ${item.sourceName} (${item.sourceDomain})\n` +
        `TYPE: ${item.sourceType}\n` +
        `URL: ${item.url}\n` +
        `TITLE: ${item.title}\n` +
        `EXCERPT: ${item.excerpt}\n` +
        `KEY FACTS: ${item.keyFacts.join(" | ")}\n` +
        `CREDIBILITY SCORE: ${item.credibilityScore}/100\n`
    )
    .join("\n---\n");

  const userContent =
    `Week to cover: ${weekLabel(weekOf)}\n\n` +
    `VERIFIED SOURCES (${content.length} items):\n\n` +
    sourcesBlock;

  const response = await client.messages.create({
    model: QUAL,
    max_tokens: 4096,
    // Low-but-nonzero: keep the prose engaging while staying anchored to the
    // provided facts and citations.
    temperature: 0.4,
    system: BLOG_WRITER_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const responseContent = response.content[0];
  if (responseContent.type !== "text") {
    throw new Error("BlogWriterAgent: non-text response from Claude");
  }

  const fenced = responseContent.text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = JSON.parse(fenced ? fenced[1].trim() : responseContent.text.trim());
  const validated = DraftPostSchema.parse(raw);

  const slug = toSlug(validated.title);

  log.info(
    {
      title: validated.title,
      slug,
      wordCount: validated.content.split(/\s+/).length,
      readMinutes: validated.estimatedReadMinutes,
      sourceCount: validated.sources.length,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
    "[BlogWriterAgent] post written"
  );

  return {
    ...validated,
    slug,
    category: BLOG_CATEGORY,
  };
}
