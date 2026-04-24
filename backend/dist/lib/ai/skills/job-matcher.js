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
const EMBEDDING_ENDPOINT = process.env.OPENAI_EMBEDDING_ENDPOINT || "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveQualityLabel(score) {
    if (score >= 75)
        return "TRUSTED";
    if (score >= 50)
        return "SOLID";
    if (score >= 25)
        return "REVIEW";
    return "THIN";
}
function buildExplanation(opts) {
    const { score, method, matchedKeywords, verifiedEmployer, visaSponsorship, riskLevel, qualityScore } = opts;
    const topKeywords = matchedKeywords.slice(0, 3).filter(Boolean);
    const parts = [];
    if (method === "vector") {
        parts.push(score >= 80
            ? "Strong semantic match to your resume"
            : score >= 60
                ? "Good semantic alignment with your resume"
                : "Partial semantic match to your resume");
    }
    else {
        parts.push(topKeywords.length > 0
            ? `Matches your skills: ${topKeywords.join(", ")}`
            : "Recent opening aligned with your target role");
    }
    if (verifiedEmployer)
        parts.push("verified employer");
    if (visaSponsorship === "YES")
        parts.push("visa sponsorship available");
    if (riskLevel === "HIGH" || riskLevel === "CRITICAL")
        parts.push("warning: elevated risk signals detected");
    if (qualityScore >= 75)
        parts.push("high-quality posting with strong employer signals");
    return parts.join(" · ");
}
// ── Generate embedding vector for a text string ───────────────────────────────
export async function embedText(text) {
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
        const data = (await response.json());
        return data.data[0].embedding;
    }
    catch (err) {
        logger.error({ err }, "[job-matcher] Failed to generate embedding");
        return null;
    }
}
// ── Store embedding for a user's resume ──────────────────────────────────────
export async function embedUserResume(userId, resumeText) {
    const vector = await embedText(resumeText);
    if (!vector)
        return;
    const pgVector = `[${vector.join(",")}]`;
    await prisma.$executeRaw `
    UPDATE "UserResume"
    SET embedding = ${pgVector}::vector
    WHERE "userId" = ${userId}
  `;
}
// ── Find top job matches for a user via vector similarity ─────────────────────
export async function findJobMatches(userId, limit = 10) {
    // Try vector search first
    try {
        const vectorMatches = await vectorSearch(userId, limit);
        if (vectorMatches.length > 0)
            return vectorMatches;
    }
    catch (err) {
        logger.warn({ err }, "[job-matcher] Vector search failed, falling back to keyword");
    }
    // Fallback: keyword search using profile skills
    return keywordFallback(userId, limit);
}
async function vectorSearch(userId, limit) {
    // Get user's resume embedding
    const resumeRows = await prisma.$queryRaw `
    SELECT embedding::text AS embedding
    FROM "UserResume"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;
    if (!resumeRows[0]?.embedding)
        return [];
    const rows = await prisma.$queryRaw `
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
        const verifiedEmployer = !!r.verificationLevel && r.verificationLevel !== "UNVERIFIED";
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
            matchMethod: "vector",
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
async function keywordFallback(userId, limit) {
    // Fetch candidate skills from profile for keyword matching
    const profile = await prisma.candidateProfile.findUnique({
        where: { userId },
        select: { skills: true, targetRoles: true },
    });
    const keywords = [
        ...(profile?.skills || []).slice(0, 5),
        ...(profile?.targetRoles || []).slice(0, 2),
    ];
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
    if (keywords.length === 0) {
        // No profile — just return latest published jobs
        const latestJobs = await prisma.job.findMany({
            where: { status: "PUBLISHED", isExpired: false },
            orderBy: { publishedAt: "desc" },
            take: limit,
            select: baseSelect,
        });
        return latestJobs.map((j) => {
            const verifiedEmployer = !!j.employer?.trustProfile?.verificationLevel &&
                j.employer.trustProfile.verificationLevel !== "UNVERIFIED";
            const riskScore = j.riskScore ?? 0;
            const riskLevel = String(j.riskLevel ?? "LOW");
            const qualityScore = j.qualityScore ?? 0;
            const visaSponsorship = String(j.visaSponsorship ?? "UNKNOWN");
            const eligibleCountries = Array.isArray(j.eligibleCountries) ? j.eligibleCountries : [];
            return {
                jobId: j.id,
                title: j.title,
                company: j.sourceName || "Company",
                location: j.location,
                type: j.type,
                seniority: j.seniority,
                slug: j.slug,
                score: 50,
                matchMethod: "keyword",
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
    // Simple OR filter on title/description for first keyword
    const jobs = await prisma.job.findMany({
        where: {
            status: "PUBLISHED",
            isExpired: false,
            OR: keywords.map((k) => ({
                title: { contains: k, mode: "insensitive" },
            })),
        },
        orderBy: { freshnessScore: "desc" },
        take: limit,
        select: baseSelect,
    });
    return jobs.map((j) => {
        const verifiedEmployer = !!j.employer?.trustProfile?.verificationLevel &&
            j.employer.trustProfile.verificationLevel !== "UNVERIFIED";
        const matched = keywords.filter((k) => j.title.toLowerCase().includes(k.toLowerCase()));
        const riskScore = j.riskScore ?? 0;
        const riskLevel = String(j.riskLevel ?? "LOW");
        const qualityScore = j.qualityScore ?? 0;
        const visaSponsorship = String(j.visaSponsorship ?? "UNKNOWN");
        const eligibleCountries = Array.isArray(j.eligibleCountries) ? j.eligibleCountries : [];
        return {
            jobId: j.id,
            title: j.title,
            company: j.sourceName || "Company",
            location: j.location,
            type: j.type,
            seniority: j.seniority,
            slug: j.slug,
            score: 60,
            matchMethod: "keyword",
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
    });
}
// ── Embed all unembedded published jobs (called by semantic indexer) ──────────
export async function embedPublishedJobs(batchSize = 50) {
    if (!OPENAI_API_KEY) {
        logger.warn("[job-matcher] OPENAI_API_KEY not set — skipping job embedding");
        return { indexed: 0, errors: 0 };
    }
    const jobs = await prisma.$queryRaw `
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
            await prisma.$executeRaw `
        UPDATE "Job"
        SET embedding = ${pgVector}::vector
        WHERE id = ${job.id}
      `;
            indexed++;
        }
        catch (err) {
            logger.error({ err, jobId: job.id }, "[job-matcher] Failed to store job embedding");
            errors++;
        }
    }
    logger.info({ indexed, errors }, "[job-matcher] Job embedding batch complete");
    return { indexed, errors };
}
//# sourceMappingURL=job-matcher.js.map