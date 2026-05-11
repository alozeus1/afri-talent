// §12.1 — job-side embedding API.
//
// The single entry point Wave 3 §4.2 (PR K) calls to compute the cosine
// similarity input for K3. The §4.2 spec defines K3 as the cosine over
// `title + first 300 chars of description`, so we own the canonical text
// shape here rather than scattering it across every caller.
//
// Storage target: `Job.embedding vector(1536)`. The vector dimension is
// pinned to 1536 regardless of the provider — when SEMANTIC_EMBEDDING_PROVIDER
// is `openai`, we ask the API for `dimensions=1536` (works on both
// text-embedding-3-small at native dim and text-embedding-3-large via the
// dimensions parameter); when the provider falls through to the hash backend
// (CI, MOCK_AI, missing OPENAI_API_KEY), we generate a 1536-dim hash vector
// so cosine comparisons stay self-consistent within an environment.

import logger from "../logger.js";
import { resolveEmbedding } from "../rag/embedding.js";

export const JOB_EMBEDDING_DIMENSIONS = 1536;
export const JOB_EMBEDDING_DESCRIPTION_CHARS = 300;

export interface JobEmbeddingInput {
  title: string;
  description?: string | null;
}

export interface JobEmbeddingResult {
  embedding: number[];
  provider: string;
  model: string;
  dimensions: number;
}

export function buildJobEmbeddingText(input: JobEmbeddingInput): string {
  const title = (input.title ?? "").trim();
  const desc = (input.description ?? "").slice(0, JOB_EMBEDDING_DESCRIPTION_CHARS).trim();
  return desc.length > 0 ? `${title}\n${desc}` : title;
}

export async function embedJobText(input: JobEmbeddingInput): Promise<JobEmbeddingResult | null> {
  const text = buildJobEmbeddingText(input);
  if (!text) return null;

  try {
    const result = await resolveEmbedding(text, { dimensions: JOB_EMBEDDING_DIMENSIONS });
    if (result.embedding.length !== JOB_EMBEDDING_DIMENSIONS) {
      logger.warn(
        { got: result.embedding.length, expected: JOB_EMBEDDING_DIMENSIONS, provider: result.provider, model: result.model },
        "[jobs/embedding] dimension mismatch; the embedding will not fit the vector(1536) column",
      );
      return null;
    }
    return result;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[jobs/embedding] failed to embed job text",
    );
    return null;
  }
}

// Renders a vector for pgvector's literal `'[…]'::vector` SQL syntax. Caller
// supplies the casting; we just produce the bracketed comma-separated form.
export function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
