// §12.1 — lib/jobs/embedding.ts unit tests.
//
// Covers three guarantees PR K (§4.2 tri-key dedup) relies on:
//   1. buildJobEmbeddingText composes the canonical input shape per spec.
//   2. embedJobText returns a 1536-dim vector regardless of provider.
//   3. When SEMANTIC_EMBEDDING_PROVIDER=openai, the outbound request body
//      carries `dimensions: 1536` (so OpenAI returns a vector that fits the
//      vector(1536) column even for text-embedding-3-large).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.SEMANTIC_EMBEDDING_PROVIDER;
  delete process.env.SEMANTIC_EMBEDDING_MODEL;
  delete process.env.SEMANTIC_EMBEDDING_DIMENSIONS;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe("buildJobEmbeddingText", () => {
  it("joins title + first 300 chars of description with a newline", async () => {
    const { buildJobEmbeddingText, JOB_EMBEDDING_DESCRIPTION_CHARS } = await import("../lib/jobs/embedding.js");
    const longDesc = "a".repeat(JOB_EMBEDDING_DESCRIPTION_CHARS + 200);
    const text = buildJobEmbeddingText({ title: "Senior Engineer", description: longDesc });
    expect(text.startsWith("Senior Engineer\n")).toBe(true);
    expect(text.length).toBe("Senior Engineer\n".length + JOB_EMBEDDING_DESCRIPTION_CHARS);
  });

  it("returns just the title when description is empty or missing", async () => {
    const { buildJobEmbeddingText } = await import("../lib/jobs/embedding.js");
    expect(buildJobEmbeddingText({ title: "Backend Engineer" })).toBe("Backend Engineer");
    expect(buildJobEmbeddingText({ title: "Backend Engineer", description: "" })).toBe("Backend Engineer");
    expect(buildJobEmbeddingText({ title: "Backend Engineer", description: null })).toBe("Backend Engineer");
  });
});

describe("embedJobText (hash provider — default in tests)", () => {
  it("returns a 1536-dim vector for non-empty input", async () => {
    const { embedJobText, JOB_EMBEDDING_DIMENSIONS } = await import("../lib/jobs/embedding.js");
    const result = await embedJobText({ title: "Senior Backend Engineer", description: "Node.js + Postgres" });
    expect(result).not.toBeNull();
    expect(result!.embedding.length).toBe(JOB_EMBEDDING_DIMENSIONS);
    expect(result!.provider).toBe("hash");
  });

  it("returns null when title is empty and description is empty", async () => {
    const { embedJobText } = await import("../lib/jobs/embedding.js");
    const result = await embedJobText({ title: "", description: "" });
    expect(result).toBeNull();
  });

  it("toPgVectorLiteral formats the vector for `'[…]'::vector` SQL casts", async () => {
    const { toPgVectorLiteral } = await import("../lib/jobs/embedding.js");
    expect(toPgVectorLiteral([1, 2, 3.5])).toBe("[1,2,3.5]");
  });
});

describe("embedJobText (openai provider routing)", () => {
  it("sends dimensions=1536 to OpenAI regardless of model", async () => {
    process.env.SEMANTIC_EMBEDDING_PROVIDER = "openai";
    process.env.SEMANTIC_EMBEDDING_MODEL = "text-embedding-3-large";
    process.env.SEMANTIC_EMBEDDING_DIMENSIONS = "256"; // intentionally wrong; embedJobText must override
    process.env.OPENAI_API_KEY = "sk-test-fake";

    const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => (i % 7) / 11);
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
      _init: init,
    } as unknown as Response));
    vi.stubGlobal("fetch", fetchSpy);

    const { embedJobText } = await import("../lib/jobs/embedding.js");
    const result = await embedJobText({ title: "Senior Backend Engineer", description: "node and postgres" });

    expect(result).not.toBeNull();
    expect(result!.embedding.length).toBe(1536);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const requestBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.model).toBe("text-embedding-3-large");
    expect(requestBody.dimensions).toBe(1536);
  });

  it("returns null and logs when OpenAI rejects the request", async () => {
    process.env.SEMANTIC_EMBEDDING_PROVIDER = "openai";
    process.env.SEMANTIC_EMBEDDING_MODEL = "text-embedding-3-small";
    process.env.OPENAI_API_KEY = "sk-test-fake";

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
      json: async () => ({ error: "rate limited" }),
    } as unknown as Response)));

    const { embedJobText } = await import("../lib/jobs/embedding.js");
    const result = await embedJobText({ title: "Senior Backend Engineer", description: "node and postgres" });
    expect(result).toBeNull();
  });
});
