// §4.2 — tri-key dedup fixture test.
//
// Asserts the dedup cascade (K1 first, then K2 = sourceFingerprint, then K3
// cosine ≥ 0.92) catches ≥ 25 of the 30 known dup pairs per master prompt.
//
// The fixture lives at backend/tests/fixtures/dedup-pairs.json — each entry
// has a `left` and `right` job description that should be treated as the same
// listing despite differences in title casing, seniority qualifiers, company
// spelling, or board source.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDedupKeys, findDuplicate, type DedupKeyInput } from "../lib/jobs/dedup.js";

interface FixturePair {
  left: DedupKeyInput;
  right: DedupKeyInput;
}

function loadFixture(): FixturePair[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "..", "..", "tests", "fixtures", "dedup-pairs.json");
  return JSON.parse(readFileSync(path, "utf8")) as FixturePair[];
}

const FIXTURE = loadFixture();

describe("§4.2 — buildDedupKeys K1 canonicalisation", () => {
  it("fixture is exactly 30 pairs", () => {
    expect(FIXTURE.length).toBe(30);
  });

  it("produces matching K1 for ≥ 25/30 pairs (master prompt §4.2)", () => {
    let matched = 0;
    const misses: Array<{ idx: number; left: string; right: string }> = [];
    FIXTURE.forEach((pair, idx) => {
      const l = buildDedupKeys(pair.left);
      const r = buildDedupKeys(pair.right);
      if (l.k1 === r.k1) {
        matched += 1;
      } else {
        misses.push({ idx, left: l.k1, right: r.k1 });
      }
    });

    if (matched < 25) {
      console.error("[dedup eval] K1 misses:", misses);
    }
    expect(matched).toBeGreaterThanOrEqual(25);
  });
});

describe("§4.2 — findDuplicate cascade (in-memory prisma stub)", () => {
  // Build a prisma stub that backs Job.findFirst / findUnique with an array.
  // We only exercise K1 + K2 (no pgvector in unit tests) so the cascade tests
  // exercise the cheaper-path logic the dedup decision rides on most.
  type FakeRow = { id: string; dedupKeyV2: string | null; sourceFingerprint: string | null };

  function makeStubPrisma(rows: FakeRow[]) {
    return {
      job: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          const where = args.where;
          return rows.find((r) => {
            if (typeof where.dedupKeyV2 === "string" && r.dedupKeyV2 !== where.dedupKeyV2) return false;
            if (typeof where.sourceFingerprint === "string" && r.sourceFingerprint !== where.sourceFingerprint) return false;
            return true;
          }) ?? null;
        },
        findUnique: async (args: { where: { id: string } }) =>
          rows.find((r) => r.id === args.where.id) ?? null,
      },
      // K3 SQL query path bypassed via skipCosine; $queryRawUnsafe should never
      // be reached, but make it explode if it ever is so a regression surfaces.
      $queryRawUnsafe: async () => {
        throw new Error("K3 path should be skipped in unit tests");
      },
    };
  }

  it("returns K1 match when an existing row carries the same K1", async () => {
    const pair = FIXTURE[0]; // Stripe Senior Software Engineer vs Sr. Software Engineer in Lagos
    const seed = buildDedupKeys(pair.left);
    const prisma = makeStubPrisma([
      { id: "existing-1", dedupKeyV2: seed.k1, sourceFingerprint: null },
    ]);

    const match = await findDuplicate(prisma as never, pair.right, { skipCosine: true });
    expect(match).not.toBeNull();
    expect(match!.matchedOn).toBe("K1");
    expect(match!.jobId).toBe("existing-1");
  });

  it("returns K2 match when an existing row carries the same sourceFingerprint", async () => {
    const prisma = makeStubPrisma([
      { id: "existing-2", dedupKeyV2: null, sourceFingerprint: "fp-abc" },
    ]);

    const match = await findDuplicate(
      prisma as never,
      {
        title: "Genuinely Different Title",
        company: "Different Co",
        location: "Somewhere Else",
        sourceFingerprint: "fp-abc",
      },
      { skipCosine: true },
    );

    expect(match).not.toBeNull();
    expect(match!.matchedOn).toBe("K2");
  });

  it("returns null when no key matches and cosine is skipped", async () => {
    const prisma = makeStubPrisma([]);
    const match = await findDuplicate(
      prisma as never,
      {
        title: "Senior Backend Engineer",
        company: "Acme",
        location: "Lagos, Nigeria",
        sourceFingerprint: "fp-new",
      },
      { skipCosine: true },
    );
    expect(match).toBeNull();
  });

  it("K1 lookup wins over K2 when both could match different rows", async () => {
    const pair = FIXTURE[0];
    const seed = buildDedupKeys(pair.left);
    const prisma = makeStubPrisma([
      { id: "k1-row", dedupKeyV2: seed.k1, sourceFingerprint: null },
      { id: "k2-row", dedupKeyV2: null, sourceFingerprint: "fp-shared" },
    ]);

    const match = await findDuplicate(
      prisma as never,
      { ...pair.right, sourceFingerprint: "fp-shared" },
      { skipCosine: true },
    );
    expect(match!.matchedOn).toBe("K1");
    expect(match!.jobId).toBe("k1-row");
  });
});
