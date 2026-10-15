// ─────────────────────────────────────────────────────────────────────────────
// LLM tie-breaker for postings the deterministic rules mark "uncertain".
//
// Cost controls:
//  - only uncertain postings are sent (rules decide the vast majority),
//  - batched (default 20 postings per call, one short prompt, Haiku),
//  - cached by content hash in-process and in Redis (30 days), so a posting is
//    asked about at most once per content version,
//  - hard per-run budget (AGGREGATOR_LLM_MAX_JOBS_PER_RUN, default 120),
//  - disabled under MOCK_AI=1 / AI_DISABLED=1 / no ANTHROPIC_API_KEY.
// Unresolved postings fall back to AGGREGATOR_UNCERTAIN_POLICY.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod/v4";
import logger from "../../../logger.js";
import { redisClient } from "../../../redis.js";
import { getAnthropicClient } from "../../../ai/anthropic-client.js";

export interface TieBreakItem {
  key: string;
  title: string;
  company: string;
  location: string;
  excerpt: string;
}

export type TieBreakCompleter = (prompt: string) => Promise<string>;

export interface TieBreakStats {
  calls: number;
  jobsClassified: number;
  cacheHits: number;
}

const CACHE_PREFIX = "agg:africa-elig:v1:";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MEMORY_CACHE_LIMIT = 20_000;
const memoryCache = new Map<string, boolean>();

const responseSchema = z.array(
  z.object({
    id: z.number().int(),
    eligible: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
  }),
);

function rememberInMemory(key: string, value: boolean): void {
  if (memoryCache.size >= MEMORY_CACHE_LIMIT) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, value);
}

async function readCache(key: string): Promise<boolean | null> {
  if (memoryCache.has(key)) return memoryCache.get(key)!;
  if (!redisClient) return null;
  try {
    const value = await redisClient.get(`${CACHE_PREFIX}${key}`);
    if (value === "1" || value === "0") {
      rememberInMemory(key, value === "1");
      return value === "1";
    }
  } catch {
    // Redis is optional.
  }
  return null;
}

async function writeCache(key: string, value: boolean): Promise<void> {
  rememberInMemory(key, value);
  if (!redisClient) return;
  try {
    await redisClient.set(`${CACHE_PREFIX}${key}`, value ? "1" : "0", "EX", CACHE_TTL_SECONDS);
  } catch {
    // Redis is optional.
  }
}

export function llmTieBreakAvailable(): boolean {
  return (
    process.env.MOCK_AI !== "1" &&
    process.env.AI_DISABLED !== "1" &&
    process.env.AGGREGATOR_LLM_TIEBREAK !== "0" &&
    Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

function defaultCompleter(): TieBreakCompleter {
  const model = process.env.AI_FAST_MODEL || "claude-haiku-4-5-20251001";
  return async (prompt) => {
    const response = await getAnthropicClient().messages.create({
      model,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    return block && block.type === "text" ? block.text : "";
  };
}

export function buildTieBreakPrompt(items: TieBreakItem[]): string {
  const lines = items.map((item, index) =>
    JSON.stringify({
      id: index,
      title: item.title.slice(0, 140),
      company: item.company.slice(0, 80),
      location: item.location.slice(0, 120),
      excerpt: item.excerpt.slice(0, 500),
    }),
  );
  return `For each remote job below, decide whether a candidate who lives in Africa (e.g. Nigeria, Kenya, Ghana, South Africa, Egypt) can be hired for it without relocating.
Answer eligible=false when the posting limits hiring to specific non-African countries/regions or timezones (e.g. US-only, Americas, EU-only, must be authorised to work in the US).
Answer eligible=true only when it is open worldwide, to EMEA/Africa, or the text gives no restriction and the employer clearly hires internationally.

Return ONLY a JSON array, no markdown: [{"id":0,"eligible":true,"confidence":0.0-1.0}, ...]

Jobs (one JSON object per line):
${lines.join("\n")}`;
}

export class EligibilityTieBreaker {
  readonly stats: TieBreakStats = { calls: 0, jobsClassified: 0, cacheHits: 0 };
  private remainingBudget: number;

  constructor(
    private readonly options: {
      budget?: number;
      batchSize?: number;
      minConfidence?: number;
      completer?: TieBreakCompleter;
      enabled?: boolean;
    } = {},
  ) {
    this.remainingBudget = options.budget ?? Number.parseInt(process.env.AGGREGATOR_LLM_MAX_JOBS_PER_RUN || "120", 10);
  }

  /** Map of item.key → eligible (true/false) for resolved items; unresolved keys are absent. */
  async resolve(items: TieBreakItem[]): Promise<Map<string, boolean>> {
    const resolved = new Map<string, boolean>();
    const pending: TieBreakItem[] = [];

    for (const item of items) {
      const cached = await readCache(item.key);
      if (cached !== null) {
        resolved.set(item.key, cached);
        this.stats.cacheHits += 1;
      } else {
        pending.push(item);
      }
    }

    const enabled = this.options.enabled ?? llmTieBreakAvailable();
    if (!enabled || pending.length === 0) return resolved;

    const completer = this.options.completer ?? defaultCompleter();
    const batchSize = this.options.batchSize ?? 20;
    const minConfidence = this.options.minConfidence ?? 0.6;

    for (let start = 0; start < pending.length && this.remainingBudget > 0; start += batchSize) {
      const batch = pending.slice(start, start + Math.min(batchSize, this.remainingBudget));
      this.remainingBudget -= batch.length;
      this.stats.calls += 1;
      try {
        const text = await completer(buildTieBreakPrompt(batch));
        const cleaned = text.replace(/```(?:json)?/g, "").trim();
        const parsed = responseSchema.parse(JSON.parse(cleaned));
        for (const answer of parsed) {
          const item = batch[answer.id];
          if (!item) continue;
          if ((answer.confidence ?? 1) < minConfidence) continue;
          resolved.set(item.key, answer.eligible);
          this.stats.jobsClassified += 1;
          await writeCache(item.key, answer.eligible);
        }
      } catch (error) {
        logger.warn(
          { err: (error as Error).message, batchSize: batch.length },
          "[aggregator] LLM eligibility tie-break failed; postings fall back to policy",
        );
      }
    }

    return resolved;
  }
}

/** Test hook. */
export function clearTieBreakMemoryCache(): void {
  memoryCache.clear();
}
