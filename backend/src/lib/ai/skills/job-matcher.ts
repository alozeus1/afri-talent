// ─────────────────────────────────────────────────────────────────────────────
// Job Matcher AI Agent
//
// Embeds a candidate's resume text using OpenAI text-embedding-3-small then
// performs pgvector cosine similarity search against embedded job listings.
// Falls back to keyword search when embeddings are unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import logger from "../../logger.js";
import prisma from "../../prisma.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EMBEDDING_ENDPOINT =
  process.env.OPENAI_EMBEDDING_ENDPOINT || "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

export interface JobMatch {
  jobId: string;
  title: string;
  company: string;
  location: string;
  type: string;
  seniority: string;
  slug: string;
  score: number;
  matchMethod: "vector" | "keyword";
}

// ── Generate embedding vector for a text string ───────────────────────────────

export async function embedText(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    logger.warn("[job-matcher] OPENAI_API_KEY not set — embeddings unavailable");
    return null;
  }

  try {
    const response = await fetch(EMBEDDING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8192), // model token limit safety
        dimensions: EMBEDDING_DIMS,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embedding API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  } catch (err) {
    logger.error({ err }, "[job-matcher] Failed to generate embedding");
    return null;
  }
}

// ── Store embedding for a user's resume ──────────────────────────────────────

export async function embedUserResume(userId: string, resumeText: string): Promise<void> {
  const vector = await embedText(resumeText);
  if (!vector) return;

  const pgVector = `[${vector.join(",")}]`;

  await prisma.$executeRaw`
    UPDATE "UserResume"
    SET embedding = ${pgVector}::vector
    WHERE "userId" = ${userId}
  `;
}

// ── Find top job matches for a user via vector similarity ─────────────────────

export async function findJobMatches(
  userId: string,
  limit = 10
): Promise<JobMatch[]> {
  // Try vector search first
  try {
    const vectorMatches = await vectorSearch(userId, limit);
    if (vectorMatches.length > 0) return vectorMatches;
  } catch (err) {
    logger.warn({ err }, "[job-matcher] Vector search failed, falling back to keyword");
  }

  // Fallback: keyword search using profile skills
  return keywordFallback(userId, limit);
}

async function vectorSearch(userId: string, limit: number): Promise<JobMatch[]> {
  // Get user's resume embedding
  const resumeRows = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT embedding::text AS embedding
    FROM "UserResume"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  if (!resumeRows[0]?.embedding) return [];

  interface RawJobRow {
    id: string;
    title: string;
    sourceName: string | null;
    location: string;
    type: string;
    seniority: string;
    slug: string;
    score: unknown;
  }

  const rows = await prisma.$queryRaw<RawJobRow[]>`
    SELECT
      j.id,
      j.title,
      j."sourceName",
      j.location,
      j.type,
      j.seniority,
      j.slug,
      1 - (j.embedding <=> ${resumeRows[0].embedding}::vector) AS score
    FROM "Job" j
    WHERE
      j.status = 'PUBLISHED'
      AND j."isExpired" = false
      AND j.embedding IS NOT NULL
    ORDER BY j.embedding <=> ${resumeRows[0].embedding}::vector
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    jobId: r.id,
    title: r.title,
    company: r.sourceName || "Company",
    location: r.location,
    type: r.type,
    seniority: r.seniority,
    slug: r.slug,
    score: Math.round(Number(r.score) * 100),
    matchMethod: "vector" as const,
  }));
}

async function keywordFallback(userId: string, limit: number): Promise<JobMatch[]> {
  // Fetch candidate skills from profile for keyword matching
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    select: { skills: true, targetRoles: true },
  });

  const keywords = [
    ...(profile?.skills || []).slice(0, 5),
    ...(profile?.targetRoles || []).slice(0, 2),
  ];

  if (keywords.length === 0) {
    // No profile — just return latest published jobs
    const latestJobs = await prisma.job.findMany({
      where: { status: "PUBLISHED", isExpired: false },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: { id: true, title: true, sourceName: true, location: true, type: true, seniority: true, slug: true },
    });
    return latestJobs.map((j) => ({
      jobId: j.id,
      title: j.title,
      company: j.sourceName || "Company",
      location: j.location,
      type: j.type,
      seniority: j.seniority,
      slug: j.slug,
      score: 50,
      matchMethod: "keyword" as const,
    }));
  }

  // Simple OR filter on title/description for first keyword
  const jobs = await prisma.job.findMany({
    where: {
      status: "PUBLISHED",
      isExpired: false,
      OR: keywords.map((k) => ({
        title: { contains: k, mode: "insensitive" as const },
      })),
    },
    orderBy: { freshnessScore: "desc" },
    take: limit,
    select: { id: true, title: true, sourceName: true, location: true, type: true, seniority: true, slug: true },
  });

  return jobs.map((j) => ({
    jobId: j.id,
    title: j.title,
    company: j.sourceName || "Company",
    location: j.location,
    type: j.type,
    seniority: j.seniority,
    slug: j.slug,
    score: 60,
    matchMethod: "keyword" as const,
  }));
}

// ── Embed all unembedded published jobs (called by semantic indexer) ──────────

export async function embedPublishedJobs(batchSize = 50): Promise<{ indexed: number; errors: number }> {
  if (!OPENAI_API_KEY) {
    logger.warn("[job-matcher] OPENAI_API_KEY not set — skipping job embedding");
    return { indexed: 0, errors: 0 };
  }

  const jobs = await prisma.$queryRaw<Array<{ id: string; title: string; description: string; tags: string[] }>>`
    SELECT id, title, description, tags
    FROM "Job"
    WHERE status = 'PUBLISHED'
      AND "isExpired" = false
      AND embedding IS NULL
    LIMIT ${batchSize}
  `;

  let indexed = 0;
  let errors = 0;

  for (const job of jobs) {
    const text = [job.title, job.description, (job.tags || []).join(" ")]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8192);

    const vector = await embedText(text);
    if (!vector) {
      errors++;
      continue;
    }

    const pgVector = `[${vector.join(",")}]`;
    try {
      await prisma.$executeRaw`
        UPDATE "Job"
        SET embedding = ${pgVector}::vector
        WHERE id = ${job.id}
      `;
      indexed++;
    } catch (err) {
      logger.error({ err, jobId: job.id }, "[job-matcher] Failed to store job embedding");
      errors++;
    }
  }

  logger.info({ indexed, errors }, "[job-matcher] Job embedding batch complete");
  return { indexed, errors };
}
