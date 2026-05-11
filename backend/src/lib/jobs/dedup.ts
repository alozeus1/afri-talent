// §4.2 — tri-key deduplication.
//
// Three keys, evaluated in order. The first match wins; if none match the
// row is genuinely new.
//
//   K1: `${normalizeCompany(employer)}:${normalizeTitle(title)}:${normalizeCity(location)}`
//       Fast text-equality lookup. Catches the same role posted on two
//       boards under near-identical titles.
//
//   K2: existing sourceFingerprint (buildSourceFingerprint in discovery.ts).
//       Catches re-scrapes of the same source URL where the source assigns
//       its own per-listing identifier.
//
//   K3: embedding cosine over `${title}\n${description.slice(0, 300)}` ≥ 0.92,
//       restricted to rows that already matched K1 *or* share a sourceName.
//       Catches near-duplicates whose title casing diverges enough that K1
//       fails (e.g. "Senior Software Engineer" vs "Sr. SWE").
//
// The cascade is intentional: K1 is cheapest (text index), K2 is cheap
// (text index), K3 needs the pgvector ANN query and is reserved for the
// long tail K1/K2 miss.

import type { PrismaClient } from "@prisma/client";
import { normalizeCompany, normalizeTitle, normalizeLocation } from "./normalize.js";
import { embedJobText, toPgVectorLiteral, type JobEmbeddingInput } from "./embedding.js";

export interface DedupKeyInput {
  title: string;
  description?: string | null;
  company?: string | null;
  location?: string | null;
  sourceFingerprint?: string | null;
  sourceName?: string | null;
}

export interface DedupKeys {
  k1: string;
  k2: string | null;
  embeddingText: string;
}

export interface DedupMatch {
  jobId: string;
  matchedOn: "K1" | "K2" | "K3";
  cosine?: number;
}

// Master prompt §4.2 — K3 cosine threshold.
export const K3_COSINE_THRESHOLD = 0.92;

// Cap on K3 candidates inspected. Keeps the query bounded.
export const K3_CANDIDATE_LIMIT = 20;

// §4.2 — dedup-only abbreviation expansion. Common tech-role abbreviations
// canonicalised to their expanded form so cross-board pairs collapse to a
// single K1. Lives in the dedup layer (not in normalizeTitle) so the general
// normalize API stays stable for other consumers.
const TITLE_ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsre\b/gi, "site reliability engineer"],
  [/\bswe\b/gi, "software engineer"],
  [/\bml engineer\b/gi, "machine learning engineer"],
  [/\bml\b/gi, "machine learning"],
  [/\bpm\b/gi, "product manager"],
  [/\bbdr\b/gi, "business development representative"],
  [/\bsdr\b/gi, "sales development representative"],
  [/\bappsec\b/gi, "application security"],
];

function expandTitleAbbreviations(title: string): string {
  let out = title;
  for (const [pattern, replacement] of TITLE_ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function buildDedupKeys(input: DedupKeyInput): DedupKeys {
  const normCompany = normalizeCompany(input.company ?? input.sourceName ?? "");
  const expandedTitle = expandTitleAbbreviations(input.title);
  const normTitle = normalizeTitle(expandedTitle);
  const normCity = normalizeLocation(input.location ?? "").city ?? "";
  const k1 = `${normCompany}:${normTitle}:${normCity}`.toLowerCase();
  const embeddingInput: JobEmbeddingInput = {
    title: input.title,
    description: input.description ?? null,
  };
  return {
    k1,
    k2: input.sourceFingerprint ?? null,
    embeddingText: `${embeddingInput.title}\n${(embeddingInput.description ?? "").slice(0, 300)}`,
  };
}

interface FindDuplicateOptions {
  excludeId?: string;
  // When true, skip the K3 cosine query (e.g. unit tests without pgvector).
  skipCosine?: boolean;
}

// Looks up an existing job that should be considered a duplicate of the
// incoming candidate. Cascade K1 → K2 → K3.
export async function findDuplicate(
  prisma: PrismaClient,
  input: DedupKeyInput,
  options: FindDuplicateOptions = {},
): Promise<DedupMatch | null> {
  const keys = buildDedupKeys(input);

  // K1 — direct dedupKeyV2 lookup.
  if (keys.k1 && keys.k1 !== "::") {
    const k1Hit = await prisma.job.findFirst({
      where: {
        dedupKeyV2: keys.k1,
        ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
      },
      select: { id: true },
      orderBy: { publishedAt: "desc" },
    });
    if (k1Hit) return { jobId: k1Hit.id, matchedOn: "K1" };
  }

  // K2 — sourceFingerprint lookup.
  if (keys.k2) {
    const k2Hit = await prisma.job.findFirst({
      where: {
        sourceFingerprint: keys.k2,
        ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
      },
      select: { id: true },
      orderBy: { publishedAt: "desc" },
    });
    if (k2Hit) return { jobId: k2Hit.id, matchedOn: "K2" };
  }

  if (options.skipCosine) return null;

  // K3 — pgvector cosine, scoped to rows that plausibly belong to the same
  // employer to keep the candidate set small. If embedJobText fails (no API
  // key, MOCK_AI, missing column), fall through to "no match" — safer than
  // false-positive dedup.
  const embedding = await embedJobText({ title: input.title, description: input.description });
  if (!embedding) return null;

  const vectorLiteral = toPgVectorLiteral(embedding.embedding);
  const normCompany = normalizeCompany(input.company ?? input.sourceName ?? "");
  const sourceName = input.sourceName ?? normCompany;

  try {
    const candidates = await prisma.$queryRawUnsafe<Array<{ id: string; cosine: number }>>(
      `SELECT j.id,
              1 - (j.embedding <=> $1::vector) AS cosine
       FROM "Job" j
       WHERE j.embedding IS NOT NULL
         AND (
              j."sourceName" = $2
           OR j."dedupKeyV2" LIKE $3
         )
         ${options.excludeId ? `AND j.id <> $4` : ""}
       ORDER BY j.embedding <=> $1::vector
       LIMIT ${K3_CANDIDATE_LIMIT}`,
      vectorLiteral,
      sourceName ?? "",
      normCompany ? `${normCompany.toLowerCase()}:%` : "%",
      ...(options.excludeId ? [options.excludeId] : []),
    );

    const winner = candidates.find((c) => Number(c.cosine) >= K3_COSINE_THRESHOLD);
    if (winner) {
      return { jobId: winner.id, matchedOn: "K3", cosine: Number(winner.cosine) };
    }
  } catch {
    // pgvector not enabled in this environment — treat as miss.
    return null;
  }

  return null;
}
