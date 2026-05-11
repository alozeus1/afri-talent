import crypto from "crypto";
import type { SemanticConfig } from "./types.js";

const DEFAULT_PROVIDER = (process.env.SEMANTIC_EMBEDDING_PROVIDER || "hash").trim().toLowerCase();
// Default dim choice mirrors the storage target: openai-backed flows write
// into vector(1536) columns; hash-backed staging flows still use 256 in the
// SemanticDocument double-precision array column.
const PROVIDER_DEFAULT_DIMENSIONS = DEFAULT_PROVIDER === "openai" ? 1536 : 256;
const DEFAULT_DIMENSIONS = clampDimensions(
  parseInt(process.env.SEMANTIC_EMBEDDING_DIMENSIONS || String(PROVIDER_DEFAULT_DIMENSIONS), 10),
);
const DEFAULT_MODEL = (
  process.env.SEMANTIC_EMBEDDING_MODEL
  || (DEFAULT_PROVIDER === "openai" ? "text-embedding-3-small" : "hash-v1")
).trim();
const OPENAI_EMBEDDING_ENDPOINT = process.env.OPENAI_EMBEDDING_ENDPOINT || "https://api.openai.com/v1/embeddings";

function clampDimensions(value: number): number {
  if (!Number.isFinite(value) || value < 32) return 256;
  return Math.min(3072, Math.max(32, Math.round(value)));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function lexicalOverlapScore(query: string, target: string): number {
  const left = new Set(tokenize(query));
  const right = new Set(tokenize(target));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(left.size, right.size);
}

function l2Normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / magnitude);
}

function hashToken(token: string, index: number, dimensions: number): { slot: number; sign: number; weight: number } {
  const digest = crypto.createHash("sha256").update(`${token}:${index}`).digest();
  return {
    slot: digest.readUInt32BE(0) % dimensions,
    sign: digest[4] % 2 === 0 ? 1 : -1,
    weight: 1 + (digest[5] / 255),
  };
}

export function getSemanticConfig(): SemanticConfig {
  return {
    enabled: DEFAULT_PROVIDER !== "disabled",
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    dimensions: DEFAULT_DIMENSIONS,
  };
}

export function generateHashEmbedding(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const tokens = tokenize(text);
  const vector = Array.from({ length: clampDimensions(dimensions) }, () => 0);

  if (tokens.length === 0) {
    return vector;
  }

  tokens.forEach((token, tokenIndex) => {
    const { slot, sign, weight } = hashToken(token, tokenIndex, vector.length);
    vector[slot] += sign * weight;
  });

  return l2Normalize(vector);
}

async function generateOpenAIEmbedding(text: string, model: string, dimensions: number): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when SEMANTIC_EMBEDDING_PROVIDER=openai");
  }

  const response = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model,
      dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embedding request failed (${response.status}): ${body}`);
  }

  const payload = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = payload.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error("OpenAI embedding response was missing embedding data");
  }

  return l2Normalize(embedding);
}

export interface ResolveEmbeddingOptions {
  manualEmbedding?: number[];
  dimensions?: number;
  model?: string;
}

export async function resolveEmbedding(
  text: string,
  optionsOrManual?: ResolveEmbeddingOptions | number[],
): Promise<{
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
}> {
  // Back-compat: callers used to pass `manualEmbedding` positionally.
  const options: ResolveEmbeddingOptions = Array.isArray(optionsOrManual)
    ? { manualEmbedding: optionsOrManual }
    : (optionsOrManual ?? {});

  if (options.manualEmbedding && options.manualEmbedding.length > 0) {
    const dimensions = clampDimensions(options.manualEmbedding.length);
    const normalized = l2Normalize(options.manualEmbedding.slice(0, dimensions));
    return {
      embedding: normalized,
      provider: "manual",
      model: "manual",
      dimensions,
    };
  }

  const config = getSemanticConfig();
  if (!config.enabled) {
    throw new Error("Semantic embeddings are disabled for this environment");
  }

  const dimensions = options.dimensions ? clampDimensions(options.dimensions) : config.dimensions;
  const model = options.model ?? config.model;

  if (config.provider === "openai") {
    const embedding = await generateOpenAIEmbedding(text, model, dimensions);
    return {
      embedding,
      provider: config.provider,
      model,
      dimensions: embedding.length,
    };
  }

  return {
    embedding: generateHashEmbedding(text, dimensions),
    provider: config.provider,
    model,
    dimensions,
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  if (!Number.isFinite(denominator) || denominator === 0) return 0;

  return Math.max(-1, Math.min(1, dot / denominator));
}

export function semanticTextScore(query: string, target: string): number {
  if (!query.trim() || !target.trim()) return 0;
  const queryEmbedding = generateHashEmbedding(query);
  const targetEmbedding = generateHashEmbedding(target);
  const cosine = Math.max(0, cosineSimilarity(queryEmbedding, targetEmbedding));
  const overlap = lexicalOverlapScore(query, target);
  return Math.max(0, Math.min(1, (cosine * 0.45) + (overlap * 0.55)));
}
