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
let vectorSearchAvailable = true;

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
  /**
   * One-line human-readable reason the job surfaced for this candidate.
   * Always deterministic — built from matched keywords/score — never fabricated.
   */
  explanation: string;
  /**
   * True if the linked employer has a trust profile past UNVERIFIED.
   * Scraped/source jobs with no employerId always report `false`.
   */
  verifiedEmployer: boolean;
  // ── Intelligence fields ──────────────────────────────────────────────────────
  /** "YES" | "NO" | "UNKNOWN" */
  visaSponsorship: string;
  /** ISO country codes or region strings eligible for this role. */
  eligibleCountries: string[];
  /** 0–100 risk score for the posting (higher = riskier). */
  riskScore: number;
  /** "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" */
  riskLevel: string;
  /** 0–100 quality score for the posting. */
  qualityScore: number;
  /** "TRUSTED" | "SOLID" | "REVIEW" | "THIN" derived from qualityScore. */
  qualityLabel: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveQualityLabel(score: number): string {
  if (score >= 75) return "TRUSTED";
  if (score >= 50) return "SOLID";
  if (score >= 25) return "REVIEW";
  return "THIN";
}

function buildExplanation(opts: {
  score: number;
  method: "vector" | "keyword";
  matchedKeywords: string[];
  verifiedEmployer: boolean;
  visaSponsorship: string;
  riskLevel: string;
  qualityScore: number;
}): string {
  const { score, method, matchedKeywords, verifiedEmployer, visaSponsorship, riskLevel, qualityScore } = opts;
  const topKeywords = matchedKeywords.slice(0, 3).filter(Boolean);
  const parts: string[] = [];

  if (method === "vector") {
    parts.push(
      score >= 80
        ? "Strong semantic match to your resume"
        : score >= 60
        ? "Good semantic alignment with your resume"
        : "Partial semantic match to your resume"
    );
  } else {
    parts.push(
      topKeywords.length > 0
        ? `Matches your skills: ${topKeywords.join(", ")}`
        : "Recent opening aligned with your target role"
    );
  }

  if (verifiedEmployer) parts.push("verified employer");
  if (visaSponsorship === "YES") parts.push("visa sponsorship available");
  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") parts.push("warning: elevated risk signals detected");
  if (qualityScore >= 75) parts.push("high-quality posting with strong employer signals");
  return parts.join(" · ");
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

  try {
    await prisma.$executeRaw`
      UPDATE "UserResume"
      SET embedding = ${pgVector}::vector
      WHERE "userId" = ${userId}
    `;
  } catch (err) {
    logger.warn({ err, userId }, "[job-matcher] Resume vector column unavailable; keyword matching remains active");
  }
}

// ── Find top job matches for a user via vector similarity ─────────────────────

export async function findJobMatches(
  userId: string,
  limit = 10
): Promise<JobMatch[]> {
  // Try vector search first
  if (vectorSearchAvailable) {
    try {
      const vectorMatches = await vectorSearch(userId, limit);
      if (vectorMatches.length > 0) return vectorMatches;
    } catch (err) {
      vectorSearchAvailable = false;
      logger.warn({ err }, "[job-matcher] Vector search failed, falling back to keyword");
    }
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
    verificationLevel: string | null;
    matchedTags: string[] | null;
    riskScore: unknown;
    riskLevel: string | null;
    qualityScore: unknown;
    freshnessScore: unknown;
    visaSponsorship: string | null;
    eligibleCountries: string[] | null;
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
      1 - (j.embedding <=> ${resumeRows[0].embedding}::vector) AS score,
      etp."verificationLevel"::text AS "verificationLevel",
      j.tags AS "matchedTags",
      j."riskScore",
      j."riskLevel"::text AS "riskLevel",
      j."qualityScore",
      j."freshnessScore",
      j."visaSponsorship"::text AS "visaSponsorship",
      j."eligibleCountries"
    FROM "Job" j
    LEFT JOIN "Employer" e ON e.id = j."employerId"
    LEFT JOIN "EmployerTrustProfile" etp ON etp."employerId" = e.id
    WHERE
      j.status = 'PUBLISHED'
      AND j."isExpired" = false
      AND j.embedding IS NOT NULL
    ORDER BY j.embedding <=> ${resumeRows[0].embedding}::vector
    LIMIT ${limit}
  `;

  return rows.map((r) => {
    const score = Math.round(Number(r.score) * 100);
    const verifiedEmployer =
      !!r.verificationLevel && r.verificationLevel !== "UNVERIFIED";
    const riskScore = Number(r.riskScore) || 0;
    const riskLevel = r.riskLevel || "LOW";
    const qualityScore = Number(r.qualityScore) || 0;
    const visaSponsorship = r.visaSponsorship || "UNKNOWN";
    const eligibleCountries = Array.isArray(r.eligibleCountries) ? r.eligibleCountries : [];
    return {
      jobId: r.id,
      title: r.title,
      company: r.sourceName || "Company",
      location: r.location,
      type: r.type,
      seniority: r.seniority,
      slug: r.slug,
      score,
      matchMethod: "vector" as const,
      verifiedEmployer,
      explanation: buildExplanation({
        score,
        method: "vector",
        matchedKeywords: Array.isArray(r.matchedTags) ? r.matchedTags : [],
        verifiedEmployer,
        visaSponsorship,
        riskLevel,
        qualityScore,
      }),
      visaSponsorship,
      eligibleCountries,
      riskScore,
      riskLevel,
      qualityScore,
      qualityLabel: deriveQualityLabel(qualityScore),
    };
  });
}

async function keywordFallback(userId: string, limit: number): Promise<JobMatch[]> {
  // Fetch candidate skills from profile for keyword matching
  const [profile, resume] = await Promise.all([
    prisma.candidateProfile.findUnique({
      where: { userId },
      select: { skills: true, targetRoles: true },
    }),
    prisma.userResume.findUnique({
      where: { userId },
      select: { rawText: true },
    }),
  ]);

  const keywords = [
    ...(profile?.skills || []).slice(0, 5),
    ...(profile?.targetRoles || []).slice(0, 2),
    ...extractResumeKeywords(resume?.rawText || "").slice(0, 8),
  ].map(normalizeKeyword).filter(Boolean);
  const uniqueKeywords = Array.from(new Set(keywords));

  const employerSelect = {
    trustProfile: { select: { verificationLevel: true } },
  };
  const baseSelect = {
    id: true,
    title: true,
    sourceName: true,
    location: true,
    type: true,
    seniority: true,
    slug: true,
    tags: true,
    riskScore: true,
    riskLevel: true,
    qualityScore: true,
    freshnessScore: true,
    visaSponsorship: true,
    eligibleCountries: true,
    employer: { select: employerSelect },
  };

  if (uniqueKeywords.length === 0) {
    // No profile — just return latest published jobs
    const latestJobs = await prisma.job.findMany({
      where: { status: "PUBLISHED", isExpired: false },
      orderBy: { publishedAt: "desc" },
      take: limit,
      select: baseSelect,
    });
    return latestJobs.map((j) => {
      const verifiedEmployer =
        !!j.employer?.trustProfile?.verificationLevel &&
        j.employer.trustProfile.verificationLevel !== "UNVERIFIED";
      const riskScore = j.riskScore ?? 0;
      const riskLevel = String(j.riskLevel ?? "LOW");
      const qualityScore = j.qualityScore ?? 0;
      const visaSponsorship = String(j.visaSponsorship ?? "UNKNOWN");
      const eligibleCountries = Array.isArray(j.eligibleCountries) ? (j.eligibleCountries as string[]) : [];
      return {
        jobId: j.id,
        title: j.title,
        company: j.sourceName || "Company",
        location: j.location,
        type: j.type,
        seniority: j.seniority,
        slug: j.slug,
        score: 50,
        matchMethod: "keyword" as const,
        verifiedEmployer,
        explanation: buildExplanation({
          score: 50,
          method: "keyword",
          matchedKeywords: [],
          verifiedEmployer,
          visaSponsorship,
          riskLevel,
          qualityScore,
        }),
        visaSponsorship,
        eligibleCountries,
        riskScore,
        riskLevel,
        qualityScore,
        qualityLabel: deriveQualityLabel(qualityScore),
      };
    });
  }

  // Fetch a broad but bounded pool, then rank deterministically against the
  // candidate's target roles, skills, and resume language. This avoids hard
  // failures when pgvector is unavailable and avoids weak one-word title matches.
  const jobs = await prisma.job.findMany({
    where: {
      status: "PUBLISHED",
      isExpired: false,
      OR: uniqueKeywords.flatMap((k) => [
        { title: { contains: k, mode: "insensitive" as const } },
        { description: { contains: k, mode: "insensitive" as const } },
        { tags: { has: k } },
      ]),
    },
    orderBy: [
      { freshnessScore: "desc" },
      { publishedAt: "desc" },
    ],
    take: Math.max(limit * 8, 80),
    select: baseSelect,
  });

  return jobs.map((j) => {
    const verifiedEmployer =
      !!j.employer?.trustProfile?.verificationLevel &&
      j.employer.trustProfile.verificationLevel !== "UNVERIFIED";
    const ranked = scoreKeywordJob(j, uniqueKeywords, profile?.targetRoles || []);
    const matched = ranked.matched;
    const riskScore = j.riskScore ?? 0;
    const riskLevel = String(j.riskLevel ?? "LOW");
    const qualityScore = j.qualityScore ?? 0;
    const visaSponsorship = String(j.visaSponsorship ?? "UNKNOWN");
    const eligibleCountries = Array.isArray(j.eligibleCountries) ? (j.eligibleCountries as string[]) : [];
    return {
      jobId: j.id,
      title: j.title,
      company: j.sourceName || "Company",
      location: j.location,
      type: j.type,
      seniority: j.seniority,
      slug: j.slug,
      score: ranked.score,
      matchMethod: "keyword" as const,
      verifiedEmployer,
      explanation: buildExplanation({
        score: 60,
        method: "keyword",
        matchedKeywords: matched,
        verifiedEmployer,
        visaSponsorship,
        riskLevel,
        qualityScore,
      }),
      visaSponsorship,
      eligibleCountries,
      riskScore,
      riskLevel,
      qualityScore,
      qualityLabel: deriveQualityLabel(qualityScore),
    };
  })
    .filter((match) => match.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const MATCH_STOP_WORDS = new Set([
  "and", "the", "for", "with", "from", "that", "this", "your", "you", "are",
  "will", "have", "role", "work", "team", "using", "about", "into",
]);

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeMatchText(value: string): string[] {
  return Array.from(new Set(
    normalizeKeyword(value)
      .split(" ")
      .filter((token) => token.length > 2 && !MATCH_STOP_WORDS.has(token)),
  ));
}

function extractResumeKeywords(rawText: string): string[] {
  const tokens = tokenizeMatchText(rawText);
  const priority = [
    "typescript", "javascript", "react", "node", "python", "aws", "azure", "gcp",
    "docker", "kubernetes", "terraform", "postgres", "sql", "devops", "security",
    "cloud", "data", "machine", "learning", "frontend", "backend", "fullstack",
  ];
  return priority.filter((token) => tokens.includes(token));
}

function scoreKeywordJob(
  job: { title: string; description?: string | null; tags: string[]; qualityScore?: number | null; freshnessScore?: number | null },
  keywords: string[],
  targetRoles: string[],
): { score: number; matched: string[] } {
  const title = normalizeKeyword(job.title);
  const description = normalizeKeyword(job.description || "");
  const tags = (job.tags || []).map(normalizeKeyword);
  const titleTokens = new Set(tokenizeMatchText(title));
  const descriptionTokens = new Set(tokenizeMatchText(description));
  const tagSet = new Set(tags.flatMap(tokenizeMatchText));
  const matched = keywords.filter((keyword) => {
    const parts = tokenizeMatchText(keyword);
    return title.includes(keyword) ||
      tags.includes(keyword) ||
      parts.some((part) => titleTokens.has(part) || tagSet.has(part) || descriptionTokens.has(part));
  });
  const titleHits = matched.filter((keyword) => {
    const parts = tokenizeMatchText(keyword);
    return title.includes(keyword) || parts.some((part) => titleTokens.has(part));
  }).length;
  const targetRoleHit = targetRoles.some((role) => {
    const normalizedRole = normalizeKeyword(role);
    const roleParts = tokenizeMatchText(role);
    return title.includes(normalizedRole) || roleParts.some((part) => titleTokens.has(part));
  });
  const base = Math.min(70, matched.length * 10);
  const titleBoost = Math.min(25, titleHits * 8);
  const roleBoost = targetRoleHit ? 18 : 0;
  const qualityBoost = Math.round(((job.qualityScore ?? 0) / 100) * 8);
  const freshnessBoost = Math.round(((job.freshnessScore ?? 0) / 100) * 6);
  return {
    score: Math.max(35, Math.min(100, base + titleBoost + roleBoost + qualityBoost + freshnessBoost)),
    matched: matched.slice(0, 5),
  };
}

// ── Embed all unembedded published jobs (called by semantic indexer) ──────────

export async function embedPublishedJobs(batchSize = 50): Promise<{ indexed: number; errors: number }> {
  if (!OPENAI_API_KEY) {
    logger.warn("[job-matcher] OPENAI_API_KEY not set — skipping job embedding");
    return { indexed: 0, errors: 0 };
  }

  let jobs: Array<{ id: string; title: string; description: string; tags: string[] }>;
  try {
    jobs = await prisma.$queryRaw<Array<{ id: string; title: string; description: string; tags: string[] }>>`
      SELECT id, title, description, tags
      FROM "Job"
      WHERE status = 'PUBLISHED'
        AND "isExpired" = false
        AND embedding IS NULL
      LIMIT ${batchSize}
    `;
  } catch (err) {
    logger.warn({ err }, "[job-matcher] Job vector column unavailable; skipping semantic indexing");
    return { indexed: 0, errors: 0 };
  }

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
