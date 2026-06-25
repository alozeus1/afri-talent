// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — RAG tools
//
// 1. explainableSearch(): wraps semantic search so agents always get SOURCE
//    REFERENCES attached and a graceful "no context" fallback — agents never
//    answer from vague memory, and cite where context came from.
//
// 2. pgvectorSearch(): native pgvector ANN search (fixes the O(n) in-app cosine
//    scan). Flag-gated behind RAG_PGVECTOR=1 and wrapped so a failure falls back
//    to the existing search path. The `embeddingVector` column + HNSW index are
//    added additively (see migration); backfill/cutover is a documented rollout.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../../../prisma.js";
import logger from "../../../logger.js";
import { searchSemanticDocuments } from "../../../rag/store.js";
import { resolveEmbedding } from "../../../rag/embedding.js";

export interface RagHit {
  sourceType: string;
  sourceId: string;
  title: string | null;
  score: number;
}

export interface SourceRef {
  ref: string; // `${sourceType}:${sourceId}`
  title: string | null;
  score: number;
}

export interface ExplainableResult {
  hasContext: boolean;
  hits: RagHit[];
  sources: SourceRef[];
  confidence: number; // top hit score, 0 when no context
}

export interface ExplainableSearchInput {
  query: string;
  namespace: string;
  sourceTypes?: string[];
  limit?: number;
  minScore?: number;
}

export type SearchFn = (input: ExplainableSearchInput) => Promise<RagHit[]>;

/** Default search backed by the existing semantic store. */
const defaultSearch: SearchFn = async (input) => {
  const hits = await searchSemanticDocuments({
    query: input.query,
    namespace: input.namespace,
    sourceTypes: input.sourceTypes,
    limit: input.limit,
    minScore: input.minScore,
  });
  return hits.map((h) => ({ sourceType: h.sourceType, sourceId: h.sourceId, title: h.title, score: h.score }));
};

/**
 * Search and attach source references, with a graceful no-context fallback.
 * `searchFn` is injectable for tests.
 */
export async function explainableSearch(
  input: ExplainableSearchInput,
  searchFn: SearchFn = defaultSearch,
): Promise<ExplainableResult> {
  const minScore = input.minScore ?? 0.2;
  let hits: RagHit[] = [];
  try {
    hits = await searchFn(input);
  } catch (err) {
    logger.warn({ err: String(err), namespace: input.namespace }, "[rag] search failed — returning no context");
    hits = [];
  }
  const relevant = hits.filter((h) => h.score >= minScore).sort((a, b) => b.score - a.score);
  return {
    hasContext: relevant.length > 0,
    hits: relevant,
    sources: relevant.map((h) => ({ ref: `${h.sourceType}:${h.sourceId}`, title: h.title, score: h.score })),
    confidence: relevant[0]?.score ?? 0,
  };
}

export function isPgvectorEnabled(): boolean {
  return process.env.RAG_PGVECTOR === "1";
}

/**
 * Native pgvector ANN search over SemanticDocument.embeddingVector. Falls back to
 * the in-app search path on any error so it is always safe to enable.
 */
export async function pgvectorSearch(input: ExplainableSearchInput): Promise<RagHit[]> {
  try {
    const queryEmbedding = (await resolveEmbedding(input.query)).embedding;
    const literal = `[${queryEmbedding.join(",")}]`;
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const rows = await prisma.$queryRaw<Array<{ sourceType: string; sourceId: string; title: string | null; distance: number }>>`
      SELECT "sourceType", "sourceId", "title",
             ("embeddingVector" <=> ${literal}::vector) AS distance
      FROM "SemanticDocument"
      WHERE "namespace" = ${input.namespace}
        AND "embeddingVector" IS NOT NULL
      ORDER BY "embeddingVector" <=> ${literal}::vector
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ sourceType: r.sourceType, sourceId: r.sourceId, title: r.title, score: 1 - Number(r.distance) }));
  } catch (err) {
    logger.warn({ err: String(err), namespace: input.namespace }, "[rag] pgvector search failed — falling back");
    return defaultSearch(input);
  }
}

/** Search strategy that honors the RAG_PGVECTOR flag, always with source refs + fallback. */
export async function ragSearch(input: ExplainableSearchInput): Promise<ExplainableResult> {
  return explainableSearch(input, isPgvectorEnabled() ? pgvectorSearch : defaultSearch);
}
