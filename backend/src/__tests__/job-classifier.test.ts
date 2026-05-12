/**
 * §4.1 — Job-field classifier eval.
 *
 * The production classifier is LLM-primary (Claude Haiku 4.5) with a
 * deterministic keyword fallback. CI tests only the keyword fallback because
 * we cannot hit the Anthropic API in CI without leaking spend; the LLM path
 * is exercised via spot checks in a separate live-eval workflow (TODO).
 *
 * The fixture lives at `backend/tests/fixtures/job-classification.csv` —
 * 500 labelled rows covering all 24 non-fallback categories (20 each) plus
 * 20 deliberately unrecognisable titles in the OTHER bucket.
 *
 * The ≥92% accuracy gate per master prompt §4.1 is enforced below; any rule
 * regression that drops below 92% fails CI.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyByKeywordsForTesting,
  type ClassificationResult,
} from "../lib/ai/skills/job-field-classifier.js";
import {
  JOB_TAXONOMY,
  TAXONOMY_VERSION,
  isTaxonomyField,
  type TaxonomyField,
} from "../lib/jobs/taxonomy.js";

interface FixtureRow {
  title: string;
  expected: TaxonomyField;
  tags?: string[];
}

const FIXTURE: FixtureRow[] = loadFixture();

function loadFixture(): FixtureRow[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const csvPath = resolve(here, "..", "..", "tests", "fixtures", "job-classification.csv");
  const raw = readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  // Drop header row.
  const [, ...dataLines] = lines;

  return dataLines.map((line, idx) => {
    const cells = parseCsvLine(line);
    if (cells.length < 2) {
      throw new Error(`[job-classifier fixture] row ${idx + 2} has < 2 cells: ${line}`);
    }
    const [title, expected, tagsCell] = cells;
    if (!isTaxonomyField(expected)) {
      throw new Error(`[job-classifier fixture] row ${idx + 2} expected="${expected}" is not a TaxonomyField`);
    }
    const tags = (tagsCell ?? "").trim().length > 0
      ? tagsCell.split(";").map((t) => t.trim()).filter(Boolean)
      : undefined;
    return { title, expected, tags };
  });
}

// Minimal RFC-4180-style line parser — handles quoted fields containing commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === ",") {
      out.push(cell);
      cell = "";
    } else if (ch === '"' && cell.length === 0) {
      inQuotes = true;
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

describe("§4.1 — job-field classifier eval (keyword fallback path)", () => {
  it("fixture is exactly 500 labelled rows", () => {
    expect(FIXTURE.length).toBe(500);
  });

  it("fixture covers every taxonomy category", () => {
    const counts = new Map<TaxonomyField, number>();
    for (const row of FIXTURE) {
      counts.set(row.expected, (counts.get(row.expected) ?? 0) + 1);
    }
    for (const field of JOB_TAXONOMY) {
      expect(counts.get(field) ?? 0).toBeGreaterThanOrEqual(20);
    }
  });

  it("keyword fallback hits ≥92% accuracy on the 500-row fixture (master prompt §4.1)", () => {
    let correct = 0;
    const mistakes: Array<{ title: string; expected: TaxonomyField; got: TaxonomyField }> = [];

    for (const row of FIXTURE) {
      const result: ClassificationResult = classifyByKeywordsForTesting({
        title: row.title,
        tags: row.tags,
      });
      if (result.field === row.expected) {
        correct += 1;
      } else {
        mistakes.push({ title: row.title, expected: row.expected, got: result.field });
      }
    }

    const accuracy = correct / FIXTURE.length;
    if (accuracy < 0.92) {
      // Surface every mistake so a regression is debuggable from the test output.
      console.error("[classifier eval] mistakes:", mistakes);
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.92);
  });

  it("every keyword-fallback result tags the current TAXONOMY_VERSION", () => {
    const result = classifyByKeywordsForTesting({ title: "Senior Backend Engineer" });
    expect(result.version).toBe(TAXONOMY_VERSION);
    expect(result.source).toBe("keyword_fallback");
  });

  it("unrecognisable titles default to OTHER with low confidence", () => {
    const result = classifyByKeywordsForTesting({ title: "Tasty banana enthusiast" });
    expect(result.field).toBe("OTHER");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
