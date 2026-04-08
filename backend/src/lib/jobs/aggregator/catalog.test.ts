import { describe, expect, it } from "vitest";
import { resolveSourceCatalog } from "./index.js";

describe("resolveSourceCatalog", () => {
  it("merges configured tokens with curated defaults and de-duplicates", () => {
    const resolved = resolveSourceCatalog("reddit, custom-board, coinbase", ["coinbase", "reddit", "canonical"]);

    expect(resolved).toEqual(["reddit", "custom-board", "coinbase", "canonical"]);
  });

  it("returns only configured tokens when curated defaults are disabled", () => {
    const resolved = resolveSourceCatalog("reddit, custom-board", ["coinbase", "canonical"], {
      includeDefaults: false,
    });

    expect(resolved).toEqual(["reddit", "custom-board"]);
  });
});
