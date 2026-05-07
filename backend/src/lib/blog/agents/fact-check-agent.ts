// ─────────────────────────────────────────────────────────────────────────────
// Agent 2 — FactCheckAgent
//
// Uses Claude to evaluate each raw content item for factual credibility,
// cross-references source domain against a whitelist of authoritative sites,
// and filters out anything below the minimum credibility threshold.
//
// Only items scoring >= CREDIBILITY_THRESHOLD pass through to Agent 3.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import logger from "../../logger.js";
import type { RawContent, VerifiedContent } from "../types.js";
import { CREDIBILITY_WHITELIST } from "../types.js";

const log = logger.child({ agent: "FactCheckAgent" });

const QUAL = process.env.AI_QUALITY_MODEL || "claude-sonnet-4-6";
const CREDIBILITY_THRESHOLD = 60;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not set — FactCheckAgent unavailable");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Zod schema for Claude output ──────────────────────────────────────────────

const FactCheckItemSchema = z.object({
  url: z.string(),
  credibilityScore: z.number().min(0).max(100),
  verificationNotes: z.string(),
  keyFacts: z.array(z.string()),
});

const FactCheckOutputSchema = z.object({
  items: z.array(FactCheckItemSchema),
});

type FactCheckOutput = z.infer<typeof FactCheckOutputSchema>;

// ── System prompt ─────────────────────────────────────────────────────────────

const FACT_CHECK_SYSTEM = `You are FactCheckAgent for AfriTalent, a platform connecting African tech talent to global remote jobs.

Your job: evaluate each provided article for factual credibility and relevance to African professionals seeking remote work globally.

SCORING CRITERIA (0–100):
- 80–100: Well-sourced, verifiable statistics, reputable publisher, directly relevant to remote hiring or African tech talent
- 60–79: Mostly credible, some claims need qualification, relevant topic
- 40–59: Mixed credibility, opinion-heavy, indirect relevance
- 0–39: Unverified claims, low-quality source, or irrelevant to our audience

RULES:
- Be strict: if a claim cannot be verified from the text alone, flag it in verificationNotes
- keyFacts: extract 2–5 specific, cite-able facts or data points from the article (numbers, percentages, named companies, specific countries)
- If an article has NO extractable facts, give it a score ≤ 30
- Do NOT fabricate facts — only extract what is explicitly stated
- Return ONLY valid JSON, no prose, no markdown fences

Output schema:
{
  "items": [
    {
      "url": "exact url from input",
      "credibilityScore": 0-100,
      "verificationNotes": "brief explanation of score",
      "keyFacts": ["fact 1", "fact 2"]
    }
  ]
}`;

// ── Batch-call Claude for fact checking ───────────────────────────────────────

async function factCheckBatch(batch: RawContent[]): Promise<FactCheckOutput> {
  const client = getClient();

  const userContent = JSON.stringify(
    batch.map((item) => ({
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      sourceDomain: item.sourceDomain,
    })),
    null,
    2
  );

  const response = await client.messages.create({
    model: QUAL,
    max_tokens: 2048,
    system: FACT_CHECK_SYSTEM,
    messages: [{ role: "user", content: `Articles to fact-check:\n${userContent}` }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("FactCheckAgent: non-text response from Claude");

  // Strip markdown fences if present
  const fenced = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = JSON.parse(fenced ? fenced[1].trim() : content.text.trim());

  return FactCheckOutputSchema.parse(raw);
}

// ── Domain credibility bonus ──────────────────────────────────────────────────

function domainBonus(domain: string): number {
  return CREDIBILITY_WHITELIST.has(domain) ? 30 : 0;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function FactCheckAgent(items: RawContent[]): Promise<VerifiedContent[]> {
  if (items.length === 0) {
    log.info("[FactCheckAgent] no items to fact-check");
    return [];
  }

  log.info({ count: items.length }, "[FactCheckAgent] starting");

  // AfriTalent internal snapshot always passes — it is ground truth
  const internal = items.filter((i) => i.sourceDomain === "afritalent.io");
  const external = items.filter((i) => i.sourceDomain !== "afritalent.io");

  // Batch external items to stay within token budget (max 10 per Claude call)
  const BATCH_SIZE = 10;
  const batches: RawContent[][] = [];
  for (let i = 0; i < external.length; i += BATCH_SIZE) {
    batches.push(external.slice(i, i + BATCH_SIZE));
  }

  const verifiedMap = new Map<string, { credibilityScore: number; verificationNotes: string; keyFacts: string[] }>();

  for (const batch of batches) {
    try {
      const result = await factCheckBatch(batch);
      for (const fc of result.items) {
        verifiedMap.set(fc.url, {
          credibilityScore: fc.credibilityScore,
          verificationNotes: fc.verificationNotes,
          keyFacts: fc.keyFacts,
        });
      }
    } catch (err) {
      log.warn({ err }, "[FactCheckAgent] batch failed, assigning neutral scores");
      for (const item of batch) {
        verifiedMap.set(item.url, {
          credibilityScore: 50,
          verificationNotes: "Fact-check unavailable — batch error",
          keyFacts: [],
        });
      }
    }
  }

  const verified: VerifiedContent[] = [];

  // Merge internal items (always credible)
  for (const item of internal) {
    verified.push({
      ...item,
      credibilityScore: 95,
      verificationNotes: "Internal AfriTalent platform data — authoritative",
      keyFacts: [item.excerpt],
    });
  }

  // Merge external items with domain bonus applied
  for (const item of external) {
    const fc = verifiedMap.get(item.url);
    if (!fc) continue;

    const bonus = domainBonus(item.sourceDomain);
    const finalScore = Math.min(fc.credibilityScore + bonus, 100);

    if (finalScore < CREDIBILITY_THRESHOLD) {
      log.debug(
        { url: item.url, score: finalScore },
        "[FactCheckAgent] item below threshold, filtering out"
      );
      continue;
    }

    verified.push({
      ...item,
      credibilityScore: finalScore,
      verificationNotes: fc.verificationNotes,
      keyFacts: fc.keyFacts,
    });
  }

  log.info(
    { input: items.length, passed: verified.length, filtered: items.length - verified.length },
    "[FactCheckAgent] done"
  );

  return verified;
}
