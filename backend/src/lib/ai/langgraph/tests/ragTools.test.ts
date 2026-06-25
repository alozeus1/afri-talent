import { describe, it, expect } from "vitest";
import { explainableSearch, type RagHit, type SearchFn } from "../tools/ragTools.js";

const hits = (...hs: RagHit[]): SearchFn => async () => hs;

describe("explainableSearch", () => {
  it("attaches source references and confidence when context exists", async () => {
    const fn = hits(
      { sourceType: "JOB", sourceId: "j1", title: "Engineer", score: 0.82 },
      { sourceType: "JOB", sourceId: "j2", title: "Dev", score: 0.55 },
    );
    const r = await explainableSearch({ query: "react", namespace: "jobs" }, fn);
    expect(r.hasContext).toBe(true);
    expect(r.confidence).toBe(0.82);
    expect(r.sources[0]).toEqual({ ref: "JOB:j1", title: "Engineer", score: 0.82 });
    expect(r.sources).toHaveLength(2);
  });

  it("filters hits below minScore and sorts by score", async () => {
    const fn = hits(
      { sourceType: "JOB", sourceId: "low", title: null, score: 0.1 },
      { sourceType: "JOB", sourceId: "high", title: null, score: 0.9 },
    );
    const r = await explainableSearch({ query: "x", namespace: "jobs", minScore: 0.2 }, fn);
    expect(r.hits.map((h) => h.sourceId)).toEqual(["high"]);
  });

  it("falls back gracefully to no-context when there are no relevant hits", async () => {
    const r = await explainableSearch({ query: "x", namespace: "jobs" }, hits());
    expect(r.hasContext).toBe(false);
    expect(r.sources).toEqual([]);
    expect(r.confidence).toBe(0);
  });

  it("never throws when the search backend errors", async () => {
    const boom: SearchFn = async () => {
      throw new Error("db down");
    };
    const r = await explainableSearch({ query: "x", namespace: "jobs" }, boom);
    expect(r.hasContext).toBe(false);
  });
});
